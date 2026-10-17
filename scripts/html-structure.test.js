'use strict';

/**
 * Tests for the structural HTML checker.
 *
 * Each case writes a throwaway repo root, runs the checker as a subprocess
 * (the same way CI invokes it), and asserts on exit status plus the
 * file:line [rule] diagnostic. Nothing here touches the real repository or
 * the network.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const checker = path.join(__dirname, 'html-structure.js');

function run(files, extraArgs = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberminds-struct-'));
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  const result = spawnSync(
    process.execPath,
    [checker, '--root', root, ...extraArgs],
    { encoding: 'utf8' }
  );
  fs.rmSync(root, { recursive: true, force: true });
  return result;
}

const VALID_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <title>Lesson</title>
    <script src="/Javascript/footer.js"></script>
  </head>
  <body>
    <main>
      <h1>Lesson</h1>
      <p>Intro text</p>
      <ul>
        <li>First
        <li>Second
      </ul>
      <a href="next.html">Next lesson</a>
    </main>
    <script src="/Javascript/analytics.js"></script>
  </body>
</html>
`;

test('accepts a well-formed page, including optional end tags', () => {
  const result = run({ 'lesson.html': VALID_PAGE });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /passed for 1 file/);
});

test('accepts legacy tables and lists that omit optional end tags', () => {
  const result = run({
    'legacy.html': `<!doctype html><html><head><title>T</title></head><body>
      <table>
        <tr><td>a<td>b
        <tr><td>c<td>d
      </table>
      <dl><dt>Term<dd>Definition<dt>Other<dd>Thing</dl>
      <select><option>one<option>two</select>
      <p>Unclosed paragraph
      <div>Block that closes it</div>
    </body></html>`,
  });
  assert.equal(result.status, 0, result.stderr);
});

test('rejects a duplicate <body> and names the file and line', () => {
  const result = run({
    'dupe.html': `<!doctype html>
<html>
  <head><title>T</title></head>
  <body>
    <p>one</p>
  </body>
  <body>
    <p>two</p>
  </body>
</html>`,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /dupe\.html:7 \[duplicate-document-root\]/);
  assert.match(result.stderr, /second <body> element \(first on line 4\)/);
});

test('rejects a duplicate doctype and duplicate <html>', () => {
  const doctype = run({
    'two-doctypes.html': '<!doctype html>\n<html><head><title>T</title></head><body>x</body></html>\n<!doctype html>',
  });
  assert.equal(doctype.status, 1);
  assert.match(doctype.stderr, /\[duplicate-document-root\].*<!DOCTYPE>/s);

  const html = run({
    'two-html.html': '<!doctype html>\n<html><head><title>T</title></head><body>x</body></html>\n<html></html>',
  });
  assert.equal(html.status, 1);
  assert.match(html.stderr, /two-html\.html:3 \[duplicate-document-root\]/);
});

test('rejects a document tag buried inside lesson content', () => {
  // No earlier <head>, so this is the first one -- it is reported for being
  // in the wrong place rather than for being a duplicate.
  const result = run({
    'misplaced.html': `<!doctype html>
<html>
  <body>
    <main>
      <div class="lesson">
        <head>
          <link rel="stylesheet" href="x.css" />
        </head>
      </div>
    </main>
  </body>
</html>`,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /misplaced\.html:6 \[misplaced-document-tag\]/);
  assert.match(result.stderr, /<head> nested inside <div> content/);
});

test('reports a buried duplicate head at its own line', () => {
  // The common real-world shape: a complete page plus content pasted in with
  // its own <head>. Duplicate is the earlier, more specific diagnosis, and it
  // still points at the stray tag rather than the legitimate one.
  const result = run({
    'pasted.html': `<!doctype html>
<html>
  <head><title>T</title></head>
  <body>
    <div class="lesson">
      <head><link rel="stylesheet" href="x.css" /></head>
    </div>
  </body>
</html>`,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pasted\.html:6 \[duplicate-document-root\]/);
  assert.match(result.stderr, /second <head> element \(first on line 3\)/);
});

test('rejects nested anchors and reports the outer anchor line', () => {
  const result = run({
    'nested.html': `<!doctype html>
<html><head><title>T</title></head>
<body>
  <a href="outer.html">
    <span><a href="inner.html">inner</a></span>
  </a>
</body></html>`,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /nested\.html:5 \[nested-anchor\]/);
  assert.match(result.stderr, /still open from line 4/);
});

test('rejects a shared script included twice, across path spellings', () => {
  const result = run({
    'HTML/page.html': `<!doctype html>
<html><head><title>T</title></head>
<body>
  <script src="../Javascript/footer.js"></script>
  <script src="/Javascript/footer.js"></script>
</body></html>`,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /page\.html:5 \[duplicate-script\]/);
  assert.match(result.stderr, /javascript\/footer\.js" already included on line 4/i);
});

test('treats a cache-busted second copy as a duplicate', () => {
  const result = run({
    'q.html': `<!doctype html><html><head><title>T</title>
<script src="/js/app.js"></script>
<script src="/js/app.js?v=2"></script>
</head><body>x</body></html>`,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[duplicate-script\]/);
});

test('allows the same filename from different directories', () => {
  const result = run({
    'ok.html': `<!doctype html><html><head><title>T</title>
<script src="/Javascript/footer.js"></script>
<script src="/Javascript/terminal/footer.js"></script>
</head><body>x</body></html>`,
  });
  assert.equal(result.status, 0, result.stderr);
});

test('never reads markup out of script, style, or textarea bodies', () => {
  const result = run({
    'raw.html': `<!doctype html>
<html><head><title>T</title>
<style>a > a { color: red; }</style>
</head>
<body>
  <script>
    var markup = '<a href="#"><a href="#">';
    document.title = "</head><body>";
  </script>
  <textarea><a href="#"><a href="#"></textarea>
  <a href="real.html">only real anchor</a>
</body></html>`,
  });
  assert.equal(result.status, 0, result.stderr);
});

test('ignores markup inside comments and CDATA', () => {
  const result = run({
    'commented.html': `<!doctype html>
<html><head><title>T</title></head>
<body>
  <!-- <body><a href="a"><a href="b"></a></a> -->
  <!-- <script src="/js/dup.js"></script> -->
  <script src="/js/dup.js"></script>
</body></html>`,
  });
  assert.equal(result.status, 0, result.stderr);
});

test('is not fooled by ">" inside a quoted attribute value', () => {
  const result = run({
    'attr.html': `<!doctype html>
<html><head><title>T</title></head>
<body>
  <div data-tip="use a > b to compare"><a href="x.html">link</a></div>
  <a href="y.html">another</a>
</body></html>`,
  });
  assert.equal(result.status, 0, result.stderr);
});

test('tolerates stray end tags without reparenting', () => {
  const result = run({
    'stray.html': `<!doctype html>
<html><head><title>T</title></head>
<body>
  </div>
  </span>
  <a href="a.html">one</a>
  <a href="b.html">two</a>
</body></html>`,
  });
  assert.equal(result.status, 0, result.stderr);
});

test('reports only the first violation per file unless --all is passed', () => {
  const page = `<!doctype html>
<html><head><title>T</title></head>
<body>
  <a href="1.html"><a href="2.html">x</a></a>
  <a href="3.html"><a href="4.html">y</a></a>
</body></html>`;

  const first = run({ 'many.html': page });
  assert.equal(first.status, 1);
  assert.match(first.stderr, /many\.html:4 \[nested-anchor\]/);
  assert.doesNotMatch(first.stderr, /many\.html:5 \[nested-anchor\]/);
  assert.match(first.stderr, /1 further structural issue\(s\) suppressed/);

  const all = run({ 'many.html': page }, ['--all']);
  assert.equal(all.status, 1);
  assert.match(all.stderr, /many\.html:4 \[nested-anchor\]/);
  assert.match(all.stderr, /many\.html:5 \[nested-anchor\]/);
});

test('points at the repair documentation on failure', () => {
  const result = run({
    'bad.html': '<!doctype html><html><head><title>T</title></head><body><a href="a"><a href="b">x</a></a></body></html>',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /docs\/HTML-STRUCTURE\.md/);
});

test('does not leak page text or attribute values into diagnostics', () => {
  const result = run({
    'secret.html': `<!doctype html>
<html><head><title>T</title></head>
<body>
  <p>learner-identifying-content-should-not-appear</p>
  <a href="outer?token=super-secret-value">
    <a href="inner">inner</a>
  </a>
</body></html>`,
  });
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stderr, /super-secret-value/);
  assert.doesNotMatch(result.stderr, /learner-identifying-content/);
});

test('the shipped exceptions file is valid and the live repo passes', () => {
  const exceptionsPath = path.join(__dirname, 'html-structure-exceptions.json');
  const parsed = JSON.parse(fs.readFileSync(exceptionsPath, 'utf8'));
  assert.ok(Array.isArray(parsed.exceptions), 'exceptions must be an array');

  const validRules = new Set([
    'duplicate-document-root',
    'misplaced-document-tag',
    'nested-anchor',
    'duplicate-script',
  ]);
  for (const entry of parsed.exceptions) {
    for (const field of ['file', 'rule', 'owner', 'reason']) {
      assert.ok(
        entry[field] && String(entry[field]).trim(),
        `exception for ${entry.file || '(unknown file)'} is missing "${field}"`
      );
    }
    assert.ok(validRules.has(entry.rule), `unknown rule "${entry.rule}"`);
  }

  // Guards the acceptance criterion that existing pages pass, and does it
  // without any network access.
  const result = spawnSync(process.execPath, [checker], {
    encoding: 'utf8',
    cwd: path.join(__dirname, '..'),
  });
  assert.equal(
    result.status,
    0,
    `repository HTML has structural violations:\n${result.stderr}`
  );
});

test('rejects an exception entry that names no owner', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberminds-exc-'));
  const scriptCopy = path.join(root, 'html-structure.js');
  fs.copyFileSync(checker, scriptCopy);
  fs.writeFileSync(
    path.join(root, 'html-structure-exceptions.json'),
    JSON.stringify({
      exceptions: [{ file: 'a.html', rule: 'nested-anchor', reason: 'legacy' }],
    })
  );
  fs.writeFileSync(
    path.join(root, 'a.html'),
    '<!doctype html><html><head><title>T</title></head><body>ok</body></html>'
  );

  const result = spawnSync(process.execPath, [scriptCopy, '--root', root], {
    encoding: 'utf8',
  });
  fs.rmSync(root, { recursive: true, force: true });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing required field "owner"/);
});

test('waives a violation when an owned exception covers it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberminds-waive-'));
  const scriptCopy = path.join(root, 'html-structure.js');
  fs.copyFileSync(checker, scriptCopy);
  fs.writeFileSync(
    path.join(root, 'html-structure-exceptions.json'),
    JSON.stringify({
      exceptions: [
        {
          file: 'legacy.html',
          rule: 'nested-anchor',
          owner: '@frontend-owner',
          reason: 'third-party embed ships nested anchors; tracked in #123',
        },
      ],
    })
  );
  fs.writeFileSync(
    path.join(root, 'legacy.html'),
    '<!doctype html><html><head><title>T</title></head><body><a href="a"><a href="b">x</a></a></body></html>'
  );

  const result = spawnSync(process.execPath, [scriptCopy, '--root', root], {
    encoding: 'utf8',
  });
  fs.rmSync(root, { recursive: true, force: true });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 waived/);
});
