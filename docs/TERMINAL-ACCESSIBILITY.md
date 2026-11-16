# CTF terminal accessibility baseline

The challenge catalog and terminal workspace should remain usable with a
keyboard and a screen reader from challenge selection through validation.

## Semantic structure and control state

- The catalog has a main landmark, a level-one heading, and a named challenge
  collection. Each challenge card is a single keyboard-operable link.
- The terminal has a named main workspace, challenge navigation, and named
  Challenge, Editor, and Terminal panels. The current challenge is exposed with
  `aria-current="step"`; completed challenge controls identify their completed
  state.
- Workspace files are tabs with one selected tab, a matching editor tab panel,
  and Left/Right/Home/End keyboard navigation. Monaco runs with its screen
  reader support enabled; xterm runs with screen-reader mode enabled.
- Mobile view buttons report their selected state. At widths up to 980px, only
  the selected panel is displayed; CSS-hidden panels and the desktop-hidden
  view switcher are consequently absent from sequential keyboard navigation.

## Announcements and focus

- Challenge changes, checker outcomes, and terminal connection states are
  announced through separate polite, atomic status regions.
- Checker announcements contain only the challenge name and pass/fail result.
  Terminal output, workspace file content, commands, and learner data are not
  copied into announcements or analytics.
- On mobile, when a challenge action hides its focused panel, focus moves to
  the Editor heading. On desktop, challenge selection and validation retain
  their initiating control when it remains visible.

## Regression suite

Run the deterministic browser checks locally with:

```sh
npx playwright test tests/terminal-accessibility.spec.js
```

The same spec is included in `npm run test:smoke`, which runs in CI. It uses
local terminal and editor stubs, disables screenshots and videos, and checks
320px, 768px, and desktop layouts without external accessibility services.
