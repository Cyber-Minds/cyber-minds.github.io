// Checks:
//   1. Every HTML page has a non-empty <title>
//   2. Images have an alt attribute (alt="" is allowed for decorative images)
//   3. Internal links point to files that exist in the repo
//   4. Footer years are current or injected by footer.js (not hardcoded stale)
//
// False positives: add entries to scripts/qa-allowlist.json

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Config ──────────────────────────────────────────────────────────────────
const REPO_ROOT      = path.resolve(__dirname, '..');
const CURRENT_YEAR   = new Date().getFullYear();
const ALLOWLIST_PATH = path.join(__dirname, 'qa-allowlist.json');

let allowlist = { externalUrls: [], skipFiles: [], skipAltChecks: [] };
try {
  allowlist = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
} catch {
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getAllHtmlFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      getAllHtmlFiles(full, files);
    } else if (entry.name.endsWith('.html')) {
      files.push(full);
    }
  }
  return files;
}

function relPath(absPath) {
  return path.relative(REPO_ROOT, absPath);
}

// ── Issue collector ───────────────────────────────────────────────────────────
const PLACEHOLDER_LINKS = [
  "add here",
  "add activity here",
  "add game here"
];


const issues = [];

function report(file, message) {
  issues.push(`  ${relPath(file)}: ${message}`);
}

// ── Regex patterns ────────────────────────────────────────────────────────────
const TITLE_RE       = /<title[^>]*>([\s\S]*?)<\/title>/i;
const IMG_RE         = /<img([^>]*)>/gi;
const ALT_RE         = /\balt\s*=\s*["']([^"']*)["']/i;
const HREF_RE        = /\bhref\s*=\s*["']([^"'#][^"']*)["']/gi;
const SRC_RE         = /\bsrc\s*=\s*["']([^"']+)["']/gi;
const FOOTER_YEAR_RE = /&copy;\s*(\d{4})/gi;
const FOOTER_TAG_RE  = /<footer[^>]*>([\s\S]*?)<\/footer>/gi;
const FOOTER_JS_SCRIPT_RE = /footer\.js/;

// ── Run checks ────────────────────────────────────────────────────────────────
const htmlFiles = getAllHtmlFiles(REPO_ROOT).filter(
  (f) => !allowlist.skipFiles?.includes(relPath(f))
);

console.log(`\nCyberMinds QA — checking ${htmlFiles.length} HTML files...\n`);

for (const file of htmlFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const rel     = relPath(file);
  const fileDir = path.dirname(file);

  // ── CHECK 1: Non-empty <title> ──────────────────────────────────────────
  const titleMatch = TITLE_RE.exec(content);
  if (!titleMatch) {
    report(file, 'Missing <title> tag');
  } else if (!titleMatch[1].trim()) {
    report(file, 'Empty <title> tag');
  }

// ── CHECK 2: Image alt text ─────────────────────────────────────────────
if (!allowlist.skipAltChecks?.includes(rel)) {
  let imgMatch;
  IMG_RE.lastIndex = 0;

  while ((imgMatch = IMG_RE.exec(content)) !== null) {
    const attrs = imgMatch[1];

    const altMatch = ALT_RE.exec(attrs);

    if (!altMatch) {
      report(
        file,
        `<img> missing alt attribute: ${imgMatch[0].slice(0, 80)}`
      );
      continue;
    }

  }
}

  // ── CHECK 3: Internal link targets exist ────────────────────────────────
  let hrefMatch;
  HREF_RE.lastIndex = 0;
  while ((hrefMatch = HREF_RE.exec(content)) !== null) {
    const href = hrefMatch[1].trim();
    if (PLACEHOLDER_LINKS.includes(href)) continue;

    // Skip external URLs
    if (href.startsWith('http://') || href.startsWith('https://')) {
      // Only check against allowlist; don't fetch
      continue;
    }
    // Skip mailto, tel, javascript
    if (/^(mailto:|tel:|javascript:)/i.test(href)) continue;
    // Skip template variables
    if (href.includes('{{') || href.includes('${')) continue;
    // Strip query string and hash
    const cleanHref = href.split('?')[0].split('#')[0];
    if (!cleanHref) continue;

    // Resolve relative to file location
    const resolved = cleanHref.startsWith('/')
      ? path.join(REPO_ROOT, cleanHref)
      : path.resolve(fileDir, cleanHref);

    if (!fs.existsSync(resolved)) {
      report(file, `Broken internal link: "${href}"`);
    }
  }

  // Also check src attributes for scripts/images
  let srcMatch;
  SRC_RE.lastIndex = 0;
  while ((srcMatch = SRC_RE.exec(content)) !== null) {
    const src = srcMatch[1].trim();
    if (src.startsWith('http://') || src.startsWith('https://')) continue;
    if (/^(data:|blob:)/i.test(src)) continue;
    if (src.includes('{{') || src.includes('${')) continue;
    const cleanSrc = src.split('?')[0].split('#')[0];
    if (!cleanSrc) continue;

    const resolved = cleanSrc.startsWith('/')
      ? path.join(REPO_ROOT, cleanSrc)
      : path.resolve(fileDir, cleanSrc);

    if (!fs.existsSync(resolved)) {
      report(file, `Broken asset src: "${src}"`);
    }
  }

  // ── CHECK 4: Footer year ─────────────────────────────────────────────────
  // Skip if footer is injected by footer.js (dynamic)
const hasFooterJs = FOOTER_JS_SCRIPT_RE.test(content);

if (!hasFooterJs) {
    // Static footer — check for stale year
    let footerMatch;
    FOOTER_TAG_RE.lastIndex = 0;
    while ((footerMatch = FOOTER_TAG_RE.exec(content)) !== null) {
      const footerContent = footerMatch[1];
      let yearMatch;
      FOOTER_YEAR_RE.lastIndex = 0;
      while ((yearMatch = FOOTER_YEAR_RE.exec(footerContent)) !== null) {
        const year = parseInt(yearMatch[1], 10);
        if (year < CURRENT_YEAR) {
          report(file, `Stale footer year: ${year} (current year is ${CURRENT_YEAR})`);
        }
      }
    }
  }
}

// ── Results ───────────────────────────────────────────────────────────────────
if (issues.length === 0) {
  console.log('✅  All checks passed — no issues found.\n');
  process.exit(0);
} else {
  console.log(`❌  Found ${issues.length} issue${issues.length === 1 ? '' : 's'}:\n`);
  for (const issue of issues) {
    console.log(issue);
  }
  console.log(`\nTo suppress a false positive, add the file or URL to scripts/qa-allowlist.json\n`);
  process.exit(1);
}