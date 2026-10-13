'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const checker = path.join(__dirname, 'structure-check.js');

function run(content, exceptions = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberminds-structure-'));
  fs.writeFileSync(path.join(root, 'lesson.html'), content);
  const allowlist = path.join(root, 'structure-allowlist.json');
  fs.writeFileSync(allowlist, JSON.stringify({ exceptions }));
  const result = spawnSync(
    process.execPath,
    [checker, '--root', root, '--allowlist', allowlist],
    { encoding: 'utf8' }
  );
  fs.rmSync(root, { recursive: true, force: true });
  return result;
}

test('accepts valid legacy wrappers and markup-looking text in comments and scripts', () => {
  const result = run(
    '<html><head><title>Lesson</title></head><body>\n<!-- <a><a> -->\n<script>const sample = "<body><a>";</script>\n<a href="/lesson">Lesson</a></body></html>'
  );
  assert.equal(result.status, 0, result.stderr);
});

test('reports duplicate document roots at the second root line', () => {
  const result = run('<html><body>Lesson</body></html>\n<html><body>Again</body></html>');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /lesson\.html:2: duplicate <html> document root/);
});

test('reports nested anchors at the inner anchor line', () => {
  const result = run('<html><body><a href="one">Outer\n<a href="two">Inner</a></a></body></html>');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /lesson\.html:2: nested <a> anchor/);
});

test('reports head and body tags placed inside page content', () => {
  const result = run('<html><head></head><body>Lesson\n<head><title>Wrong place</title></head></body></html>');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /lesson\.html:2: duplicate or misplaced <head> tag inside page content/);
});

test('rejects a body opened before the head is closed', () => {
  const result = run('<html><head>\n<body>Wrong place</body></head></html>');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /lesson\.html:2: duplicate or misplaced <body> tag inside page content/);
});

test('reports duplicate shared scripts even when relative paths differ', () => {
  const result = run(
    '<html><body><script src="/Javascript/header.js"></script>\n<script src="./Javascript/header.js?v=2"></script></body></html>'
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /lesson\.html:2: duplicate script inclusion/);
});

test('owned exceptions suppress only the exact issue and stale exceptions fail', () => {
  const exception = {
    rule: 'duplicate-script',
    signature: 'Javascript/header.js',
    owner: 'test-owner',
    reason: 'Legacy fixture',
    files: ['lesson.html'],
  };
  const content =
    '<html><body><script src="/Javascript/header.js"></script><script src="Javascript/header.js"></script>\n<a><a>Nested</a></a></body></html>';
  const result = run(content, [exception]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /lesson\.html:2: nested <a> anchor/);

  const stale = run('<html><body>Clean</body></html>', [exception]);
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /stale or under-counted owned exception/);
});