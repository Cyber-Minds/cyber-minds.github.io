# Terminal Frontend JS Modules

- `state.js`: shared state and static challenge/template config.
- `mock.js`: local mock shell used by `?mockTerminal=1`.
- `app.js`: loader for modular runtime files under `app/`.
- `app/*.js`: split runtime by concern (core, workspace, challenges, runtime, ui).

Entry point:

- `../terminal.js` loads these modules in dependency order.
