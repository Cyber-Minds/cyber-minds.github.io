# Terminal Frontend JS Modules

- `state.js`: shared state and static challenge/template config.
- `mock.js`: local mock shell used by `?mockTerminal=1`.
- `app.js`: loader for modular runtime files under `app/`.
- `app/*.js`: split runtime by concern (core, workspace, challenges, runtime, ui).

Entry point:

- `../terminal.js` loads these modules in dependency order.

## Local Draft Recovery

Terminal editor drafts are stored in browser `localStorage` only. They are not
sent to analytics or synced to the terminal backend.

Draft keys use the `cm_terminal_draft_v1` prefix and include the active
challenge plus the editor surface:

- Template tab: `cm_terminal_draft_v1:<challenge-id>:template:<language>`
- Workspace file: `cm_terminal_draft_v1:<challenge-id>:workspace:<file-path>`

The app restores the active draft when the same challenge and tab/file loads
again. Recovery happens silently; the app does not expose a draft browser or
discard UI.

Do not add terminal session IDs, credentials, authentication material, or other
server-side secrets to draft keys or values.
