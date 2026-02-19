# Deploy `/terminal` (Production)

This runbook deploys the terminal backend stack and exposes it behind Caddy.

## 1. Prepare Environment

Create `terminal/.env`:

```env
PORT=3000
ENVIRONMENT=production
APP_DOMAIN=terminal.example.com
CADDY_HTTP_PORT=18080
ALLOWED_ORIGINS=https://your-main-site.example.com
```

Notes:

- `ALLOWED_ORIGINS` must be the exact origin serving the terminal UI page.
- Canonical UI page is `HTML/terminal/index.html` on the main site deployment.

## 2. Build and Start Stack

```bash
docker compose -f terminal/docker-compose.prod.yml --env-file terminal/.env up -d --build
```

## 3. Wire Public Caddy to Terminal Stack

Find your public Caddy container (bound to `:443`), ensure it shares network `terminal_default`, and add a route:

```caddy
terminal.example.com {
  reverse_proxy terminal-caddy-1:80
}
```

Reload Caddy after updating config.

## 4. Verify

```bash
curl -I https://terminal.example.com/health
```

Expected:

- `200 OK` from `/health`
- Browser terminal page can create session and connect WebSocket

## 5. Post-Deploy Checks

- Session create works: `POST /api/session`
- WebSocket works: `WS /api/terminal/{sessionId}`
- File sync works: `GET /api/session/{sessionId}/files`

If session creation fails, check Docker daemon access and image `terminal-base:latest`.
