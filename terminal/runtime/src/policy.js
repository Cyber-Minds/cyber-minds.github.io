// Pure request policy for the runtime Worker: origin allowlist, session ids and body limits.

export const MAX_BODY_BYTES = 2 * 1024 * 1024;
export const MAX_COMMAND_LENGTH = 4096;
export const MAX_FILES = 300;
export const MAX_FILE_BYTES = 256 * 1024;
export const MAX_TIMEOUT_MS = 120000;
export const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export function parseAllowedOrigins(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      try {
        return new URL(item).origin;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function isOriginAllowed(origin, allowed) {
  if (!origin) return false;
  if (allowed.includes(origin)) return true;
  // Local development only: plain-http loopback origins on any port.
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname) && allowed.includes('http://localhost');
  } catch {
    return false;
  }
}

export function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

/** @returns {{ ok: true, value: object } | { ok: false, error: string }} */
export function validateExecBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'invalid body' };
  if (typeof body.sessionId !== 'string' || !SESSION_ID_PATTERN.test(body.sessionId)) {
    return { ok: false, error: 'invalid session' };
  }
  if (typeof body.command !== 'string' || !body.command.trim() || body.command.length > MAX_COMMAND_LENGTH) {
    return { ok: false, error: 'invalid command' };
  }
  const files = body.files === undefined ? {} : body.files;
  if (!files || typeof files !== 'object' || Array.isArray(files)) return { ok: false, error: 'invalid files' };
  const names = Object.keys(files);
  if (names.length > MAX_FILES) return { ok: false, error: 'too many files' };
  for (const name of names) {
    if (typeof files[name] !== 'string') return { ok: false, error: 'invalid files' };
    if (new TextEncoder().encode(files[name]).length > MAX_FILE_BYTES) return { ok: false, error: 'file too large' };
  }
  const timeoutMs = Math.min(Math.max(Number(body.timeoutMs) || 60000, 1000), MAX_TIMEOUT_MS);
  return { ok: true, value: { sessionId: body.sessionId, command: body.command, files, timeoutMs } };
}
