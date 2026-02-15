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
ACME_EMAIL=you@yourdomain.com
CADDY_HTTP_PORT=80
CADDY_HTTPS_PORT=443

ALLOWED_ORIGINS=https://terminal.yourdomain.com
```

If you need multiple allowed origins:

```env
ALLOWED_ORIGINS=https://terminal.yourdomain.com,https://www.yourdomain.com
```

If `443` is already in use on the server, map Caddy to another host port:

```env
CADDY_HTTPS_PORT=8443
ALLOWED_ORIGINS=https://terminal.yourdomain.com:8443
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
curl -I https://terminal.yourdomain.com/health
```

Should return `200` (or successful HTTP response headers).

## 9) Open in browser

Visit:
- `https://terminal.yourdomain.com/`
- or your main site path that links to `/terminal/`

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

1. DNS wrong -> cert won’t issue.
2. Ports `80/443` blocked -> open firewall.
3. Wrong `ALLOWED_ORIGINS` -> browser CORS/WS errors.
4. Inspect logs:

```bash
docker compose -f terminal/docker-compose.prod.yml logs --tail=200 caddy backend
```
