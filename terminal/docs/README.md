# CyberMinds Terminal

CyberMinds Terminal is a web-based coding and Linux shell environment used by CTF challenges.

This docs folder is intentionally compact:

1. `terminal/docs/README.md` (this file)
2. `terminal/docs/DEPLOY.md` (deployment steps)
3. `terminal/docs/REFERENCE.md` (architecture, API, troubleshooting, security)

## Quick Start

From repo root:

```bash
make terminal-up
```

Then open:

- `http://localhost:8080/HTML/terminal/index.html`

## What Runs Where

- Frontend UI: `HTML/terminal/index.html`
- Frontend scripts: `Javascript/terminal/` modules, loaded by `Javascript/terminal.js`
- Frontend styles: `CSS/terminal/` modules, imported by `CSS/terminal.css`
- Backend API/WebSocket: `terminal/backend/*.go`
- Shell runtime image: `terminal/Dockerfile.terminal`

## Security Defaults

- Origin checks for CORS and WebSocket upgrades.
- Session creation rate limiting per client IP.
- Active session caps and container CPU/memory limits.
- Workspace path normalization for file reads.

For implementation details and endpoint references, see `terminal/docs/REFERENCE.md`.
