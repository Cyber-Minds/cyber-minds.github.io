# Responsive Layout Testing

Two Playwright suites check course lessons at every supported width and fail
on layout defects that navigation tests cannot see: content overflowing
sideways, controls sitting on top of each other, navigation that is
unreachable or unreadable, and focus that is invisible.

| Suite | What it runs | Time |
|---|---|---|
| `tests/responsive-course-pages.spec.js` | Six canary pages, full assertion set including keyboard focus | ~25 s |
| `tests/responsive-course-sweep.spec.js` | **Every published lesson** (85 today) at every width, geometry plus focused checks per layout shape | ~70 s on 4 workers |

```bash
npm run test:responsive            # canary set (also part of test:smoke)
npm run test:responsive:sweep      # every published lesson, 4 workers
npx playwright test --project=responsive-sweep --grep "Course 6"          # one course
npx playwright test --project=responsive-sweep --grep "mobile-320.*Quiz"  # one width, one shape
npm run test:responsive:baseline   # rebuild tests/responsive-known-issues.json (see below)
```

Both run entirely against the repository test server. CI runs the canary set
in **Frontend Smoke Tests** and the sweep in its own **Responsive Course
Sweep** job.

**Viewports**: 320 (small phone), 768 (tablet), 1024 (laptop), 1440 (desktop).
Each test loads its page fresh at its width.

## The canary set

One hand-picked page per original layout shape. All six share the page shell,
so a shell regression shows up everywhere, while a quiz- or activity-specific
regression shows up on one.

| Shape | Page |
|---|---|
| `article` | Course 10, Networking Basics |
| `quiz` | Course 10, Networking Quiz 1 |
| `activity` | Course 3, SQL Injection Activity |
| `explore-activity` | Course 6, Explore File System |
| `sidebar-navigation` | Course 11, Introduction |
| `previous-next` | Course 12, AI Security |

Per page per viewport:

- *No horizontal overflow.* Both the document-level check
  (`scrollWidth <= clientWidth`) and a per-element scan. The per-element scan
  matters: an element can extend past the viewport while the document does not
  scroll, because an ancestor clips it. The content is then cut off and
  unreadable, with nothing to indicate it.
- *Navbar clear of content.* The header must not overlap the first content
  block, whether it is static, sticky, or fixed.
- *Header controls do not collide.* Pairwise box intersection across header
  links, buttons, and the logo. Nesting is not a collision.
- *Navigation is reachable and readable.* Rendered links meet the WCAG 2.2 AA
  24px target minimum and are not clipped by their own box. When the menu is
  collapsed, the toggle that reveals it must itself meet that minimum,
  otherwise navigation is unreachable at that width.
- *Active page state and visible focus* (once per viewport, on the shared
  navbar): exactly one `aria-current="page"`, and a keyboard-focused link must
  render differently from an unfocused peer.

These pages all pass outright; the canary set has no known-issues list.

## The course sweep

### Which pages

The page list is built from the repository when the tests are collected, by
`tests/helpers/course-inventory.js`. Nobody maintains it by hand:

1. **Published courses** are the `type: "course"`, `status: "published"`
   entries in `scripts/content-manifest.json`.
2. **Published lessons** are the files under `HTML/Courses and Activities/Course N/`
   that a learner can reach by following links from `HTML/course_Contents.html`.
3. Each lesson's **layout shape** is read from its source (which header it
   uses, and what kind of content sits in the lesson column), so the inventory
   is identical on every machine.

A new lesson joins the sweep the moment the catalog links to it. Inventory
tests at the end of the spec fail if a published course has no reachable
lesson, if a lesson file in a published course is not linked from anywhere
(it would silently escape the sweep), or if a page has a shape the suite does
not recognise.

### Layout shapes

A shape is `header/content`. Header is `shared-navbar` (injected by
`Javascript/header.js`), `legacy-header` (the page carries its own static
header), or `missing-header` (the placeholder is there but `header.js` is not
loaded, so there is no navigation at all). Content is the first match of:
`quiz` (uses `quiz-engine.js`), `code-editor` (a `course*editor.bundle.js`),
`embedded-game` (a non-YouTube iframe), `flip-cards`, `video-lesson` (a
YouTube embed), `activity` (file name says Activity or Explore), `article`.

Shapes present today:

| Shape | Lessons | Courses | Representative |
|---|---|---|---|
| `shared-navbar/article` | 53 | 1, 3–12 | Course 1, CIA Triad |
| `shared-navbar/quiz` | 14 | 3, 4, 6–12 | Course 3, Attacks Quiz |
| `shared-navbar/video-lesson` | 5 | 1, 3, 4, 5 | Course 1, Cybersecurity Jobs |
| `shared-navbar/activity` | 4 | 3, 6 | Course 3, SQL Injection Activity |
| `legacy-header/article` | 3 | 2 | Course 2, Cybersecurity for Company |
| `shared-navbar/code-editor` | 2 | 4, 5 | Course 4, Automation with Python |
| `shared-navbar/flip-cards` | 2 | 5 | Course 5, Caesar Cipher and RSA |
| `legacy-header/video-lesson` | 1 | 2 | Course 2, Cybersecurity for Individuals |
| `shared-navbar/embedded-game` | 1 | 3 | Course 3, Defender game |

Every page of every shape runs at every width, so every shape is checked at
every width many times over, not just its representative.

### Checks

Each check has an id; the ids are what `tests/responsive-known-issues.json`
lists.

| Id | Applies to | Fails when |
|---|---|---|
| `overflow:<element>` | all | that element extends past the viewport edge (one id per outermost offending element) |
| `horizontal-scroll` | all | the document scrolls sideways |
| `header-covers-lesson` | all | the header overlaps the first block of the lesson |
| `header-controls-overlap` | all | two header links, buttons, or the logo intersect |
| `sidebar-covers-lesson` | below 768px | the course sidebar and the lesson column overlap instead of stacking |
| `lesson-controls` | all | a quiz option, quiz button, editor Run control, or Previous/Next link is off screen or below 24px. Visually hidden radio inputs are judged by their label, which is what the learner taps |
| `navigation` | all | shared navbar: as in the canary set, plus a page where the navbar never rendered. Legacy header: every header link must be on screen and at least 24px, because that header has no menu to fall back on |
| `embed-fit` | video, game, code editor | the iframe or editor is missing, has no size, or does not fit inside the viewport and the lesson column |
| `flip-cards` | flip cards | a card runs past the viewport or covers another card |

### Known issues and the ratchet

Courses 1 to 10 were built without mobile breakpoints, so many lessons fail
today. Those failures are recorded, per page, width, and check id, in
`tests/responsive-known-issues.json`. For each test:

- A check that fails and **is not listed** fails the test as a new
  regression, naming the page, the width, and the element.
- A check that is listed but **now passes** also fails the test, telling you
  to delete that entry. The file can only shrink unless someone edits it on
  purpose.

When you fix a page, the sweep tells you exactly which entries to delete.
After a large fix, regenerate the file instead and review the diff:

```bash
npm run test:responsive:baseline
git diff tests/responsive-known-issues.json   # should only remove lines
```

Do not regenerate the file to make a new regression pass. A new entry is a
known defect that learners will see, and it should come with a reason in the
pull request.

Known limit: the ratchet works at check-id level. `overflow` is split per
element, so a new overflowing element is caught on a page that already has
one, but a second undersized quiz control on a page already listed under
`lesson-controls` is not.

### Determinism and privacy

- Pages come from the repository test server. Requests to any other origin
  (icon kits, analytics, YouTube, the game host) are answered with an empty
  response by the test itself, so results do not depend on a CDN and nothing
  about the run leaves the machine. Embeds keep their size: an iframe's box
  comes from its own attributes and CSS.
- Animations and transitions are frozen, fonts are awaited, and layout is
  settled before anything is measured.
- The `responsive-sweep` project takes no screenshots, video, or traces, and
  the CI job uploads no report. No fixture carries learner data.
- Course URLs, including the `Course N/` folders and file names that the
  GitHub Pages project site serves, are read as they are; nothing is renamed.

## Why geometry instead of screenshots

Pixel baselines would need either an external screenshot service or a committed
image set, and they fail on font-rendering differences between a developer
machine and CI. Every assertion here is a number the browser computed, so a
failure names the element to repair instead of showing a diff image someone has
to interpret.

## Reproducing a failure

Sweep failures name the page, its shape, the width, and each failing check:

```
Error: Course 7/Spoofingcourse7.html [shared-navbar/article] at mobile-320: new layout failures:
  [overflow:div.right-side_rectangle] div.right-side_rectangle spans 3..903, past the 320px viewport
```

To see it yourself:

```bash
npx playwright test --project=responsive-sweep --grep "mobile-320.*Spoofing" --headed
```

Or open the page directly and set the viewport in your browser's device
toolbar. The assertions correspond to things you can read off the DOM:

```js
// horizontal overflow
document.documentElement.scrollWidth > document.documentElement.clientWidth

// which elements stick out
[...document.querySelectorAll('body *')]
  .filter((el) => el.getBoundingClientRect().right >
                  document.documentElement.clientWidth + 1)
```

## Repairing by failure type

**An element extends past the viewport.** Find what sets its width. In order of
how often it is the cause here:

1. *A fixed width in `px` or `em`*, often inline on an image. Replace
   `width: 40em` with `max-width: 40em; width: 100%; box-sizing: border-box`.
   The `box-sizing` matters when the element also has a border — without it the
   border is added outside the width and reintroduces the overflow.
2. *An unconstrained image.* `max-width: 100%; height: auto` on the image. An
   `<img>` with no width constraint contributes its full intrinsic width to its
   container's minimum size.
3. *A flex item that cannot shrink.* Flex items default to `min-width: auto`,
   which refuses to go below their content's minimum. `min-width: 0` lets them
   shrink.
4. *A `white-space: nowrap` label* in a narrow column. Allow it to wrap at the
   breakpoint.

**The sidebar sits off the right edge instead of stacking.** The page has no
mobile breakpoint. Courses 11 and 12 (`main11.css`) carry the established
pattern — copy it:

```css
@media (max-width: 980px) {
  section { flex-direction: column; width: 92%; margin-left: 4%; margin-right: 4%; }
  .left-side_rectangle,
  .right-side_rectangle { min-width: 0; width: 100%; margin: 1em 0; }
}
```

One trap: if the page's base `section` rule also sets `flex-wrap: wrap`, adding
`flex-direction: column` makes overflowing items wrap into a **second column
off the right edge** rather than stacking. Add `flex-wrap: nowrap` inside the
breakpoint when that happens.

**Header controls overlap.** Usually a fixed-width logo next to a nav that has
not collapsed yet. Either lower the breakpoint at which the nav collapses, or
let the header wrap.

**A nav target is below 24px.** Increase padding rather than font size; the
target is the padded box.

**Focus is invisible.** The shared navbar signals focus with a background
change on `:focus-visible`. Note that `:focus-visible` only matches in keyboard
modality — calling `element.focus()` from script does **not** trigger it, which
is why the test tabs with real key presses. If you are debugging by hand, use
Tab rather than clicking.

## Known responsive debt

Recorded in `tests/responsive-known-issues.json` when the sweep was added:
51 of 85 lessons have at least one failing check, almost all at 320px and
768px. The largest groups:

- **Course 2** keeps its own static header. Its links run to about 1100px
  wide, so the page scrolls sideways at 320, 768, and 1024px and most links
  are off screen on phones. Moving these pages to the shared navbar
  (`Javascript/header.js`) fixes all four lessons at once.
- **Courses 4 to 8**: the course sidebar (`.left-side_rectangle`) stays beside
  the lesson at 320px and 768px and runs off the right edge. Most of
  these stylesheets have no `@media` rules (in Course 6 only a few pages do); the Course 11 breakpoint above is the fix. In **Course 9** and on
  some Course 3 and 5 pages it is the lesson column itself that is too wide
  at 320px.
- **YouTube embeds** use a fixed `width="560"` and overflow at 320px in
  Courses 1 to 5. Use `width: 100%; height: auto; aspect-ratio: 16 / 9` on the
  iframe.
- **Course 5 flip cards** are a fixed `22em` wide plus border, wider than a
  phone.
- **Course 11** images run past the viewport at 1024px, just above the 980px
  breakpoint where `main11.css` starts constraining the layout.

Courses 10 and 12 currently pass everywhere.

## Relationship to the other suites

| Suite | Scope |
|---|---|
| `smoke.spec.js` | The learning flow end to end |
| `navbar-course-pages.spec.js` | Shared navbar behaviour (menu, focus, Escape) across course pages at 320px |
| `responsive-course-pages.spec.js` | Full layout and focus assertions on six canary pages, per viewport |
| `responsive-course-sweep.spec.js` | Layout geometry on every published lesson, per viewport, against the known-issues list |
| `keyboard-learning-flows.spec.js` | Keyboard-only quiz and activity completion, including validation and visible focus |

Run the keyboard-only learner flows with:

```bash
npm run test:keyboard-learning
```

The keyboard suite exercises the Course 3 Attacks Quiz at 320px and the
Course 12 Emerging Tech Scenario Activity at 1440px. It checks tab order,
named radio controls, arrow/Space selection, Enter submission, announced
validation and completion feedback, focus recovery, and retry behavior.

The probes the two responsive suites share live in
`tests/helpers/layout-probes.js`.
