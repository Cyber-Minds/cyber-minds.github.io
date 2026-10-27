'use strict';

/**
 * Tests for the terminal supply-chain drift check.
 *
 * Each case builds a throwaway repo root holding a terminal page, a runtime
 * module, and an inventory, then runs the checker as a subprocess the way CI
 * does. Nothing here reaches the network.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const checker = path.join(__dirname, 'check-terminal-assets.js');

const HASH_A = 'sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const HASH_B = 'sha384-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

function baseInventory() {
  return {
    reviewed: '2026-10-26',
    page: 'HTML/terminal/index.html',
    approvedOrigins: ['https://cdn.jsdelivr.net'],
    assets: [
      {
        id: 'xterm-js',
        type: 'script',
        package: '@xterm/xterm',
        version: '5.5.0',
        url: 'https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.min.js',
        declaredIn: 'html',
        integrity: HASH_A,
        crossorigin: 'anonymous',
        sri: 'required',
      },
      {
        id: 'monaco-loader',
        type: 'script',
        package: 'monaco-editor',
        version: '0.45.0',
        url: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js',
        declaredIn: 'html',
        integrity: HASH_B,
        crossorigin: 'anonymous',
        sri: 'required',
      },
      {
        id: 'monaco-base-path',
        type: 'runtime-base-path',
        package: 'monaco-editor',
        version: '0.45.0',
        url: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs',
        declaredIn: 'Javascript/terminal/app/ui.js',
        sri: 'not-applicable',
        sriReason: 'AMD base path, not a markup subresource.',
      },
    ],
  };
}

function pageWith(tags) {
  return `<!doctype html><html><head><title>Terminal</title>\n${tags}\n</head><body></body></html>`;
}

function defaultTags() {
  return [
    '<script',
    '  src="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.min.js"',
    `  integrity="${HASH_A}"`,
    '  crossorigin="anonymous"',
    '></script>',
    '<script',
    '  src="https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js"',
    `  integrity="${HASH_B}"`,
    '  crossorigin="anonymous"',
    '></script>',
  ].join('\n');
}

function defaultRuntime() {
  return [
    'require.config({',
    '  paths: {',
    "    vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs',",
    '  },',
    '});',
  ].join('\n');
}

/**
 * @param {{inventory?: object, tags?: string, runtime?: string}} overrides
 */
function run(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberminds-assets-'));
  const write = (rel, content) => {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  write('HTML/terminal/index.html', pageWith(overrides.tags ?? defaultTags()));
  write('Javascript/terminal/app/ui.js', overrides.runtime ?? defaultRuntime());
  write(
    'scripts/terminal-assets.json',
    JSON.stringify(overrides.inventory ?? baseInventory(), null, 2)
  );

  const result = spawnSync(process.execPath, [checker, '--root', root], {
    encoding: 'utf8',
  });
  fs.rmSync(root, { recursive: true, force: true });
  return result;
}

test('accepts a page that matches the reviewed inventory', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /2 integrity-pinned/);
});

test('rejects an unapproved origin', () => {
  const result = run({
    tags: `${defaultTags()}\n<script src="https://evil.example/pwn.js"></script>`,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unapproved origin "https:\/\/evil\.example"/);
});

test('rejects an insecure http reference', () => {
  const result = run({
    tags: defaultTags().replace(
      'https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.min.js',
      'http://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.min.js'
    ),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /insecure http:\/\/ reference/);
});

test('rejects a protocol-relative reference', () => {
  const result = run({
    tags: `${defaultTags()}\n<script src="//cdn.jsdelivr.net/npm/thing.js"></script>`,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /protocol-relative URL/);
});

test('rejects an unreviewed version bump and names the reviewed one', () => {
  const result = run({
    tags: defaultTags().replace(/@xterm\/xterm@5\.5\.0/g, '@xterm/xterm@5.6.0'),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unreviewed version of @xterm\/xterm/);
  assert.match(result.stderr, /5\.5\.0/);
});

test('rejects a missing integrity attribute', () => {
  const result = run({
    tags: defaultTags().replace(`  integrity="${HASH_A}"\n`, ''),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /xterm-js is missing its integrity attribute/);
});

test('rejects an integrity hash that differs from the inventory', () => {
  const result = run({
    tags: defaultTags().replace(HASH_A, HASH_B),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /integrity does not match the reviewed hash/);
});

test('rejects integrity without crossorigin', () => {
  const result = run({
    tags: defaultTags().replace('  crossorigin="anonymous"\n></script>\n<script', '></script>\n<script'),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /crossorigin is absent/);
});

test('rejects a reviewed asset that vanished from the page', () => {
  const inventory = baseInventory();
  inventory.assets.push({
    id: 'xterm-css',
    type: 'style',
    package: '@xterm/xterm',
    version: '5.5.0',
    url: 'https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css',
    declaredIn: 'html',
    integrity: HASH_A,
    crossorigin: 'anonymous',
    sri: 'required',
  });
  const result = run({ inventory });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /xterm-css .* is no longer\s+referenced/s);
});

test('catches the Monaco loader drifting from its runtime base path', () => {
  // The exact failure the two-file split invites: HTML bumped, ui.js not.
  const result = run({
    runtime: defaultRuntime().replace('monaco-editor@0.45.0', 'monaco-editor@0.44.0'),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /monaco-base-path is pinned to monaco-editor@0\.44\.0/);
  assert.match(result.stderr, /reviewed version is 0\.45\.0/);
});

test('catches an inventory whose Monaco entries disagree', () => {
  const inventory = baseInventory();
  inventory.assets[2].version = '0.44.0';
  inventory.assets[2].url =
    'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs';
  const result = run({ inventory });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /monaco-editor version is inconsistent/);
});

test('rejects an inventory entry claiming SRI without a hash', () => {
  const inventory = baseInventory();
  delete inventory.assets[0].integrity;
  const result = run({ inventory });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /sri is "required" but no integrity hash is recorded/);
});

test('rejects an inventory entry waiving SRI without a reason', () => {
  const inventory = baseInventory();
  delete inventory.assets[2].sriReason;
  const result = run({ inventory });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no sriReason is recorded/);
});

test('rejects a malformed integrity digest in the inventory', () => {
  const inventory = baseInventory();
  inventory.assets[0].integrity = 'md5-nope';
  const result = run({ inventory });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /is not a valid sha256\/384\/512 digest/);
});

test('rejects an inventory url that disagrees with its own version field', () => {
  const inventory = baseInventory();
  inventory.assets[0].version = '9.9.9';
  const result = run({ inventory });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /inventory is internally inconsistent/);
});

test('the shipped inventory matches the real terminal page', () => {
  // Guards the acceptance criterion directly, with no network access.
  const result = spawnSync(process.execPath, [checker], {
    encoding: 'utf8',
    cwd: path.join(__dirname, '..'),
  });
  assert.equal(result.status, 0, result.stderr);
});

test('the shipped inventory records a review date and an owner', () => {
  const shipped = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'terminal-assets.json'), 'utf8')
  );
  assert.match(shipped.reviewed, /^\d{4}-\d{2}-\d{2}$/, 'reviewed must be an ISO date');
  assert.ok(shipped.owner && shipped.owner.trim(), 'inventory must name an owner');
  for (const asset of shipped.assets) {
    assert.ok(asset.purpose && asset.purpose.trim(), `${asset.id} must record a purpose`);
  }
});
