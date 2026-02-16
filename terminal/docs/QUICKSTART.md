# Terminal Quickstart

This is the fastest way to run CyberMinds terminal locally.

## 1. Prerequisites

You need:
- Docker Desktop / OrbStack running
- `docker compose` available
- Port `3000` free (terminal backend)
- If serving full website locally, port `8080` free

Check:

```bash
docker --version
docker compose version
```

## 2. Start Terminal Stack

From repo root:

```bash
make terminal-up
```

What this does:
- builds terminal base image (`terminal/Dockerfile.terminal`)
- builds backend image (`terminal/Dockerfile`)
- starts compose stack from `terminal/docker-compose.yml`

## 3. Open Terminal UI

Use either:
- `http://localhost:8080/HTML/terminal.html` (recommended, from main site)
- `http://localhost:8080/HTML/terminal.html?apiOrigin=http://localhost:3000` (explicit backend override)

Notes:
- Terminal UI is now part of the main site (`HTML/terminal.html`).
- Terminal backend is API-only and runs separately on `http://localhost:3000`.

## 4. Verify It Works

In terminal UI, run:

```bash
python3 --version
node --version
java --version
go version
```

Create a file and ensure tab appears in editor:

```bash
touch try.md
echo "hello" > try.md
```

Then open `try.md` tab in editor panel.

## 5. Common Commands

From repo root:

```bash
make terminal-up      # build + start
make terminal-down    # stop
make terminal-logs    # backend logs
```

From `terminal/` folder:

```bash
make build
make run
make stop
```

## 6. If Something Fails

See `terminal/docs/TROUBLESHOOTING.md`.
