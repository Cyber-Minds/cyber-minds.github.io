# CyberMinds Terminal

Web-based coding + Linux terminal environment used by the CyberMinds CTF page.

This folder contains everything for `/terminal`:
- Docker image for isolated user shells
- Go backend API + WebSocket bridge
- Browser UI (challenge panel, editor, terminal)
- Compose files for local and production usage

## Documentation Map

Start here, then follow the docs in order:

1. `terminal/docs/QUICKSTART.md`
2. `terminal/docs/PRODUCTION.md`
3. `terminal/docs/TROUBLESHOOTING.md`

Useful references:
- `terminal/docker-compose.yml` (local compose)
- `terminal/docker-compose.prod.yml` (production compose)
- `terminal/backend/main.go` (API + WebSocket + session management)
- `terminal/frontend/index.html` (full UI)
- `terminal/Dockerfile.terminal` (actual terminal environment)

## What This Service Does

When a user opens `/terminal`:

1. Frontend calls `POST /api/session`
2. Backend starts an isolated container from `terminal-base:latest`
3. Frontend opens WS connection to `/api/terminal/:sessionId`
4. Backend attaches WS to `/bin/bash` inside that container
5. User gets a real Linux shell in browser

Each session has cleanup logic and resource limits.

## Architecture (Simple)

Browser UI (`frontend/index.html`) -> Go backend (`backend/main.go`) -> Docker daemon -> Per-user container

### Key API Endpoints

- `POST /api/session`: create terminal session
- `GET /api/session/{sessionId}/files`: list files in `/workspace`
- `GET /api/session/{sessionId}/file?path=...`: read file content
- `WS /api/terminal/{sessionId}`: interactive shell I/O
- `DELETE /api/session/{sessionId}`: cleanup session
- `GET /health`: health check

## Security Notes

Current mode is learning-focused, not hardened multi-tenant SaaS.

Important behavior:
- Each user gets a separate container
- Container has `sudo` enabled for `terminal-user` (intentional for CTF)
- Outbound networking is allowed in current setup

Before public internet production, review `terminal/docs/PRODUCTION.md` hardening section.

## Local Development Entry Points

From repo root (recommended):

```bash
make terminal-up
```

or run full local app flow:

```bash
make dev
```

See full exact steps in `terminal/docs/QUICKSTART.md`.
