import test from 'node:test';
import assert from 'node:assert/strict';
import { isOriginAllowed, parseAllowedOrigins, validateExecBody } from '../src/policy.js';

const session = 'abcdefghijklmnop1234';

test('parses origins and drops paths and junk', () => {
  assert.deepEqual(parseAllowedOrigins('https://a.io/x/y, nope, https://b.io'), ['https://a.io', 'https://b.io']);
});

test('only listed origins pass; missing origin fails', () => {
  const allowed = ['https://cyber-minds.github.io'];
  assert.equal(isOriginAllowed('https://cyber-minds.github.io', allowed), true);
  assert.equal(isOriginAllowed('https://evil.example', allowed), false);
  assert.equal(isOriginAllowed(null, allowed), false);
  assert.equal(isOriginAllowed('http://localhost:3939', allowed), false);
  assert.equal(isOriginAllowed('http://localhost:3939', [...allowed, 'http://localhost']), true);
});

test('validates exec bodies', () => {
  assert.equal(validateExecBody({ sessionId: session, command: 'go version' }).ok, true);
  assert.equal(validateExecBody({ sessionId: 'short', command: 'ls' }).ok, false);
  assert.equal(validateExecBody({ sessionId: session, command: '  ' }).ok, false);
  assert.equal(validateExecBody({ sessionId: session, command: 'ls', files: [] }).ok, false);
  assert.equal(validateExecBody({ sessionId: session, command: 'ls', files: { a: 1 } }).ok, false);
  assert.equal(validateExecBody({ sessionId: session, command: 'x'.repeat(5000) }).ok, false);
  const big = validateExecBody({ sessionId: session, command: 'ls', files: { a: 'x'.repeat(300 * 1024) } });
  assert.deepEqual(big, { ok: false, error: 'file too large' });
});

test('clamps timeouts', () => {
  assert.equal(validateExecBody({ sessionId: session, command: 'ls', timeoutMs: 9e9 }).value.timeoutMs, 120000);
  assert.equal(validateExecBody({ sessionId: session, command: 'ls', timeoutMs: 5 }).value.timeoutMs, 1000);
});
