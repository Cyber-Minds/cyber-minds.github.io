'use strict';

/**
 * Structural HTML validation for learner-facing pages.
 *
 * Why this exists: the link, title, and alt-text checks in qa-static.js are
 * regex-based and only look at individual attributes. A page can pass all of
 * them while still containing markup that changes how a browser builds the
 * DOM -- a second <body> halfway down a lesson, an <a> nested inside another
 * <a>, a stray </head> in copied content, or footer.js pulled in twice. None
 * of those produce a broken local URL, so nothing currently catches them, but
 * they do break navigation and assistive-technology traversal once GitHub
 * Pages serves the file.
 *
 * Rules enforced (ids are stable; exceptions reference them):
 *   duplicate-document-root   second <!DOCTYPE>, <html>, <head>, or <body>
 *   misplaced-document-tag    one of those tags nested inside page content
 *   nested-anchor             <a> opened while another <a> is still open
 *   duplicate-script          same script src included more than once
 *
 * Deliberately NOT a browser: this walks repository bytes with a tokenizer and
 * never fetches a URL, never evaluates a <script>, and never inspects anything
 * outside the repo root.
 *
 * Usage:
 *   node scripts/html-structure.js                      # whole repo
 *   node scripts/html-structure.js --changed-from main  # changed pages only
 *   node scripts/html-structure.js --all                # every violation
 *   node scripts/html-structure.js --root <dir>         # alternate root
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.lastIndexOf(name);
  return index === -1 ? null : args[index + 1];
};
const flag = (name) => args.includes(name);

const repoRoot = path.resolve(option('--root') || path.join(__dirname, '..'));
const reportAll = flag('--all');

/* ------------------------------------------------------------------ *
 * Element tables
 * ------------------------------------------------------------------ */

// Never pushed onto the open-element stack.
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
  'meta', 'param', 'source', 'track', 'wbr',
]);

// Content is text, not markup: a "<a>" inside a script string or a CSS
// selector must not be tokenized as a tag.
const RAW_TEXT_ELEMENTS = new Set(['script', 'style', 'textarea', 'title']);

// Tags whose end tag is optional in HTML. Legacy lesson pages omit these
// constantly, so the stack machine closes them implicitly rather than
// reporting the resulting imbalance as a structural defect.
const CLOSES_ON_START = {
  li: ['li'],
  dt: ['dt', 'dd'],
  dd: ['dt', 'dd'],
  option: ['option'],
  optgroup: ['option', 'optgroup'],
  tr: ['td', 'th', 'tr'],
  td: ['td', 'th'],
  th: ['td', 'th'],
  thead: ['td', 'th', 'tr'],
  tbody: ['td', 'th', 'tr', 'thead'],
  tfoot: ['td', 'th', 'tr', 'tbody', 'thead'],
  rt: ['rt', 'rp'],
  rp: ['rt', 'rp'],
};

// Block-level starts that implicitly close an open <p>.
const CLOSES_PARAGRAPH = new Set([
  'address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'main', 'nav', 'ol', 'p',
  'pre', 'section', 'table', 'ul',
]);

// Tags that may only appear at the top of a document.
const DOCUMENT_TAGS = new Set(['html', 'head', 'body']);

/* ------------------------------------------------------------------ *
 * Tokenizer
 * ------------------------------------------------------------------ */

/**
 * Walk HTML source into a flat token list, tracking 1-based line numbers.
 *
 * Handles the cases a regex gets wrong: comments, CDATA, doctype, processing
 * instructions, `>` inside a quoted attribute value, and raw-text element
 * bodies.
 *
 * @param {string} content
 * @returns {Array<object>} tokens of shape
 *   `{type, name, line}` plus `attrs` and `selfClosing` on start tags
 */
function tokenize(content) {
  const tokens = [];
  const len = content.length;
  let i = 0;
  let line = 1;

  // Move the cursor to `to`, counting newlines crossed so `line` stays true.
  const advance = (to) => {
    const target = Math.min(Math.max(to, i), len);
    for (let j = i; j < target; j += 1) {
      if (content[j] === '\n') line += 1;
    }
    i = target;
  };

  while (i < len) {
    const lt = content.indexOf('<', i);
    if (lt === -1) break;
    advance(lt);
    const startLine = line;

    if (content.startsWith('<!--', i)) {
      const end = content.indexOf('-->', i + 4);
      advance(end === -1 ? len : end + 3);
      continue;
    }

    if (content.startsWith('<![CDATA[', i)) {
      const end = content.indexOf(']]>', i + 9);
      advance(end === -1 ? len : end + 3);
      continue;
    }

    if (/^<!doctype\b/i.test(content.slice(i, i + 10))) {
      const end = content.indexOf('>', i);
      tokens.push({ type: 'doctype', name: '!doctype', line: startLine });
      advance(end === -1 ? len : end + 1);
      continue;
    }

    // Other declarations / processing instructions carry no structure.
    if (content.startsWith('<!', i) || content.startsWith('<?', i)) {
      const end = content.indexOf('>', i);
      advance(end === -1 ? len : end + 1);
      continue;
    }

    if (content.startsWith('</', i)) {
      const end = content.indexOf('>', i);
      const raw = content.slice(i + 2, end === -1 ? len : end);
      const name = raw.trim().toLowerCase().split(/[\s/]/)[0];
      if (name) tokens.push({ type: 'end', name, line: startLine });
      advance(end === -1 ? len : end + 1);
      continue;
    }

    const nameMatch = /^<([a-zA-Z][a-zA-Z0-9:._-]*)/.exec(content.slice(i));
    if (!nameMatch) {
      // A bare "<" in text content.
      advance(i + 1);
      continue;
    }
    const name = nameMatch[1].toLowerCase();

    // Find the closing ">" while respecting quoted attribute values.
    let cursor = i + nameMatch[0].length;
    let quote = null;
    while (cursor < len) {
      const ch = content[cursor];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        break;
      }
      cursor += 1;
    }

    const attrs = content.slice(i + nameMatch[0].length, cursor);
    const selfClosing = /\/\s*$/.test(attrs);
    tokens.push({ type: 'start', name, attrs, line: startLine, selfClosing });
    advance(cursor + 1);

    // Skip raw-text bodies so their contents are never read as markup.
    if (RAW_TEXT_ELEMENTS.has(name) && !selfClosing) {
      const closeRe = new RegExp(`</${name}\\s*>`, 'i');
      const match = closeRe.exec(content.slice(i));
      advance(match ? i + match.index : len);
    }
  }

  return tokens;
}

/* ------------------------------------------------------------------ *
 * Structural analysis
 * ------------------------------------------------------------------ */

function getAttribute(attrs, attrName) {
  const re = new RegExp(
    `\\b${attrName}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`,
    'i'
  );
  const match = re.exec(attrs || '');
  if (!match) return null;

  // Groups 2/3/4 are the double-quoted, single-quoted, and bare forms.
  const candidates = [match[2], match[3], match[4]];
  const value = candidates.find((group) => group !== undefined);
  return value || '';
}

/**
 * Canonical identity for a script reference, so two spellings of the same
 * file compare equal (`../Javascript/footer.js` vs `/Javascript/footer.js`).
 * Query strings and fragments are stripped; cache-busting a second copy in
 * is still a double include.
 */
function canonicalScriptKey(file, src) {
  const clean = String(src).trim().split(/[?#]/, 1)[0];
  if (!clean) return null;
  if (/^(data|blob|javascript):/i.test(clean)) return null;

  if (/^https?:\/\//i.test(clean) || clean.startsWith('//')) {
    try {
      const url = new URL(clean.startsWith('//') ? `https:${clean}` : clean);
      return `${url.host}${url.pathname}`.toLowerCase();
    } catch {
      return clean.toLowerCase();
    }
  }

  const resolved = clean.startsWith('/')
    ? path.resolve(repoRoot, `.${clean}`)
    : path.resolve(path.dirname(file), clean);
  return path.relative(repoRoot, resolved).split(path.sep).join('/').toLowerCase();
}

/**
 * Collect structural violations for one file.
 *
 * @param {string} file absolute path
 * @param {string} content file source
 * @returns {Array<{rule: string, line: number, message: string}>} in document order
 */
function analyze(file, content) {
  const tokens = tokenize(content);
  const violations = [];
  const stack = [];
  const seenDocumentTags = new Map(); // tag -> first line
  const seenScripts = new Map(); // canonical key -> first line

  const add = (rule, line, message) => {
    violations.push({ rule, line, message });
  };

  const closeImplied = (startName) => {
    const implied = CLOSES_ON_START[startName];
    if (implied) {
      while (stack.length && implied.includes(stack[stack.length - 1].name)) {
        stack.pop();
      }
    }
    if (CLOSES_PARAGRAPH.has(startName)) {
      while (stack.length && stack[stack.length - 1].name === 'p') {
        stack.pop();
      }
    }
  };

  for (const token of tokens) {
    if (token.type === 'doctype') {
      const first = seenDocumentTags.get('!doctype');
      if (first !== undefined) {
        add(
          'duplicate-document-root',
          token.line,
          `second <!DOCTYPE> declaration (first on line ${first})`
        );
      } else {
        seenDocumentTags.set('!doctype', token.line);
        if (stack.length) {
          add(
            'misplaced-document-tag',
            token.line,
            `<!DOCTYPE> inside <${stack[stack.length - 1].name}> content`
          );
        }
      }
      continue;
    }

    if (token.type === 'end') {
      const index = stack.map((entry) => entry.name).lastIndexOf(token.name);
      if (index !== -1) {
        stack.length = index;
      }
      // A stray end tag with no matching open element is tolerated: legacy
      // pages contain them and browsers ignore them without reparenting.
      continue;
    }

    // token.type === 'start'
    const { name, line } = token;

    if (DOCUMENT_TAGS.has(name)) {
      const first = seenDocumentTags.get(name);
      if (first !== undefined) {
        add(
          'duplicate-document-root',
          line,
          `second <${name}> element (first on line ${first})`
        );
      } else {
        seenDocumentTags.set(name, line);
        // <html> belongs at the root; <head>/<body> directly inside <html>.
        const allowedParents = name === 'html' ? [] : ['html'];
        const parent = stack.length ? stack[stack.length - 1].name : null;
        const misplaced = parent !== null && !allowedParents.includes(parent);
        if (misplaced) {
          add(
            'misplaced-document-tag',
            line,
            `<${name}> nested inside <${parent}> content`
          );
        }
      }
    }

    if (name === 'a') {
      const open = stack.find((entry) => entry.name === 'a');
      if (open) {
        add(
          'nested-anchor',
          line,
          `<a> opened inside the <a> still open from line ${open.line}`
        );
      }
    }

    if (name === 'script') {
      const src = getAttribute(token.attrs, 'src');
      if (src) {
        const key = canonicalScriptKey(file, src);
        if (key) {
          const first = seenScripts.get(key);
          if (first !== undefined) {
            add(
              'duplicate-script',
              line,
              `script "${key}" already included on line ${first}`
            );
          } else {
            seenScripts.set(key, line);
          }
        }
      }
    }

    closeImplied(name);
    if (!VOID_ELEMENTS.has(name) && !token.selfClosing) {
      stack.push({ name, line });
    }
  }

  return violations;
}

/* ------------------------------------------------------------------ *
 * Exceptions
 * ------------------------------------------------------------------ */

const EXCEPTIONS_FILE = path.join(__dirname, 'html-structure-exceptions.json');
const VALID_RULES = new Set([
  'duplicate-document-root',
  'misplaced-document-tag',
  'nested-anchor',
  'duplicate-script',
]);

/**
 * Load owned exceptions. Every entry must name a file, a known rule, an
 * owner, and a reason -- an exception nobody owns is how a permanent silent
 * waiver gets created, so an incomplete entry fails the run instead.
 */
function loadExceptions() {
  if (!fs.existsSync(EXCEPTIONS_FILE)) {
    return { map: new Map(), errors: [] };
  }

  const errors = [];
  const map = new Map();
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(EXCEPTIONS_FILE, 'utf8'));
  } catch (error) {
    return {
      map,
      errors: [`scripts/html-structure-exceptions.json is not valid JSON: ${error.message}`],
    };
  }

  const entries = Array.isArray(parsed.exceptions) ? parsed.exceptions : [];
  entries.forEach((entry, index) => {
    const label = `exception #${index + 1}`;
    if (!entry || typeof entry !== 'object') {
      errors.push(`${label}: must be an object`);
      return;
    }
    for (const field of ['file', 'rule', 'owner', 'reason']) {
      if (!entry[field] || typeof entry[field] !== 'string' || !entry[field].trim()) {
        errors.push(`${label}: missing required field "${field}"`);
        return;
      }
    }
    if (!VALID_RULES.has(entry.rule)) {
      errors.push(
        `${label}: unknown rule "${entry.rule}" (expected one of ${[...VALID_RULES].join(', ')})`
      );
      return;
    }
    const normalized = entry.file.split(path.sep).join('/');
    if (!map.has(normalized)) map.set(normalized, new Set());
    map.get(normalized).add(entry.rule);
  });

  return { map, errors };
}

/* ------------------------------------------------------------------ *
 * File discovery
 * ------------------------------------------------------------------ */

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
  return files;
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
    .filter((file) => fs.existsSync(file));
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

function main() {
  const { map: exceptions, errors: exceptionErrors } = loadExceptions();

  const base = option('--changed-from');
  let files;
  try {
    files = base ? changedHtmlFiles(base) : allHtmlFiles(repoRoot);
  } catch (error) {
    console.error(`Unable to list changed HTML files from "${base}": ${error.message}`);
    process.exit(1);
  }
  files.sort();

  const findings = [];
  const waived = [];

  for (const file of files) {
    const rel = relative(file);
    const allowedRules = exceptions.get(rel) || new Set();

    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch (error) {
      findings.push(`${rel}: unreadable (${error.message})`);
      continue;
    }

    const violations = analyze(file, content);
    const active = violations.filter((v) => {
      if (allowedRules.has(v.rule)) {
        waived.push(`${rel}:${v.line} [${v.rule}] ${v.message}`);
        return false;
      }
      return true;
    });

    if (!active.length) continue;

    // Default to the first violation per file: one stray document tag can
    // cascade into many downstream reports, and the first one is the repair
    // site. --all prints the rest.
    const shown = reportAll ? active : active.slice(0, 1);
    for (const violation of shown) {
      findings.push(`${rel}:${violation.line} [${violation.rule}] ${violation.message}`);
    }
    if (!reportAll && active.length > 1) {
      findings.push(
        `${rel}: ${active.length - 1} further structural issue(s) suppressed — re-run with --all`
      );
    }
  }

  if (exceptionErrors.length) {
    console.error(
      `Structural HTML check found ${exceptionErrors.length} invalid exception entry(ies):\n`
      + exceptionErrors.map((line) => `  ${line}`).join('\n')
    );
  }

  if (waived.length && reportAll) {
    console.log(`Waived by scripts/html-structure-exceptions.json (${waived.length}):`);
    for (const line of waived) console.log(`  ${line}`);
  }

  if (findings.length || exceptionErrors.length) {
    if (findings.length) {
      console.error(
        `Structural HTML check found ${findings.length} issue(s):\n`
        + findings.map((line) => `  ${line}`).join('\n')
        + '\n\nRepair guidance: docs/HTML-STRUCTURE.md'
      );
    }
    process.exitCode = 1;
  } else {
    const waivedNote = waived.length ? ` (${waived.length} waived)` : '';
    console.log(`Structural HTML check passed for ${files.length} file(s)${waivedNote}.`);
  }
}

// Importable for tests and tooling; scanning only happens when run directly.
if (require.main === module) {
  main();
}

module.exports = { tokenize, analyze, canonicalScriptKey, main };
