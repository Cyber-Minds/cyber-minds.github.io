# Terminal Third-Party Assets

The public terminal page (`HTML/terminal/index.html`) is the only learner-facing
page that loads executable third-party code. This document is the reviewed
inventory of those assets, the integrity strategy protecting them, and the
procedure for changing one.

- **Machine-readable inventory:** `scripts/terminal-assets.json`
- **Offline drift check:** `scripts/check-terminal-assets.js` (runs in CI)
- **Live hash verification:** `scripts/verify-asset-integrity.js` (weekly + on update)
- **Origin approval:** `docs/ORIGINS.md` (this document pins versions, not origins)

```bash
npm run qa:assets          # offline drift check
npm run qa:assets:verify   # fetch each pinned asset and recompute its hash
```

## Inventory

| Asset | Package | Version | Declared in | Integrity |
|---|---|---|---|---|
| `xterm-css` | `@xterm/xterm` | 5.5.0 | HTML | SRI (sha384) |
| `xterm-js` | `@xterm/xterm` | 5.5.0 | HTML | SRI (sha384) |
| `xterm-addon-fit` | `@xterm/addon-fit` | 0.10.0 | HTML | SRI (sha384) |
| `monaco-loader` | `monaco-editor` | 0.45.0 | HTML | SRI (sha384) |
| `monaco-base-path` | `monaco-editor` | 0.45.0 | `Javascript/terminal/app/ui.js` | n/a — see below |
| `google-fonts-css` | Google Fonts | unversioned | HTML | n/a — see below |

All six load over `https://` from two approved origins: `cdn.jsdelivr.net` and
`fonts.googleapis.com`.

### Why the version lives in two places

Monaco needs both a loader script *and* a base path its AMD loader resolves
modules against. The loader is a `<script>` in the HTML; the base path is
`require.config({ paths: { vs } })` in `Javascript/terminal/app/ui.js`. They are
edited in different files and nothing in the browser complains if they disagree
— you get a subtly mismatched editor instead of an error.

`check-terminal-assets.js` ties them together: both must be present, both must
be the reviewed version, and the inventory must not list two different Monaco
versions. **Bumping Monaco means editing both files.**

## Integrity strategy

The goal was the smallest change that fails closed on GitHub Pages, which rules
out anything needing a build step or a server.

**Chosen: Subresource Integrity on the four jsDelivr assets.** Their URLs are
version-pinned and jsDelivr serves versioned paths immutably, so a sha384 hash
is stable. If the bytes ever change, the browser refuses to execute them. This
needs no build tooling and works on a static host.

Each pinned tag carries `crossorigin="anonymous"` as well. Without it the
response is opaque, the browser cannot verify it, and it is blocked outright —
so the check treats a missing `crossorigin` as an error, not a warning.

### What is deliberately not covered, and why

**Google Fonts CSS.** The response body varies by `User-Agent` — Google serves
different `@font-face` rules per browser. Verified 2026-10-26: the same URL
returned different bytes for a modern Chrome UA and a legacy MSIE UA. Any single
hash would break the page for every browser that did not match. Impact is
limited to typography: `fonts.gstatic.com` is `font-src` only, and a stylesheet
cannot execute script under the page CSP.

**Monaco's lazily loaded modules.** `loader.js` fetches `editor.main.js`, NLS
bundles, and workers at runtime through AMD. The AMD loader does not emit
`integrity` attributes, so SRI covers the entry point only. The compensating
control is the pinned, checked base path: an attacker cannot redirect those
loads without changing a version string that CI compares against the inventory.

**Alternatives considered and rejected:**

- *Vendoring Monaco locally* would close the lazy-chunk gap, but Monaco's `min`
  bundle is several megabytes across many files. That is a large, ongoing
  maintenance burden for the residual risk, and the task called for the smallest
  safe strategy. Worth revisiting if Monaco's role grows.
- *`require-sri-for` in CSP* is not implemented in current browsers; it would be
  a comment, not a control.

## Checks

`scripts/check-terminal-assets.js` is deterministic and offline. It reads
repository bytes only and never contacts a CDN, so it cannot fail on a network
blip. It fails on:

- an origin outside `approvedOrigins`
- a `http://` or protocol-relative (`//`) external reference
- a URL whose version is not the reviewed one (reported as drift, naming the
  reviewed version)
- a reviewed asset that disappeared from the page
- a missing, malformed, or mismatched `integrity`
- a missing `crossorigin` on an SRI-pinned asset
- Monaco's loader version disagreeing with its runtime base path
- an inventory entry that is internally inconsistent, claims SRI with no hash,
  or waives SRI with no recorded reason

`scripts/verify-asset-integrity.js` does the networked half: it fetches each
pinned asset and recompares the digest. It is **not** in the blocking CI path, so
a CDN hiccup cannot fail an unrelated pull request. It runs weekly
(`.github/workflows/asset-integrity.yml`) and as a step in the update procedure.

`tests/terminal-assets.spec.js` asserts the HTML *as served* still carries every
reviewed hash. This matters because the mock-terminal suites strip `integrity`
so their CDN stubs can run (see `tests/helpers/terminal-stubs.js`) — without
this guard, deleting SRI from the page would not fail a single test.

Its live-CDN test (`TERMINAL_LIVE_CDN=1`) loads the page against the real CDN
with SRI enforced and asserts the terminal starts and Monaco renders. A wrong
hash blocks the script and the test fails, which is the only check that proves a
recorded hash is actually correct in a real browser.

## Updating an asset

**Owner:** frontend supply-chain maintainers. **Reviewer:** a second maintainer
must approve the version change — this is a dependency bump on the page that
runs learner code, not a routine edit.

1. **Check the release.** Read the upstream changelog between the current and
   target version. Note any change to how the asset loads further resources.
2. **Compute the new hash** from the exact URL you intend to ship:

   ```bash
   curl -sfL "https://cdn.jsdelivr.net/npm/<pkg>@<version>/<path>" \
     | openssl dgst -sha384 -binary | openssl base64 -A
   ```

3. **Update `scripts/terminal-assets.json`**: `version`, `url`, `integrity`, and
   the top-level `reviewed` date.
4. **Update the page** (`HTML/terminal/index.html`) — and `ui.js` too if this is
   Monaco.
5. **Run the checks:**

   ```bash
   npm run qa:assets          # offline: page matches inventory
   npm run qa:assets:verify   # network: hashes match what the CDN serves
   TERMINAL_LIVE_CDN=1 npx playwright test tests/terminal-assets.spec.js
   npm run test:smoke         # terminal still starts with stubs
   ```

6. **Open a PR** describing the version delta and why it is needed. CI reruns the
   offline check on every push.
7. **Verify on the deployed site** after merge: open the terminal page on GitHub
   Pages, confirm the editor and terminal render, and confirm the console shows
   no integrity errors.

### Adding a new origin

Do not add one to `approvedOrigins` alone. Follow
`docs/ORIGINS.md#appendix-how-to-add-a-new-external-origin` first: purpose, data
flow, and security justification get recorded there, and the origin is added to
`scripts/qa-allowlist.json`. Only then add the asset here with its hash.

## Rollback

The previous version and hash are in git history for
`scripts/terminal-assets.json`. To roll back:

1. `git log -p scripts/terminal-assets.json` and find the last good entry.
2. Restore `version`, `url`, and `integrity` in the inventory, and the matching
   tag in `HTML/terminal/index.html` (plus `ui.js` for Monaco).
3. `npm run qa:assets && npm run qa:assets:verify`.
4. Ship as a normal PR. GitHub Pages redeploys on merge to `main`; there is no
   separate asset deployment to revert.

Because the checker is bidirectional, a partial rollback — inventory reverted
but the page not, or vice versa — fails CI rather than shipping a mismatch.

## If `verify-asset-integrity` reports a mismatch

A hash mismatch on an **immutable versioned URL** means either the inventory
hash was recorded incorrectly (in which case the live page is already broken and
someone would have noticed), or the CDN served different bytes for a pinned
version — a supply-chain event.

**Do not rehash to make it pass.** That is the one action that converts a
detection into a silent compromise. Instead:

1. Re-fetch from a second network and compare; confirm it is not a local proxy.
2. Compare against the npm tarball for the same version
   (`npm pack <pkg>@<version>`).
3. If the bytes genuinely changed, treat it as an incident per
   `docs/ORIGINS.md#incident-response`, and pin a local copy until it is
   resolved.
