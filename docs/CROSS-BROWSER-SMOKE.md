# Cross-browser smoke path

The full Playwright suite runs in Chromium only. A short learner path also runs
in Firefox and WebKit to catch browser-specific regressions:
[`tests/cross-browser-smoke.spec.js`](../tests/cross-browser-smoke.spec.js).

## What it covers

| Test | Route(s) | Browser behaviour exercised |
| --- | --- | --- |
| course page | `course_Contents.html` → Course 3 intro → quiz via table of contents → back to catalog | link navigation, injected header, `localStorage` "last visited" |
| quiz | `Course 3/AttacksQuizcourse3.html` | keyboard radio selection, label clicks, scoring, explanations, retry, `localStorage` persistence |
| terminal | `terminal/index.html?challenge=web-recon` → catalog | backend-free shell, solution check, progress chip, toast, cross-page progress |

The Python/Pyodide run, the CTF catalogue and the responsive-width checks stay
in the Chromium-only suite. The smoke path is meant to stay small, so add a
step only when a real cross-browser risk calls for it.

## Running it

```bash
npx playwright install firefox webkit          # once
npm run test:cross-browser                     # chromium, firefox, webkit
npx playwright test tests/cross-browser-smoke.spec.js --project=webkit
```

`npm run test:smoke` is pinned to `--project=chromium` and still runs the full
suite, including this spec.

## Reading a failure

Each step is named `<route> › <action>`, so failures read like this:

```
[webkit] › tests/cross-browser-smoke.spec.js:143:3 › Cross-browser learner smoke @cross-browser
  › quiz: Course 3 quiz scores, explains, retries, and persists
  › /HTML/Courses and Activities/Course 3/AttacksQuizcourse3.html › show score and explanations
```

In CI the `github` reporter also posts this as an annotation on the run.

## CI

The `cross-browser-smoke` job in `.github/workflows/ci.yml` runs once per engine
(`firefox`, `webkit`) with `fail-fast: false`. Chromium is not repeated because
the `smoke-tests` job already runs this spec in the full suite.

- Browser binaries are cached in `~/.cache/ms-playwright`. The cache key covers
  the OS, the installed `@playwright/test` version and the browser, so a
  Playwright upgrade refreshes it automatically.
- On a cache hit, only the OS packages are installed (`playwright install-deps`).
- The job has a 15-minute ceiling. Locally, the path takes about 20–40 s per
  browser.

## Security and safety

- Tests run against the repository's `http-server` on `127.0.0.1:3939`.
- The terminal's jsDelivr assets are answered by local stubs
  (`tests/helpers/terminal-stubs.js`).
- Every other non-loopback request (Font Awesome kit, Google Fonts, Umami,
  Chatbase) is aborted before it leaves the machine. Aborted URLs are attached
  to the test result for visibility.
- The CI job does not upload reports, screenshots or videos. They stay on the
  runner.

## Browser-specific skips

There are currently **no** skips. If an engine genuinely cannot run a step:

1. Document the limitation below: what fails, why it is a browser limitation and
   not an app bug, and the upstream issue if there is one.
2. Add an entry to `KNOWN_LIMITATIONS` in the spec, keyed by the test title,
   with `browser`, `reason`, and `doc` (a link to the entry below). The skip
   reason then shows in the report.

Do not call `test.skip` or `test.fixme` inline in a test body.

### Documented limitations

_None._
