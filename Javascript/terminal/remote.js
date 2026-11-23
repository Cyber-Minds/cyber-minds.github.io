/**
 * @file Remote build sandbox client.
 *
 * Java, Go and npm cannot run in the browser, so those commands are sent to
 * the Cloudflare sandbox in terminal/runtime. The workspace files are sent
 * with every command and any files the command creates are copied back.
 */
const REMOTE_COMMANDS = new Set([
  'java', 'javac', 'jar', 'go', 'gofmt', 'npm', 'npx', 'pnpm', 'yarn', 'corepack',
]);
const REMOTE_TIMEOUT_MS = 120000;
const remoteRuntime = {
  sessionId: '',
  announced: false,
  packagesInstalled: false,
};

function getRemoteRuntimeUrl() {
  const meta = document.querySelector('meta[name="terminal-runtime-url"]');
  const candidate = meta ? meta.content.trim() : '';
  if (!candidate) return '';
  try {
    const url = new URL(candidate);
    // https only; plain http is allowed for a local `wrangler dev` runtime.
    const loopback = ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !loopback) return '';
    return url.origin;
  } catch {
    return '';
  }
}

function getRemoteSessionId() {
  if (remoteRuntime.sessionId) return remoteRuntime.sessionId;
  let id = '';
  try {
    id = window.sessionStorage.getItem('cm_terminal_runtime_session') || '';
  } catch {
    id = '';
  }
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
    const bytes = new Uint8Array(18);
    window.crypto.getRandomValues(bytes);
    id = Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('').slice(0, 32);
    try {
      window.sessionStorage.setItem('cm_terminal_runtime_session', id);
    } catch {
      // Session storage can be blocked; the id then lives for this page only.
    }
  }
  remoteRuntime.sessionId = id;
  return id;
}

/** True when a command line must run in the sandbox instead of the browser. */
function needsRemoteRuntime(line) {
  const segments = String(line).split(/&&|\|\||;|\|/);
  return segments.some((segment) => {
    const [first, ...rest] = segment.trim().split(/\s+/);
    if (REMOTE_COMMANDS.has(first)) return true;
    // Plain `node file.js` stays in the browser until npm packages exist.
    return first === 'node' && (remoteRuntime.packagesInstalled || rest.length !== 1 || !rest[0].endsWith('.js'));
  });
}

function collectRemoteFiles() {
  const files = {};
  Object.entries(mockState.files).forEach(([name, content]) => {
    if (typeof content === 'string' && content.length <= 256 * 1024) files[name] = content;
  });
  return files;
}

async function runRemoteCommand(line) {
  const base = getRemoteRuntimeUrl();
  if (!base) {
    mockWriteLine('The build sandbox is not configured for this deployment, so java, go and npm are unavailable here.');
    return;
  }
  if (!remoteRuntime.announced) {
    remoteRuntime.announced = true;
    mockWriteLine('\x1b[2mStarting your build sandbox...\x1b[0m');
  }

  let response;
  try {
    response = await fetch(`${base}/v1/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: getRemoteSessionId(),
        command: line,
        files: collectRemoteFiles(),
        timeoutMs: REMOTE_TIMEOUT_MS,
      }),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    mockWriteLine('bash: the build sandbox is unreachable. Check your connection and try again.');
    return;
  }

  let result = null;
  try {
    result = await response.json();
  } catch {
    result = null;
  }
  if (!response.ok || !result) {
    const reason = (result && result.error) || `status ${response.status}`;
    mockWriteLine(`bash: build sandbox error: ${reason}`);
    return;
  }

  // eslint-disable-next-line no-control-regex
  const controlCharacters = /[\x00-\x08\x0b\x0c\x0e-\x1a\x1c-\x1f\x7f-\x9f]/g;
  const output = String(result.output || '').replace(controlCharacters, '');
  if (output) mockWrite(`${output.replace(/\r?\n/g, '\r\n')}${output.endsWith('\n') ? '' : '\r\n'}`);
  if (result.timedOut) mockWriteLine(`[command timed out after ${REMOTE_TIMEOUT_MS / 1000}s]`);

  Object.entries(result.files || {}).forEach(([path, content]) => setMockFile(path, content));
  (result.deleted || []).forEach((path) => {
    delete mockState.files[normalizeMockPath(path)];
  });
  if (/\b(npm|pnpm|yarn)\s+(install|i|add|ci)\b/.test(line) && result.exitCode === 0) {
    remoteRuntime.packagesInstalled = true;
  }
  syncWorkspaceFiles();
}
