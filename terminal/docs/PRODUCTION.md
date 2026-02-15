# Production Deployment Guide (Caddy + Docker)

This is the recommended production setup for `/terminal`.

## Goal

Expose terminal safely at your domain with:
- Caddy as reverse proxy + TLS
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
ACME_EMAIL=ops@example.com
CADDY_HTTP_PORT=80
CADDY_HTTPS_PORT=443

ALLOWED_ORIGINS=https://terminal.example.com
```

Notes:
- `APP_DOMAIN` is used by Caddy to serve your site and obtain certs.
- `ALLOWED_ORIGINS` is checked by backend CORS and WS origin validation.
- For multiple origins, use comma-separated values:
  `ALLOWED_ORIGINS=https://terminal.example.com,https://www.example.com`
- If `443` is occupied, set `CADDY_HTTPS_PORT` (for example `8443`) and include
  that port in `ALLOWED_ORIGINS`:
  `ALLOWED_ORIGINS=https://terminal.example.com:8443`

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
- `caddy` listening on `80/443`
- `backend` running with no public host port
- `terminal-base` helper image container

Health check from server:

```bash
curl -I https://terminal.example.com/health
```

## 5. How Routing Works

- Browser requests `https://terminal.example.com/...`
- Caddy terminates TLS and proxies to `backend:3000`
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
2. Confirm domain and TLS cert are active in Caddy logs.
3. Confirm backend is reachable from caddy container:

```bash
docker compose -f terminal/docker-compose.prod.yml exec caddy wget -qO- http://backend:3000/health
```
