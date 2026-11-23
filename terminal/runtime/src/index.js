import { Container, getContainer } from '@cloudflare/containers';
import { MAX_BODY_BYTES, corsHeaders, isOriginAllowed, parseAllowedOrigins, validateExecBody } from './policy.js';

/** One sandbox per learner session; sleeps after 15 minutes without commands. */
export class SandboxContainer extends Container {
  defaultPort = 8080;
  sleepAfter = '15m';
  enableInternet = true;
}

function json(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);

    if (url.pathname === '/health' && request.method === 'GET') return json(200, { ok: true });
    if (url.pathname !== '/v1/exec') return json(404, { error: 'not found' });

    if (!isOriginAllowed(origin, allowed)) return json(403, { error: 'origin not allowed' });
    const cors = corsHeaders(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json(405, { error: 'method not allowed' }, cors);

    const length = Number(request.headers.get('Content-Length') || 0);
    if (length > MAX_BODY_BYTES) return json(413, { error: 'request too large' }, cors);
    let text;
    try {
      text = await request.text();
    } catch {
      return json(400, { error: 'invalid body' }, cors);
    }
    if (text.length > MAX_BODY_BYTES) return json(413, { error: 'request too large' }, cors);

    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return json(400, { error: 'invalid json' }, cors);
    }
    const checked = validateExecBody(body);
    if (!checked.ok) return json(400, { error: checked.error }, cors);
    const { sessionId, command, files, timeoutMs } = checked.value;

    if (env.EXEC_LIMITER) {
      const { success } = await env.EXEC_LIMITER.limit({ key: sessionId });
      if (!success) return json(429, { error: 'too many commands, slow down' }, cors);
    }

    try {
      const sandbox = getContainer(env.SANDBOX, sessionId);
      const upstream = await sandbox.fetch(
        new Request('http://sandbox/exec', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command, files, timeoutMs }),
        })
      );
      const payload = await upstream.text();
      return new Response(payload, {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors },
      });
    } catch {
      return json(503, { error: 'sandbox unavailable, try again' }, cors);
    }
  },
};
