// @ts-check
/**
 * Responsive layout regression matrix for course lessons.
 *
 * The smoke suite proves the learning flow works and
 * tests/navbar-course-pages.spec.js proves the shared navbar renders, but a
 * page can pass both while its content overflows sideways or its controls sit
 * on top of each other at a supported width. Those defects only show up when
 * you actually resize, and nothing resized except one Course 10 page.
 *
 * This runs a representative page-type matrix (article, quiz, activity,
 * sidebar navigation, previous/next) across every supported viewport and
 * asserts geometry rather than appearance. Deliberately no screenshots: a
 * pixel baseline would need an external service or a committed image set, and
 * would fail on font rendering differences between a developer machine and CI.
 * Every assertion here is a number a browser computed, so a failure names the
 * element to repair.
 *
 * Nothing leaves the machine: pages come from the repository test server, and
 * no fixture carries credentials or learner data.
 *
 * Reproducing and repairing a failure: docs/RESPONSIVE-TESTING.md
 */
const { test, expect } = require('@playwright/test');

const COURSE_ROOT = '/HTML/Courses and Activities';

/**
 * One page per layout shape. Kept small on purpose -- this is a canary set,
 * not full coverage. Every entry shares the same page shell, so a regression
 * in the shell surfaces on all of them, while a regression specific to quiz
 * controls or activity widgets surfaces on just one.
 */
const PAGE_MATRIX = [
  {
    kind: 'article',
    path: `${COURSE_ROOT}/Course 10/NetworkingBasicscourse10.html`,
  },
  {
    kind: 'quiz',
    path: `${COURSE_ROOT}/Course 10/NetworkingQuiz1course10.html`,
  },
  {
    kind: 'activity',
    path: `${COURSE_ROOT}/Course 3/SQLInjectionActivitycourse3.html`,
  },
  {
    kind: 'explore-activity',
    path: `${COURSE_ROOT}/Course 6/ExploreFileSystemcourse6.html`,
  },
  {
    kind: 'sidebar-navigation',
    path: `${COURSE_ROOT}/Course 11/Introductioncourse11.html`,
  },
  {
    kind: 'previous-next',
    path: `${COURSE_ROOT}/Course 12/AISecuritycourse12.html`,
  },
];

const VIEWPORTS = [
  { name: 'mobile-320', width: 320, height: 812 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'laptop-1024', width: 1024, height: 768 },
  { name: 'desktop-1440', width: 1440, height: 900 },
];

// Sub-pixel layout rounding is normal and not a defect; a real overflow is
// never within a pixel of the viewport edge.
const OVERFLOW_TOLERANCE_PX = 1;

// WCAG 2.2 AA minimum target size (2.5.8).
const MIN_TARGET_PX = 24;

/**
 * Transitions make computed styles depend on when the assertion runs. Freeze
 * them so every reading is the settled value.
 */
async function freezeAnimations(page) {
  await page.addStyleTag({
    content: `*, *::before, *::after {
      transition-duration: 0s !important;
      animation-duration: 0s !important;
      animation-delay: 0s !important;
    }`,
  });
}

async function openPage(page, path) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  // The shared navbar is injected by header.js; wait for it so geometry is
  // measured against the real header rather than an empty placeholder.
  // `attached`, not `visible`: below the desktop breakpoint these links are
  // collapsed into the hamburger menu, which is correct behaviour, not a
  // missing navbar.
  await page.waitForSelector('#cmh-main-nav a', {
    state: 'attached',
    timeout: 10_000,
  });
  await freezeAnimations(page);
  await page.evaluate(() => document.fonts && document.fonts.ready);
}

/**
 * Elements extending past the viewport edge. Returns readable selectors so a
 * failure names the element to fix rather than just a scrollWidth number.
 */
function collectOverflow(tolerance) {
  const clientWidth = document.documentElement.clientWidth;

  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className.trim()
      ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
      : '';
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };

  const offenders = [];
  for (const el of document.querySelectorAll('body *')) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    // Out-of-flow overlays (menu panels, backdrops, popups) are positioned
    // off-screen by design when closed.
    if (style.position === 'fixed') continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    if (el.closest('#cmh-menu-backdrop')) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    if (rect.right > clientWidth + tolerance || rect.left < -tolerance) {
      offenders.push({
        selector: describe(el),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        clientWidth,
      });
    }
  }

  return {
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth,
    offenders: offenders.slice(0, 8),
  };
}

/**
 * Geometry of the shared header against the first block of page content.
 *
 * A static header must not intersect the content; a fixed or sticky one must
 * not sit on top of it either -- in both cases the content has to start below
 * the header, or the first lines are unreadable.
 */
function collectHeaderOcclusion() {
  const header = document.querySelector('#site-header, header');
  const content =
    document.querySelector('.right-side_rectangle') ||
    document.querySelector('.left-side_rectangle') ||
    document.querySelector('main') ||
    document.querySelector('section');

  if (!header || !content) return null;

  const headerBox = header.getBoundingClientRect();
  const contentBox = content.getBoundingClientRect();
  const position = getComputedStyle(header).position;

  const horizontallyOverlapping =
    headerBox.left < contentBox.right && contentBox.left < headerBox.right;
  const verticallyOverlapping =
    headerBox.top < contentBox.bottom && contentBox.top < headerBox.bottom;

  return {
    position,
    overlap: horizontallyOverlapping && verticallyOverlapping,
    headerBottom: Math.round(headerBox.bottom),
    contentTop: Math.round(contentBox.top),
  };
}

/** Pairs of header controls whose boxes intersect. */
function collectControlOverlap() {
  const controls = [
    ...document.querySelectorAll(
      '#site-header a, #site-header button, .cmh-logo'
    ),
  ].filter((el) => {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });

  const describe = (el) =>
    `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}` +
    `${el.textContent ? `[${el.textContent.trim().slice(0, 18)}]` : ''}`;

  const collisions = [];
  for (let i = 0; i < controls.length; i += 1) {
    for (let j = i + 1; j < controls.length; j += 1) {
      const a = controls[i];
      const b = controls[j];
      // Nesting is not a collision (a link inside its list item, say).
      if (a.contains(b) || b.contains(a)) continue;

      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const overlapX = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const overlapY = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      // Require a real intersection, not a shared border.
      if (overlapX > 1 && overlapY > 1) {
        collisions.push(`${describe(a)} <-> ${describe(b)}`);
      }
    }
  }
  return collisions.slice(0, 6);
}

/**
 * Whether navigation is reachable and readable at the current width.
 *
 * Below the desktop breakpoint the links collapse into the hamburger menu.
 * A collapsed link reports a 0x0 box while its computed `display` is still
 * not `none` (the container clips it), so size alone cannot distinguish
 * "collapsed by design" from "broken". Rendered links must meet the target
 * size; if none are rendered, the control that reveals them must itself be
 * usable, or navigation is unreachable at this width.
 */
function collectNavReadability(minTarget) {
  const isRendered = (el) => {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const links = [...document.querySelectorAll('#cmh-main-nav a')];
  const rendered = links.filter(isRendered);
  const problems = [];

  for (const link of rendered) {
    const rect = link.getBoundingClientRect();
    const label = (link.textContent || '').trim().slice(0, 20);

    if (rect.height < minTarget || rect.width < minTarget) {
      problems.push(
        `"${label}" target ${Math.round(rect.width)}x${Math.round(rect.height)} ` +
          `below ${minTarget}px minimum`
      );
      continue;
    }
    // Text clipped by its own box: the label is present but unreadable.
    if (link.scrollWidth > link.clientWidth + 1) {
      problems.push(
        `"${label}" text is clipped ` +
          `(scrollWidth ${link.scrollWidth} > clientWidth ${link.clientWidth})`
      );
    }
  }

  if (rendered.length === 0) {
    const toggle = document.querySelector('#cmh-menu-toggle');
    if (!toggle || !isRendered(toggle)) {
      problems.push(
        'no navigation links are rendered and the menu toggle is not visible, '
          + 'so navigation is unreachable at this width'
      );
    } else {
      const rect = toggle.getBoundingClientRect();
      if (rect.width < minTarget || rect.height < minTarget) {
        problems.push(
          `menu toggle target ${Math.round(rect.width)}x${Math.round(rect.height)} `
            + `below ${minTarget}px minimum, and it is the only way to reach navigation`
        );
      }
    }
  }

  return {
    totalLinks: links.length,
    renderedLinks: rendered.length,
    collapsed: rendered.length === 0,
    problems,
  };
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} (${viewport.width}px)`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const entry of PAGE_MATRIX) {
      // One page load per viewport, all geometry read from it. Splitting
      // these into separate tests tripled the page loads and pushed the
      // suite past eight minutes, which is too slow to keep in CI.
      test(`${entry.kind} page lays out cleanly`, async ({ page }) => {
        await openPage(page, entry.path);

        const [overflow, occlusion, collisions, nav] = await Promise.all([
          page.evaluate(collectOverflow, OVERFLOW_TOLERANCE_PX),
          page.evaluate(collectHeaderOcclusion),
          page.evaluate(collectControlOverlap),
          page.evaluate(collectNavReadability, MIN_TARGET_PX),
        ]);

        expect(
          overflow.offenders,
          `elements extend past ${overflow.clientWidth}px at ${viewport.name} on ` +
            `the ${entry.kind} page:\n` +
            overflow.offenders
              .map((o) => `  ${o.selector} spans ${o.left}..${o.right}`)
              .join('\n')
        ).toEqual([]);

        expect(
          overflow.scrollWidth,
          `document scrolls horizontally at ${viewport.name} ` +
            `(scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth})`
        ).toBeLessThanOrEqual(overflow.clientWidth + OVERFLOW_TOLERANCE_PX);

        expect(occlusion, `no header/content pair found on the ${entry.kind} page`)
          .not.toBeNull();
        expect(
          occlusion.overlap,
          `the ${occlusion.position} navbar overlaps page content at ` +
            `${viewport.name} (header bottom ${occlusion.headerBottom}px, ` +
            `content top ${occlusion.contentTop}px)`
        ).toBe(false);

        expect(
          collisions,
          `header controls overlap at ${viewport.name}:\n  ${collisions.join('\n  ')}`
        ).toEqual([]);

        expect(
          nav.problems,
          `navigation is not readable at ${viewport.name} on the ${entry.kind} ` +
            `page:\n  ${nav.problems.join('\n  ')}`
        ).toEqual([]);
      });
    }

    test('active page state and keyboard focus survive this width', async ({
      page,
    }) => {
      // One page is enough: the navbar is shared, and this asserts the
      // behaviour of the navbar rather than of any single lesson.
      await openPage(page, PAGE_MATRIX[0].path);

      // Active-page state must remain exactly one link, at every width.
      await expect(
        page.locator('#cmh-main-nav a[aria-current="page"]')
      ).toHaveCount(1);

      const toggle = page.locator('#cmh-menu-toggle');
      const toggleVisible = await toggle.isVisible();
      if (toggleVisible) {
        // Open the menu from the keyboard rather than with a click. The
        // navbar signals focus with :focus-visible, which the browser only
        // matches while the user is in keyboard modality -- a mouse click
        // would switch modality and suppress the very style being tested.
        await toggle.focus();
        await page.keyboard.press('Enter');
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      }

      // Tab until focus lands on a rendered, non-current nav link. Real key
      // presses are what make :focus-visible apply; element.focus() from
      // script does not, so testing that way reports a false failure.
      const landed = await (async () => {
        for (let i = 0; i < 15; i += 1) {
          await page.keyboard.press('Tab');
          const ok = await page.evaluate(() => {
            const el = document.activeElement;
            if (!el || !el.closest('#cmh-main-nav')) return false;
            if (el.tagName !== 'A') return false;
            if (el.getAttribute('aria-current') === 'page') return false;
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          });
          if (ok) return true;
        }
        return false;
      })();

      expect(
        landed,
        `keyboard tabbing never reached a navigation link at ${viewport.name}`
      ).toBe(true);

      // Compare the focused link against an unfocused peer. Comparing two
      // links sidesteps modality flapping, and the current-page link is
      // excluded because it already carries the focus background as its
      // active state.
      const styles = await page.evaluate(() => {
        const snapshot = (el) => {
          const s = getComputedStyle(el);
          return [s.backgroundColor, s.outlineStyle, s.outlineWidth, s.boxShadow].join('|');
        };
        const focused = document.activeElement;
        const peer = [...document.querySelectorAll('#cmh-main-nav a')].find(
          (a) => {
            if (a === focused) return false;
            if (a.getAttribute('aria-current') === 'page') return false;
            const rect = a.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }
        );
        return {
          focused: snapshot(focused),
          peer: peer ? snapshot(peer) : null,
          label: (focused.textContent || '').trim(),
        };
      });

      expect(styles.peer, 'no unfocused peer link to compare against').not.toBeNull();
      expect(
        styles.focused,
        `the focused link "${styles.label}" renders identically to an unfocused ` +
          `link at ${viewport.name} (background, outline, and box-shadow all ` +
          'match), so keyboard users cannot see where they are'
      ).not.toBe(styles.peer);

      if (toggleVisible) {
        await page.keyboard.press('Escape');
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      }
    });
  });
}
