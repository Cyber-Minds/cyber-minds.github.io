import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-'));
process.env.WORKSPACE_DIR = dir;
const { safeRelativePath, validateBody, execute } = createRequire(import.meta.url)('../container/server.cjs');

test('rejects unsafe paths', () => {
  assert.equal(safeRelativePath('../etc/passwd'), null);
  assert.equal(safeRelativePath('/etc/passwd'), null);
  assert.equal(safeRelativePath('node_modules/x/index.js'), null);
  assert.equal(safeRelativePath('a/../../b'), null);
  assert.equal(safeRelativePath('src/Hello.java'), 'src/Hello.java');
});

test('validates bodies', () => {
  assert.equal(validateBody({ command: 'ls' }), null);
  assert.equal(validateBody({ command: '' }), 'invalid command');
  assert.equal(validateBody({ command: 'ls', files: { a: 5 } }), 'file too large');
});

test('runs a command, returns created files and exit code', async () => {
  const result = await execute({ command: 'cat in.txt > out.txt; echo done; exit 3', files: { 'in.txt': 'hi' } });
  assert.equal(result.exitCode, 3);
  assert.match(result.output, /done/);
  assert.equal(result.files['out.txt'], 'hi');
  assert.equal(result.files['in.txt'], undefined);
});

test('kills commands that exceed the timeout', async () => {
  const result = await execute({ command: 'sleep 30', timeoutMs: 1000 });
  assert.equal(result.timedOut, true);
});
