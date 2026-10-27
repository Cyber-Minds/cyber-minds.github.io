'use strict';

/**
 * Supply-chain drift check for the public terminal page.
 *
 * The terminal loads xterm, the xterm fit addon, and Monaco from jsDelivr.
 * Those versions live in two places that are maintained independently:
 * the <script>/<link> tags in HTML/terminal/index.html, and the Monaco AMD
 * base path in Javascript/terminal/app/ui.js. Nothing previously connected
 * them, so a version bump in one could silently drift from the other, and
 * nothing recorded which versions had actually been reviewed.
 *
 * This compares the page against scripts/terminal-assets.json and fails on:
 *   - an origin not in the approved list
 *   - a non-https (or protocol-relative) external reference
 *   - a URL whose exact version is not the reviewed one
 *   - a reviewed asset that disappeared from the page
 *   - a missing, malformed, or mismatched integrity attribute
 *   - a missing crossorigin attribute on an SRI-protected asset
 *   - Monaco's loader version disagreeing with its runtime base path
 *
 * Deterministic and offline by design: it reads repository bytes only and
 * never contacts a CDN, so it cannot fail because of a network blip. The
 * companion scripts/verify-asset-integrity.js does the networked half --
 * confirming the recorded hashes still match what the CDN serves -- and is
 * run when updating a dependency, not on every CI run.
 *
 * Usage:
 *   node scripts/check-terminal-assets.js
 *   node scripts/check-terminal-assets.js --root <dir>
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.lastIndexOf(name);
  return index === -1 ? null : args[index + 1];
};

const repoRoot = path.resolve(option('--root') || path.join(__dirname, '..'));
const inventoryPath = option('--inventory')
  || path.join(repoRoot, 'scripts/terminal-assets.json');

const issues = [];
const report = (message) => issues.push(message);

/* ------------------------------------------------------------------ *
 * Inventory
 * ------------------------------------------------------------------ */

let inventory;
try {
  inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
} catch (error) {
  console.error(`Cannot read asset inventory at ${inventoryPath}: ${error.message}`);
  process.exit(1);
}

const assets = Array.isArray(inventory.assets) ? inventory.assets : [];
const approvedOrigins = new Set(inventory.approvedOrigins || []);
const SRI_RE = /^sha(256|384|512)-[A-Za-z0-9+/]+={0,2}$/;

if (!assets.length) {
  report('inventory lists no assets');
}

// The inventory itself must be well formed, or the comparison below is
// checking the page against nothing.
assets.forEach((asset, index) => {
  const label = asset.id ? `asset "${asset.id}"` : `asset #${index + 1}`;
  for (const field of ['id', 'type', 'package', 'version', 'url', 'declaredIn', 'sri']) {
    if (!asset[field] || typeof asset[field] !== 'string') {
      report(`${label}: inventory entry is missing required field "${field}"`);
    }
  }
  if (asset.sri === 'required') {
    if (!asset.integrity) {
      report(`${label}: sri is "required" but no integrity hash is recorded`);
    } else if (!SRI_RE.test(asset.integrity)) {
      report(`${label}: integrity "${asset.integrity}" is not a valid sha256/384/512 digest`);
    }
    if (asset.crossorigin !== 'anonymous') {
      report(
        `${label}: SRI on a cross-origin asset requires crossorigin="anonymous" in the inventory`
      );
    }
  } else if (asset.sri === 'not-applicable') {
    if (!asset.sriReason) {
      report(`${label}: sri is "not-applicable" but no sriReason is recorded`);
    }
    if (asset.integrity) {
      report(`${label}: sri is "not-applicable" but an integrity hash is recorded`);
    }
  } else {
    report(`${label}: sri must be "required" or "not-applicable", got "${asset.sri}"`);
  }

  if (asset.url && !asset.url.startsWith('https://')) {
    report(`${label}: inventory url is not https: "${asset.url}"`);
  }
  if (asset.url && asset.version && asset.version !== 'unversioned') {
    if (!asset.url.includes(`@${asset.version}`)) {
      report(
        `${label}: url does not contain the reviewed version "@${asset.version}" -- `
        + 'inventory is internally inconsistent'
      );
    }
  }
});

/* ------------------------------------------------------------------ *
 * Page parsing
 * ------------------------------------------------------------------ */

const pageRel = inventory.page || 'HTML/terminal/index.html';
const pagePath = path.join(repoRoot, pageRel);
let html;
try {
  html = fs.readFileSync(pagePath, 'utf8');
} catch (error) {
  console.error(`Cannot read terminal page at ${pageRel}: ${error.message}`);
  process.exit(1);
}

// Strip comments so commented-out markup is not treated as live.
const activeHtml = html.replace(/<!--[\s\S]*?-->/g, '');

function attr(tag, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag);
  return match ? match[1] : null;
}

/**
 * External script/link references declared in the page, in document order.
 */
function collectPageRefs(source) {
  const refs = [];
  const tagRe = /<(script|link)\b([^>]*)>/gi;
  let match;
  while ((match = tagRe.exec(source)) !== null) {
    const kind = match[1].toLowerCase();
    const tag = match[0];
    const url = kind === 'script' ? attr(tag, 'src') : attr(tag, 'href');
    if (!url) continue;
    // Only third-party references are in scope; local assets are covered by
    // the link audit and the static QA check.
    if (!/^(https?:)?\/\//i.test(url)) continue;
    refs.push({
      kind,
      url,
      tag,
      integrity: attr(tag, 'integrity'),
      crossorigin: attr(tag, 'crossorigin'),
      line: source.slice(0, match.index).split('\n').length,
    });
  }
  return refs;
}

const pageRefs = collectPageRefs(activeHtml);
const inventoryByUrl = new Map(assets.map((asset) => [asset.url, asset]));

/**
 * Compare a URL against the inventory by package, so a version bump reports
 * as drift from a known package rather than as an unknown asset.
 */
function findByPackage(url) {
  return assets.find((asset) => {
    if (asset.declaredIn !== 'html') return false;
    if (asset.version === 'unversioned') {
      return url.split('?')[0] === asset.url.split('?')[0];
    }
    const prefix = asset.url.split(`@${asset.version}`)[0];
    return prefix && url.startsWith(prefix);
  });
}

for (const ref of pageRefs) {
  const where = `${pageRel}:${ref.line}`;

  if (ref.url.startsWith('//')) {
    report(`${where}: protocol-relative URL "${ref.url}" -- use an explicit https:// origin`);
    continue;
  }
  if (ref.url.startsWith('http://')) {
    report(`${where}: insecure http:// reference "${ref.url}"`);
    continue;
  }

  let origin;
  try {
    origin = new URL(ref.url).origin;
  } catch {
    report(`${where}: malformed external URL "${ref.url}"`);
    continue;
  }

  if (!approvedOrigins.has(origin)) {
    report(
      `${where}: unapproved origin "${origin}". Add it to docs/ORIGINS.md and `
      + 'scripts/terminal-assets.json only after review.'
    );
    continue;
  }

  const asset = inventoryByUrl.get(ref.url);
  if (!asset) {
    const sibling = findByPackage(ref.url);
    if (sibling) {
      report(
        `${where}: unreviewed version of ${sibling.package}. Page loads "${ref.url}" `
        + `but the reviewed asset is "${sibling.url}".`
      );
    } else {
      report(`${where}: "${ref.url}" is not in the reviewed asset inventory`);
    }
    continue;
  }

  if (asset.sri === 'required') {
    if (!ref.integrity) {
      report(`${where}: ${asset.id} is missing its integrity attribute`);
    } else if (ref.integrity !== asset.integrity) {
      report(
        `${where}: ${asset.id} integrity does not match the reviewed hash.\n`
        + `    page:      ${ref.integrity}\n`
        + `    inventory: ${asset.integrity}`
      );
    }
    if (ref.crossorigin !== 'anonymous') {
      report(
        `${where}: ${asset.id} has integrity but crossorigin is `
        + `${ref.crossorigin === null ? 'absent' : `"${ref.crossorigin}"`}. `
        + 'A cross-origin subresource needs crossorigin="anonymous" or the '
        + 'browser blocks it instead of verifying it.'
      );
    }
  } else if (ref.integrity) {
    report(
      `${where}: ${asset.id} carries an integrity attribute but the inventory `
      + `marks it not-applicable (${asset.sriReason || 'no reason recorded'})`
    );
  }
}

// Bidirectional: an inventory entry that vanished from the page is drift too.
const pageUrls = new Set(pageRefs.map((ref) => ref.url));
for (const asset of assets) {
  if (asset.declaredIn !== 'html') continue;
  if (!pageUrls.has(asset.url)) {
    report(
      `${pageRel}: reviewed asset ${asset.id} ("${asset.url}") is no longer `
      + 'referenced by the page. Remove it from the inventory if that is intended.'
    );
  }
}

/* ------------------------------------------------------------------ *
 * Runtime-declared assets (Monaco AMD base path)
 * ------------------------------------------------------------------ */

for (const asset of assets) {
  if (asset.declaredIn === 'html') continue;

  const sourcePath = path.join(repoRoot, asset.declaredIn);
  let source;
  try {
    source = fs.readFileSync(sourcePath, 'utf8');
  } catch (error) {
    report(`${asset.declaredIn}: cannot read file declaring ${asset.id} (${error.message})`);
    continue;
  }

  if (!source.includes(asset.url)) {
    const pkgPrefix = asset.version !== 'unversioned'
      ? asset.url.split(`@${asset.version}`)[0]
      : null;
    const drifted = pkgPrefix
      && new RegExp(`${pkgPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}@([^'"\\s/]+)`)
        .exec(source);
    if (drifted) {
      report(
        `${asset.declaredIn}: ${asset.id} is pinned to ${asset.package}@${drifted[1]} `
        + `but the reviewed version is ${asset.version}`
      );
    } else {
      report(
        `${asset.declaredIn}: reviewed base path for ${asset.id} ("${asset.url}") not found`
      );
    }
  }
}

// Monaco's loader and its runtime base path are edited in different files;
// they drift apart silently, so tie them together explicitly.
const monacoAssets = assets.filter((asset) => asset.package === 'monaco-editor');
const monacoVersions = new Set(monacoAssets.map((asset) => asset.version));
if (monacoVersions.size > 1) {
  report(
    'monaco-editor version is inconsistent across the inventory: '
    + `${[...monacoVersions].join(', ')}. The loader and its AMD base path must match.`
  );
}

/* ------------------------------------------------------------------ *
 * Result
 * ------------------------------------------------------------------ */

if (issues.length) {
  console.error(
    `Terminal asset check found ${issues.length} issue(s):\n`
    + issues.map((line) => `  ${line}`).join('\n')
    + '\n\nUpdate procedure: docs/TERMINAL-ASSETS.md'
  );
  process.exitCode = 1;
} else {
  const sriCount = assets.filter((a) => a.sri === 'required').length;
  console.log(
    `Terminal asset check passed: ${assets.length} reviewed asset(s), `
    + `${sriCount} integrity-pinned, reviewed ${inventory.reviewed || 'date not recorded'}.`
  );
}
