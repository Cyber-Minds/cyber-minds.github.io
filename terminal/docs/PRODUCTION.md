# Production Deployment Guide (Caddy + Docker)

This is the recommended production setup for `/terminal`.

## Goal

Expose terminal backend safely at your domain with:
- Caddy as reverse proxy (internal HTTP listener)
- Backend only on internal Docker network
- Explicit CORS / WebSocket origin allowlist

## 1. Prerequisites

On your server:
- Docker and `docker compose`
- DNS A/AAAA record for your terminal domain

Example domain used below: `terminal.example.com`

## 2. Configure Environment

Create `terminal/.env` (or copy from `.env.example`):

```env
PORT=3000
ENVIRONMENT=production

APP_DOMAIN=terminal.example.com
CADDY_HTTP_PORT=18080

ALLOWED_ORIGINS=https://www.example.com
```

Notes:
- `APP_DOMAIN` is the host Caddy accepts (via `Host` header).
- `ALLOWED_ORIGINS` is checked by backend CORS and WS origin validation.
- It must match where `HTML/terminal.html` is served (main site origin), not
  necessarily the API domain.
- For multiple origins, use comma-separated values:
  `ALLOWED_ORIGINS=https://example.com,https://www.example.com`
- `CADDY_HTTP_PORT` is the host port to publish Caddy on. Keep it off `80/443`
  when those are already in use.

## 3. Deploy

From repo root:

```bash
docker compose -f terminal/docker-compose.prod.yml --env-file terminal/.env up -d --build
```

## 4. Verify

Check running services:

```bash
docker compose -f terminal/docker-compose.prod.yml ps
```

Expected:
- `caddy` listening on `${CADDY_HTTP_PORT}` (default `18080`)
- `backend` running with no public host port
- `terminal-base` helper image container

Health check from server:

```bash
curl -H "Host: terminal.example.com" http://127.0.0.1:18080/health
```

## 5. How Routing Works

- Browser loads terminal UI from main website (`HTML/terminal.html`)
- UI sends API + WS requests to `https://terminal.example.com/...`
- Edge forwards to this stack on `http://<host>:${CADDY_HTTP_PORT}`
- Caddy proxies to `backend:3000`
- WebSocket upgrades for terminal are forwarded automatically by Caddy

## 6. Security Checklist

- Do not use wildcard CORS in production.
- Keep `ALLOWED_ORIGINS` explicit.
- Keep backend internal (no `ports` published in prod compose).
- Add auth in front of `/terminal` if this is public-facing.
- Monitor backend logs and session volume.

## 7. Logs

```bash
docker compose -f terminal/docker-compose.prod.yml logs -f caddy
docker compose -f terminal/docker-compose.prod.yml logs -f backend
```

## 8. Update / Rollback

Update:

```bash
git pull
docker compose -f terminal/docker-compose.prod.yml --env-file terminal/.env up -d --build
```

Rollback:
- checkout previous commit/tag
- re-run same compose command

## 9. Troubleshooting

If browser sees CORS or WS errors:
1. Verify `Origin` exactly matches `ALLOWED_ORIGINS`.
2. Confirm edge proxy is forwarding the correct `Host` and websocket upgrade headers.
3. Confirm backend is reachable from caddy container:

```bash
docker compose -f terminal/docker-compose.prod.yml exec caddy wget -qO- http://backend:3000/health
```
