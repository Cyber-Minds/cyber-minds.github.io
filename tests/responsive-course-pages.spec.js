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
 * This is the canary set. Every other published lesson is swept at the same
 * widths by tests/responsive-course-sweep.spec.js; the probes both suites use
 * live in tests/helpers/layout-probes.js.
 *
 * Reproducing and repairing a failure: docs/RESPONSIVE-TESTING.md
 */
const { test, expect } = require('@playwright/test');
const {
  VIEWPORTS,
  OVERFLOW_TOLERANCE_PX,
  MIN_TARGET_PX,
  openLesson,
  collectOverflow,
  collectHeaderOcclusion,
  collectControlOverlap,
  collectNavReadability,
} = require('./helpers/layout-probes');

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

async function openPage(page, path) {
  await openLesson(page, path, 'shared-navbar');
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
          page.evaluate(collectControlOverlap, '#site-header'),
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
