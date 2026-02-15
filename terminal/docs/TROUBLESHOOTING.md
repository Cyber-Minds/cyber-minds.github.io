# Terminal Troubleshooting

Use this when something breaks.

## 1. `go: command not found`

Cause:
- Old terminal image still running.

Fix:

```bash
make terminal-up
```

Then in terminal UI:

```bash
go version
```

## 2. Vim disconnects terminal

If this still happens:

1. Hard refresh browser (`Cmd+Shift+R`)
2. Rebuild backend:

```bash
make terminal-up
```

3. Check backend logs for WS errors:

```bash
make terminal-logs
```

## 3. Editor tabs not showing created files

Expected behavior:
- Files under `/workspace` appear in tabs within ~2 seconds.

If not:
- Confirm terminal session is connected
- Create file again:

```bash
touch try.md
echo "hello" > try.md
```

- Watch logs for `/api/session/{id}/files` errors.

## 4. `POST /api/session` returns 404

Cause:
- Wrong frontend/backend routing or proxy.

Fix:
- Run `make terminal-up`
- If using live-server, ensure `/api` traffic reaches backend at `:3000`
- Test directly:

```bash
curl -X POST http://127.0.0.1:3000/api/session
```

## 5. Nginx in container permission errors

If `nginx` fails with permission denied:
- Rebuild image; non-root nginx config is already in Dockerfile.

```bash
make terminal-up
```

## 6. Containers fail to start

Check Docker daemon and compose status:

```bash
docker info
docker compose -f terminal/docker-compose.yml ps
```

If image build got corrupted:

```bash
docker compose -f terminal/docker-compose.yml down
make terminal-up
```

## 7. Browser UI stale after changes

Cause:
- Cached frontend JS/CSS.

Fix:
- Hard refresh (`Cmd+Shift+R`)
- If needed, open in private window.

## 8. Backend compile errors

From backend folder:

```bash
cd terminal/backend
gofmt -w main.go
go build ./...
```

## 9. How to collect useful debug output for teammates

Share these in issue/PR:

```bash
docker compose -f terminal/docker-compose.yml ps
docker compose -f terminal/docker-compose.yml logs --tail=200 backend
```

And include:
- exact URL used
- exact terminal command used
- screenshot or copied browser console error

