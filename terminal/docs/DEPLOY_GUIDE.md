# Deploy `/terminal` to Production (Exact Steps)

Use this guide exactly as written.

## 1) Prepare server

```bash
sudo apt-get update
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
docker --version
docker compose version
```

## 2) Point DNS

Create an `A` record:
- `terminal.yourdomain.com` -> your server public IP

Wait until DNS resolves.

## 3) Clone project

```bash
git clone <YOUR_REPO_URL>
cd CyberMinds
```

## 4) Create production env file

Create `terminal/.env`:

```env
PORT=3000
ENVIRONMENT=production

APP_DOMAIN=terminal.yourdomain.com
CADDY_HTTP_PORT=18080

ALLOWED_ORIGINS=https://cyber-minds.github.io
```

If you need multiple allowed origins:

```env
ALLOWED_ORIGINS=https://cyber-minds.github.io,https://yourdomain.com
```

If `80/443` are already in use on the server, keep Caddy on an internal host port:

```env
CADDY_HTTP_PORT=18080
```

## 5) Start production stack

```bash
docker compose -f terminal/docker-compose.prod.yml --env-file terminal/.env up -d --build
```

## 6) Check containers

```bash
docker compose -f terminal/docker-compose.prod.yml ps
```

You should see:
- `caddy` up
- `backend` up
- `terminal-base` helper container

## 7) Check logs

```bash
docker compose -f terminal/docker-compose.prod.yml logs -f caddy
```

In another terminal:

```bash
docker compose -f terminal/docker-compose.prod.yml logs -f backend
```

## 8) Verify health

```bash
curl -H "Host: terminal.yourdomain.com" http://127.0.0.1:18080/health
```

Should return `200` (or successful HTTP response headers).

## 9) Open in browser

Visit:
- your main site terminal UI page (for this repo: `https://yourdomain.com/HTML/terminal.html`)

---

## Update later

```bash
cd CyberMinds
git pull
docker compose -f terminal/docker-compose.prod.yml --env-file terminal/.env up -d --build
```

## Stop / restart

```bash
docker compose -f terminal/docker-compose.prod.yml --env-file terminal/.env down
docker compose -f terminal/docker-compose.prod.yml --env-file terminal/.env up -d
```

## If it fails

1. DNS or edge routing wrong -> requests never reach `terminal.yourdomain.com`.
2. Internal port (`CADDY_HTTP_PORT`) blocked between edge and app host.
3. Wrong `ALLOWED_ORIGINS` -> browser CORS/WS errors.
4. Inspect logs:

```bash
docker compose -f terminal/docker-compose.prod.yml logs --tail=200 caddy backend
```
