// Exec server that runs inside the sandbox container.
// POST /exec { command, files, timeoutMs } -> { output, exitCode, timedOut, files, deleted, truncated }
// One command runs at a time; files are written into /workspace first and any
// text files the command created or changed are returned.
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const WORKSPACE = process.env.WORKSPACE_DIR || '/workspace';
const PORT = Number(process.env.PORT || 8080);
const MAX_OUTPUT = 256 * 1024;
const MAX_REQUEST_BYTES = 3 * 1024 * 1024;
const MAX_FILES = 300;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_RETURN_FILE_BYTES = 128 * 1024;
const MAX_RETURN_TOTAL_BYTES = 1024 * 1024;
const MAX_TIMEOUT_MS = 120000;
const DEFAULT_TIMEOUT_MS = 60000;
// Directories that hold tool state or dependencies; never synced back.
const IGNORED_DIRS = new Set(['node_modules', '.git', '.home', '.gopath', '.cache', '.npm', '.m2']);

function safeRelativePath(input) {
  if (typeof input !== 'string' || !input || input.includes('\0')) return null;
  const normalized = path.posix.normalize(input.replace(/\\/g, '/'));
  if (normalized.startsWith('/') || normalized === '.' || normalized.startsWith('../') || normalized === '..') {
    return null;
  }
  if (normalized.split('/').some((part) => IGNORED_DIRS.has(part))) return null;
  return normalized;
}

function isProbablyText(buffer) {
  return !buffer.subarray(0, 4096).includes(0);
}

function snapshot(dir, base = dir, result = new Map()) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return result;
  }
  entries.forEach((entry) => {
    if (IGNORED_DIRS.has(entry.name)) return;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      snapshot(full, base, result);
    } else if (entry.isFile()) {
      const rel = path.relative(base, full).split(path.sep).join('/');
      const stat = fs.statSync(full);
      if (stat.size > MAX_RETURN_FILE_BYTES) {
        result.set(rel, { hash: `big:${stat.size}:${stat.mtimeMs}`, big: true });
        return;
      }
      const data = fs.readFileSync(full);
      result.set(rel, {
        hash: crypto.createHash('sha1').update(data).digest('hex'),
        text: isProbablyText(data) ? data.toString('utf8') : null,
      });
    }
  });
  return result;
}

function writeFiles(files) {
  Object.entries(files).forEach(([name, content]) => {
    const rel = safeRelativePath(name);
    if (!rel) return;
    const target = path.join(WORKSPACE, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  });
}

function validateBody(body) {
  if (!body || typeof body !== 'object') return 'invalid body';
  if (typeof body.command !== 'string' || !body.command.trim() || body.command.length > 4096) {
    return 'invalid command';
  }
  const files = body.files || {};
  if (typeof files !== 'object' || Array.isArray(files)) return 'invalid files';
  const names = Object.keys(files);
  if (names.length > MAX_FILES) return 'too many files';
  const tooBig = names.some((name) => typeof files[name] !== 'string' || Buffer.byteLength(files[name]) > MAX_FILE_BYTES);
  return tooBig ? 'file too large' : null;
}

let queue = Promise.resolve();

function runCommand(command, timeoutMs) {
  return new Promise((resolve) => {
    const home = path.join(WORKSPACE, '.home');
    const gopath = path.join(WORKSPACE, '.gopath');
    fs.mkdirSync(home, { recursive: true });
    const child = spawn('bash', ['-c', command], {
      cwd: WORKSPACE,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        PATH: `${path.join(WORKSPACE, 'node_modules/.bin')}:${gopath}/bin:${process.env.PATH}`,
        HOME: home,
        LANG: 'C.UTF-8',
        TERM: 'dumb',
        JAVA_HOME: process.env.JAVA_HOME || '',
        GOROOT: process.env.GOROOT || '/usr/local/go',
        GOPATH: gopath,
        GOCACHE: '/tmp/go-cache',
        GOFLAGS: '-buildvcs=false',
        GOTOOLCHAIN: 'local',
        npm_config_cache: '/tmp/npm-cache',
        npm_config_update_notifier: 'false',
        npm_config_fund: 'false',
        npm_config_audit: 'false',
        CI: 'true',
      },
    });

    let output = '';
    let truncated = false;
    let timedOut = false;
    const collect = (chunk) => {
      if (truncated) return;
      output += chunk.toString('utf8');
      if (output.length > MAX_OUTPUT) {
        output = `${output.slice(0, MAX_OUTPUT)}\n[output truncated at 256 KiB]\n`;
        truncated = true;
      }
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);

    const killTree = () => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
    }, timeoutMs);

    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ output: `${output}${error.message}\n`, exitCode: 127, timedOut, truncated });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      // Stop any background processes the command left behind.
      killTree();
      resolve({ output, exitCode: code === null ? (signal ? 128 : 1) : code, timedOut, truncated });
    });
  });
}

async function execute(body) {
  const timeoutMs = Math.min(Math.max(Number(body.timeoutMs) || DEFAULT_TIMEOUT_MS, 1000), MAX_TIMEOUT_MS);
  fs.mkdirSync(WORKSPACE, { recursive: true });
  writeFiles(body.files || {});
  const before = snapshot(WORKSPACE);
  const result = await runCommand(body.command, timeoutMs);
  const after = snapshot(WORKSPACE);

  const files = {};
  let total = 0;
  after.forEach((info, name) => {
    const prior = before.get(name);
    if (info.big || info.text === null || (prior && prior.hash === info.hash)) return;
    if (total + info.text.length > MAX_RETURN_TOTAL_BYTES) return;
    total += info.text.length;
    files[name] = info.text;
  });
  const deleted = [...before.keys()].filter((name) => !after.has(name));
  return { ...result, files, deleted };
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        reject(new Error('request too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function send(response, status, payload) {
  const text = JSON.stringify(payload);
  response.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
  response.end(text);
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    send(response, 200, { ok: true });
    return;
  }
  if (request.method !== 'POST' || request.url !== '/exec') {
    send(response, 404, { error: 'not found' });
    return;
  }
  let body;
  try {
    body = JSON.parse(await readBody(request));
  } catch (error) {
    send(response, 400, { error: error.message === 'request too large' ? 'request too large' : 'invalid json' });
    return;
  }
  const problem = validateBody(body);
  if (problem) {
    send(response, 400, { error: problem });
    return;
  }
  // Serialize: one command at a time per sandbox.
  const run = queue.then(() => execute(body));
  queue = run.catch(() => {});
  try {
    send(response, 200, await run);
  } catch (error) {
    send(response, 500, { error: 'execution failed' });
  }
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => console.log(`sandbox exec server on :${PORT}`));
}

module.exports = { safeRelativePath, validateBody, execute, server };
