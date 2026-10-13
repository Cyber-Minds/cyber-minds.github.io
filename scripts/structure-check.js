'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.lastIndexOf(name);
  return index === -1 ? null : args[index + 1];
};

const repoRoot = path.resolve(option('--root') || path.join(__dirname, '..'));
const changedFrom = option('--changed-from');
const allowlistPath = path.resolve(
  option('--allowlist') || path.join(repoRoot, 'scripts', 'structure-allowlist.json')
);

function relative(file) {
  return path.relative(repoRoot, file).split(path.sep).join('/');
}

function allHtmlFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) allHtmlFiles(fullPath, files);
    else if (entry.name.endsWith('.html')) files.push(fullPath);
  }
  return files.sort();
}

function changedHtmlFiles(base) {
  const output = execFileSync(
    'git',
    ['diff', '--name-only', '--diff-filter=ACMR', base, '--', '*.html'],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((file) => path.join(repoRoot, file))
    .filter((file) => fs.existsSync(file))
    .sort();
}

function lineAt(lineStarts, offset) {
  let low = 0;
  let high = lineStarts.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (lineStarts[middle] <= offset) low = middle + 1;
    else high = middle;
  }
  return low;
}

function parseAttributes(source) {
  const attributes = new Map();
  const attributeRe = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = attributeRe.exec(source)) !== null) {
    const name = match[1].toLowerCase();
    if (!attributes.has(name)) attributes.set(name, match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function scriptKey(source, file) {
  const clean = source.trim().split(/[?#]/, 1)[0];
  if (!clean || clean.includes('{{') || clean.includes('${')) return null;
  if (/^[a-z][a-z\d+.-]*:/i.test(clean)) {
    try {
      const url = new URL(clean);
      return `${url.protocol}//${url.host}${url.pathname}`;
    } catch {
      return clean;
    }
  }
  const decoded = decodeURIComponentSafe(clean);
  const pagePath = relative(file);
  return decoded.startsWith('/')
    ? path.posix.normalize(decoded.slice(1))
    : path.posix.normalize(path.posix.join(path.posix.dirname(pagePath), decoded));
}

function exceptionKey(file, rule, signature = '') {
  return `${file}::${rule}::${signature}`;
}

function loadExceptions() {
  if (!fs.existsSync(allowlistPath)) return new Map();
  const parsed = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));
  const exceptions = new Map();
  for (const entry of parsed.exceptions || []) {
    if (!entry.owner?.trim() || !entry.reason?.trim() || !entry.rule || !Array.isArray(entry.files)) {
      throw new Error('Every structural exception requires owner, reason, rule, and files.');
    }
    const expected = entry.expectedOccurrences || 1;
    if (!Number.isInteger(expected) || expected < 1) {
      throw new Error('Structural exception expectedOccurrences must be a positive integer.');
    }
    for (const file of entry.files) {
      const key = exceptionKey(file, entry.rule, entry.signature || '');
      if (exceptions.has(key)) throw new Error(`Duplicate structural exception: ${file} (${entry.rule}).`);
      exceptions.set(key, { ...entry, expectedOccurrences: expected, usedOccurrences: 0 });
    }
  }
  return exceptions;
}

function scanFile(file, exceptions) {
  const content = fs.readFileSync(file, 'utf8');
  const lineStarts = [0];
  for (let index = 0; index < content.length; index += 1) {
    if (content.charCodeAt(index) === 10) lineStarts.push(index + 1);
  }

  let htmlRoots = 0;
  let seenHead = false;
  let closedHead = false;
  let seenBody = false;
  let closedBody = false;
  let anchorOpen = false;
  const scripts = new Set();
  const rawTextTags = new Set(['script', 'style']);
  let index = 0;

  while (index < content.length) {
    if (content[index] !== '<') {
      index += 1;
      continue;
    }
    if (content.startsWith('<!--', index)) {
      const commentEnd = content.indexOf('-->', index + 4);
      index = commentEnd === -1 ? content.length : commentEnd + 3;
      continue;
    }
    if (/^<!|^<\?/i.test(content.slice(index, index + 2))) {
      const declarationEnd = content.indexOf('>', index + 2);
      index = declarationEnd === -1 ? content.length : declarationEnd + 1;
      continue;
    }

    const opening = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9:-]*)\b/.exec(content.slice(index));
    if (!opening) {
      index += 1;
      continue;
    }

    const tagName = opening[2].toLowerCase();
    const closing = opening[1] === '/';
    const tagStart = index;
    let end = index + opening[0].length;
    let quote = null;
    while (end < content.length) {
      const character = content[end];
      if (quote) {
        if (character === quote) quote = null;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '>') {
        break;
      }
      end += 1;
    }
    if (end >= content.length) break;

    const issue = (rule, message, signature = '') => {
      const relFile = relative(file);
      const key = exceptionKey(relFile, rule, signature);
      const exception = exceptions.get(key);
      if (exception && exception.usedOccurrences < exception.expectedOccurrences) {
        exception.usedOccurrences += 1;
        return null;
      }
      return { file: relFile, line: lineAt(lineStarts, tagStart), message };
    };
    if (!closing) {
      if (tagName === 'html') {
        htmlRoots += 1;
        if (htmlRoots > 1) {
          const finding = issue('duplicate-html-root', 'duplicate <html> document root');
          if (finding) return finding;
        }
      } else if (tagName === 'head') {
        if (seenHead || seenBody) {
          const rule = seenHead ? 'duplicate-head' : 'misplaced-head';
          const finding = issue(rule, 'duplicate or misplaced <head> tag inside page content');
          if (finding) return finding;
        }
        seenHead = true;
      } else if (tagName === 'body') {
        if (seenBody || (seenHead && !closedHead)) {
          const rule = seenBody ? 'duplicate-body' : 'misplaced-body';
          const finding = issue(rule, 'duplicate or misplaced <body> tag inside page content');
          if (finding) return finding;
        }
        seenBody = true;
      } else if (tagName === 'a') {
        if (anchorOpen) {
          const finding = issue('nested-anchor', 'nested <a> anchor; close the outer anchor before opening another');
          if (finding) return finding;
        }
        anchorOpen = true;
      } else if (tagName === 'script') {
        const attributes = parseAttributes(content.slice(index + opening[0].length, end));
        const source = attributes.get('src');
        if (source !== undefined) {
          const key = scriptKey(source, file);
          if (key !== null && scripts.has(key)) {
            const finding = issue('duplicate-script', 'duplicate script inclusion', key);
            if (finding) return finding;
          }
          if (key !== null) scripts.add(key);
        }
      }
    } else if (tagName === 'head') {
      if (!seenHead || closedHead || seenBody) {
        const finding = issue('misplaced-head-close', 'misplaced </head> tag inside page content');
        if (finding) return finding;
      }
      closedHead = true;
    } else if (tagName === 'body') {
      if (!seenBody || closedBody) {
        const finding = issue('misplaced-body-close', 'misplaced </body> tag inside page content');
        if (finding) return finding;
      }
      closedBody = true;
    } else if (tagName === 'a') {
      anchorOpen = false;
    }

    index = end + 1;
    if (!closing && rawTextTags.has(tagName)) {
      const closeRe = new RegExp(`<\\s*\\/\\s*${tagName}\\s*>`, 'ig');
      closeRe.lastIndex = index;
      const closeMatch = closeRe.exec(content);
      if (!closeMatch) break;
      index = closeMatch.index;
    }
  }
  return null;
}

const files = (changedFrom ? changedHtmlFiles(changedFrom) : allHtmlFiles(repoRoot)).filter(
  (file) => !file.includes(`${path.sep}.git${path.sep}`) && !file.includes(`${path.sep}node_modules${path.sep}`)
);
const exceptions = loadExceptions();
const findings = files.map((file) => scanFile(file, exceptions)).filter(Boolean);
const scannedFiles = new Set(files.map(relative));
for (const [key, exception] of exceptions) {
  const file = key.split('::', 1)[0];
  if (scannedFiles.has(file) && exception.usedOccurrences !== exception.expectedOccurrences) {
    findings.push({
      file,
      line: 1,
      message: `stale or under-counted owned exception for ${exception.rule}; remove or update it`,
    });
  }
}

if (findings.length) {
  console.error(
    `HTML structure check found ${findings.length} violation(s):\n${findings
      .map(({ file, line, message }) => `${file}:${line}: ${message}`)
      .join('\n')}`
  );
  process.exitCode = 1;
} else {
  console.log(`HTML structure check passed for ${files.length} file(s).`);
}