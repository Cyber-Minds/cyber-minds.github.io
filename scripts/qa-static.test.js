'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const checker = path.join(__dirname, 'qa-static.js');

function run(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberminds-qa-'));
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  const result = spawnSync(process.execPath, [checker, '--root', root], {
    encoding: 'utf8'
  });
  fs.rmSync(root, { recursive: true, force: true });
  return result;
}

test('accepts valid local links, allowlisted assets, and decorative images', () => {
  const year = new Date().getFullYear();
  const result = run({
    'index.html': `<title>Home</title><img src="pixel.gif" alt="" role="presentation"><a href="page.html">Page</a><script src="https://cdn.jsdelivr.net/app.js"></script><footer>&copy; ${year}</footer>`,
    'page.html': '<title>Page</title>',
    'pixel.gif': ''
  });
  assert.equal(result.status, 0, result.stderr);
});

test('ignores inactive markup inside HTML comments', () => {
  const result = run({
    'index.html':
      '<title>Home</title><!-- <img src="missing.png"><a href="add here">Draft</a> -->'
  });
  assert.equal(result.status, 0, result.stderr);
});

test('rejects unsafe references and unmarked empty alt without logging queries', () => {
  const result = run({
    'index.html': '<title>Home</title><img src="image.png" alt=""><a href="add here?token=super-secret">Placeholder</a><a href="https://evil.example/path?token=super-secret">External</a><a href="javascript:alert(1)">Unsafe</a>',
    'image.png': ''
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /empty alt without a decorative marker/);
  assert.match(result.stderr, /Broken link: "add here"/);
  assert.match(result.stderr, /Unallowlisted external link/);
  assert.match(result.stderr, /Unsafe link/);
  assert.doesNotMatch(result.stderr, /super-secret/);
});
