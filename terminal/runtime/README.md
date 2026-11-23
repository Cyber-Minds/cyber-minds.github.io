# Terminal build sandbox (Cloudflare Worker + Container)

The browser terminal runs Python and single-file JavaScript locally. Everything
that needs a real toolchain runs here instead: `java`, `javac`, `jar`, `go`,
`gofmt`, `npm`, `npx`, `pnpm`, `yarn`, and `node` once npm packages are
installed (or when run with anything other than one `file.js`).

```
browser terminal ──POST /v1/exec──▶ Worker (origin check, limits)
                                       └─▶ per-session Container (Node 22 + npm, Go 1.24, JDK 17)
```

Each learner session gets its own container (`sessionId` is a random id kept in
`sessionStorage`). The workspace files are sent with every command; text files
the command creates or changes (for example `go.mod`, `package.json`) are sent
back. `node_modules`, Go caches and class files stay inside the container, so
`npm install` once and `require()` it in later commands. The container sleeps
after 15 minutes without commands and its files are then gone.

## Deploy

Needs a Cloudflare account on a plan with Containers, and Docker running
locally for the image build.

```bash
cd terminal/runtime
npm ci
npx wrangler login
npx wrangler deploy
```

Then put the Worker URL in `HTML/terminal/index.html`:

```html
<meta name="terminal-runtime-url" content="https://cyberminds-terminal-runtime.<your-subdomain>.workers.dev" />
```

and add that origin to `docs/ORIGINS.md`. Without the meta value the terminal
prints that the sandbox is not configured.

`ALLOWED_ORIGINS` in `wrangler.jsonc` lists the site origins that may call the
Worker. Browsers only: requests without an allowed `Origin` get 403.

## Run locally

```bash
cd terminal/runtime
npx wrangler dev --var "ALLOWED_ORIGINS:https://cyber-minds.github.io,http://localhost"
```

Serve the site from `http://localhost:3939` and set the meta tag to
`http://localhost:8787` while testing. `http://localhost` in `ALLOWED_ORIGINS`
enables any loopback port, for development only.

## Limits and safety

- 60 s default / 120 s max per command; one command at a time per sandbox.
- 256 KiB output, 300 files, 256 KiB per file, 2 MiB per request.
- 30 commands per minute per session (rate limit binding) and `max_instances: 10`.
- Containers have internet access so `npm install` and `go get` work. They hold
  no secrets and no credentials, run as the unprivileged `node` user, and are
  isolated per session. Do not add secrets to the image or Worker vars.
- No interactive stdin: programs that wait for input get EOF.

## Tests

```bash
npm test
```

covers the request policy and the exec server (path safety, timeout kill,
returned files).
