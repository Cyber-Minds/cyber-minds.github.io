# Terminal Reference

## Architecture

Flow:

1. Browser loads `HTML/terminal/index.html`.
2. Frontend requests `POST /api/session`.
3. Backend creates isolated Docker container and returns `sessionId`.
4. Frontend opens `WS /api/terminal/{sessionId}`.
5. Frontend syncs files through `GET /api/session/{sessionId}/files`.
6. Frontend reads file content through `GET /api/session/{sessionId}/file?path=...`.
7. Frontend requests cleanup with `DELETE /api/session/{sessionId}`.

## Frontend Module Map

JavaScript:

- `Javascript/terminal.js`: bootstrap loader.
- `Javascript/terminal/state.js`: shared state and static config.
- `Javascript/terminal/mock.js`: mock shell behavior (`?mockTerminal=1`).
- `Javascript/terminal/app.js`: UI logic, Monaco/xterm lifecycle, challenge flow.

CSS:

- `CSS/terminal.css`: stable entrypoint.
- `CSS/terminal/*.css`: base/shell/challenge/editor/terminal/overlay/responsive modules.

HTML:

- `HTML/terminal/index.html`: canonical terminal page.
- `HTML/terminal/landing.html`: canonical landing redirect.

## Backend Go Package Layout

- `terminal/backend/doc.go`: package-level GoDoc.
- `terminal/backend/hello.go`: server bootstrap and route registration.
- `terminal/backend/constants.go`: constants/types/shared runtime maps.
- `terminal/backend/environment.go`: environment parsing and Docker validation.
- `terminal/backend/middleware.go`: security headers, CORS, logging, health.
- `terminal/backend/session.go`: create/delete/cleanup sessions and rate limits.
- `terminal/backend/terminal_handler.go`: WebSocket <-> PTY bridge.
- `terminal/backend/files.go`: workspace file list/read helpers.

## API Endpoints

- `POST /api/session`: create a terminal session.
- `WS /api/terminal/{sessionId}`: interactive terminal stream.
- `GET /api/session/{sessionId}/files`: list files in `/workspace`.
- `GET /api/session/{sessionId}/file?path=...`: read a workspace file.
- `DELETE /api/session/{sessionId}`: terminate and cleanup session.
- `GET /health`: API and Docker readiness.

## Troubleshooting

- Session creation fails: verify Docker daemon is running and `terminal-base:latest` exists.
- WebSocket disconnects immediately: verify `ALLOWED_ORIGINS` and proxy WS forwarding.
- Editor tabs not updating: confirm `/api/session/{id}/files` is reachable and returning JSON.
- File reads fail: check `path` is relative and does not contain traversal patterns.

## Documentation Style

- Frontend uses JSDoc (`@file` headers + key function docs).
- Backend uses GoDoc comments and `doc.go` for package-level context.
- Keep docs concise and update this file when module boundaries or API contracts change.
