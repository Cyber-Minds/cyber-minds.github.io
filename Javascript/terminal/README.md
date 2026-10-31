# Terminal Frontend JS Modules

- `state.js`: shared state and static challenge/template config.
- `mock.js`: browser-only shell simulation used by default; `?realTerminal=1`
  opts into the legacy hosted PTY.
- `app.js`: loader for modular runtime files under `app/`.
- `app/*.js`: split runtime by concern (core, workspace, challenges, runtime, ui).

Entry point:

- `../terminal.js` loads these modules in dependency order.

## Browser course contract

The public terminal runs without a backend. Lessons may use the virtual
`/workspace` files, `pwd`, `whoami`, `ls`, `cat`, `touch`, `echo` redirection,
`grep`, field-printing `awk`, `sort`, `uniq`, `wc -l`, `ss -tulpen`, and `curl`
against the simulated local web service. The service returns fixed synthetic
headers and does not make network requests. Unsupported shell commands print
an explicit message instead of being passed to the host.

New courses should declare their required commands, fixture files, and
checker behavior before they are added. A course needing arbitrary package
installation, real internet access, system services, or a command outside the
supported list needs a separate runtime decision; this simulation does not
provide a general Linux or npm environment.

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
