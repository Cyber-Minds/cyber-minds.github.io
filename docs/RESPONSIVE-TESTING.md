# Responsive Layout Testing

`tests/responsive-course-pages.spec.js` runs a representative course-page
matrix across every supported viewport and fails on layout defects that
navigation tests cannot see — content overflowing sideways, controls sitting on
top of each other, navigation that is unreachable or unreadable, and focus that
is invisible.

```bash
npx playwright test tests/responsive-course-pages.spec.js            # all widths
npx playwright test tests/responsive-course-pages.spec.js --grep "mobile-320"
npx playwright test tests/responsive-course-pages.spec.js --headed   # watch it
```

Runs in about 25 seconds, entirely against the repository test server.

## What it covers

**Page matrix** — one page per layout shape, not full coverage. These are
canaries: all six share the same page shell, so a shell regression shows up
everywhere, while a quiz- or activity-specific regression shows up on one.

| Shape | Page |
|---|---|
| `article` | Course 10 — Networking Basics |
| `quiz` | Course 10 — Networking Quiz 1 |
| `activity` | Course 3 — SQL Injection Activity |
| `explore-activity` | Course 6 — Explore File System |
| `sidebar-navigation` | Course 11 — Introduction |
| `previous-next` | Course 12 — AI Security |

**Viewports** — 320 (small phone), 768 (tablet), 1024 (laptop), 1440 (desktop).

**Assertions, per page per viewport:**

- *No horizontal overflow.* Both the document-level check
  (`scrollWidth <= clientWidth`) and a per-element scan. The per-element scan
  matters: an element can extend past the viewport while the document does not
  scroll, because an ancestor clips it — the content is then simply cut off and
  unreadable, with nothing to indicate it.
- *Navbar clear of content.* The header must not overlap the first content
  block, whether it is static, sticky, or fixed.
- *Header controls do not collide.* Pairwise box intersection across header
  links, buttons, and the logo. Nesting is not a collision.
- *Navigation is reachable and readable.* Rendered links meet the WCAG 2.2 AA
  24px target minimum and are not clipped by their own box. When the menu is
  collapsed, the toggle that reveals it must itself meet that minimum —
  otherwise navigation is unreachable at that width.
- *Active page state and visible focus* (once per viewport, on the shared
  navbar): exactly one `aria-current="page"`, and a keyboard-focused link must
  render differently from an unfocused peer.

## Why geometry instead of screenshots

Pixel baselines would need either an external screenshot service or a committed
image set, and they fail on font-rendering differences between a developer
machine and CI. Every assertion here is a number the browser computed, so a
failure names the element to repair instead of showing a diff image someone has
to interpret. Nothing leaves the machine and no fixture carries learner data.

## Reproducing a failure

The failure message names the viewport, the page shape, and the offending
elements with their coordinates:

```
Error: elements extend past 320px at mobile-320 on the explore-activity page:
  a.next_course spans 168..326
```

To see it yourself:

```bash
npx playwright test tests/responsive-course-pages.spec.js \
  --grep "mobile-320.*explore" --headed
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

Courses 1 through 10 have **no `@media` rules at all**; only Courses 11 and 12
do. The pages in this matrix pass, but pages outside it on those courses are
likely to have the same stacking problem that Course 6's explore pages had.

This matrix is a canary set, not a guarantee. When you touch a lesson page on a
course with no breakpoint, check it at 320px before shipping, and consider
adding the Course 11 breakpoint to that course's stylesheet while you are
there.

## Relationship to the other suites

| Suite | Scope |
|---|---|
| `smoke.spec.js` | The learning flow end to end |
| `navbar-course-pages.spec.js` | Shared navbar correctness across many course pages |
| `responsive-course-pages.spec.js` | Layout geometry per page shape, per viewport |

`navbar-course-pages.spec.js` checks more *pages* at 320px; this checks more
*widths* and more layout properties on a representative few. They overlap on
document-level overflow by design — that check is cheap and catches the most
common regression.
