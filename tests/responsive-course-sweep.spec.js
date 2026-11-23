// @ts-check
/**
 * Responsive sweep across every published course lesson.
 *
 * tests/responsive-course-pages.spec.js runs the full assertion set, focus
 * behaviour included, on a few canary pages. This spec covers the rest: every
 * lesson a learner can reach from the course catalog, at every supported
 * width, checked for the geometry defects that make a page unusable on a
 * phone (content cut off or scrolling sideways, the header covering the
 * lesson, the sidebar on top of the lesson, navigation that cannot be
 * reached, controls too small to tap), plus focused checks for the layout
 * shapes that put unusual elements in the lesson column (embedded games and
 * videos, code editors, flip cards, quizzes, pages with their own header).
 *
 * The page list is not maintained by hand. tests/helpers/course-inventory.js
 * reads the published courses from scripts/content-manifest.json, follows the
 * catalog's links to find their lessons, and classifies each lesson's layout
 * shape from its source. A new lesson joins the sweep automatically, and the
 * inventory checks at the bottom fail if a published course drops out or a
 * page has a shape the suite does not know.
 *
 * Existing layout debt is recorded, per page, width, and check, in
 * tests/responsive-known-issues.json. A check listed there is expected to
 * fail; any other failure fails the test, and so does a listed check that now
 * passes (so the list only ever shrinks). See docs/RESPONSIVE-TESTING.md.
 *
 * Each test loads its page fresh at its width, third-party requests are
 * stubbed, and nothing is screenshotted, so the result depends only on the
 * repository and nothing leaves the machine.
 */
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const {
  HEADER_KINDS,
  CONTENT_KINDS,
  loadCourseInventory,
  shapeRepresentatives,
} = require('./helpers/course-inventory');
const {
  VIEWPORTS,
  OVERFLOW_TOLERANCE_PX,
  MIN_TARGET_PX,
  isolateToTestServer,
  openLesson,
  collectOverflow,
  collectHeaderOcclusion,
  collectControlOverlap,
  collectNavReadability,
  collectLegacyNavReadability,
  collectColumnOverlap,
  collectLessonTargets,
  collectEmbedFit,
  collectCardLayout,
} = require('./helpers/layout-probes');

const KNOWN_ISSUES_PATH = path.join(__dirname, 'responsive-known-issues.json');
const RECORD_DIR = path.join(__dirname, '..', 'test-results', 'responsive-observed');
const RECORDING = process.env.RESPONSIVE_RECORD === '1';

const inventory = loadCourseInventory();
const knownIssues = fs.existsSync(KNOWN_ISSUES_PATH)
  ? JSON.parse(fs.readFileSync(KNOWN_ISSUES_PATH, 'utf8')).pages || {}
  : {};

// Below this width the course sidebar is expected to stack under or over the
// lesson instead of sitting beside it.
const STACKED_BELOW_PX = 768;

/** Focused checks that apply only to some content shapes. */
const EMBED_SELECTORS = {
  'video-lesson': 'iframe',
  'embedded-game': 'iframe',
  'code-editor': '.cm-editor, .terminaloutput',
};

/** Page key used in the known-issues file: "Course N/file.html". */
function pageKey(lesson) {
  return `Course ${lesson.course}/${lesson.file}`;
}

/**
 * Run every check that applies to this page and width.
 * Returns { checkId: failureMessage } for the checks that failed.
 */
async function runChecks(page, lesson, viewport) {
  const failed = {};
  const fail = (id, message) => {
    failed[id] = message;
  };

  const headerSelector = lesson.header === 'legacy-header' ? 'header' : '#site-header';
  const embedSelector = EMBED_SELECTORS[lesson.content];

  const [overflow, occlusion, collisions, columns, targets, nav, embeds, cards] =
    await Promise.all([
      page.evaluate(collectOverflow, OVERFLOW_TOLERANCE_PX),
      page.evaluate(collectHeaderOcclusion),
      page.evaluate(collectControlOverlap, headerSelector),
      page.evaluate(collectColumnOverlap),
      page.evaluate(collectLessonTargets, MIN_TARGET_PX),
      lesson.header === 'legacy-header'
        ? page.evaluate(collectLegacyNavReadability, MIN_TARGET_PX)
        : page.evaluate(collectNavReadability, MIN_TARGET_PX),
      embedSelector ? page.evaluate(collectEmbedFit, embedSelector) : null,
      lesson.content === 'flip-cards' ? page.evaluate(collectCardLayout) : null,
    ]);

  // One entry per offending element, so a page with known overflow still
  // fails when a different element starts overflowing.
  for (const o of overflow.offenders) {
    fail(
      `overflow:${o.selector}`,
      `${o.selector} spans ${o.left}..${o.right}, past the ${overflow.clientWidth}px viewport`
    );
  }
  if (overflow.scrollWidth > overflow.clientWidth + OVERFLOW_TOLERANCE_PX) {
    fail(
      'horizontal-scroll',
      `the document scrolls sideways (scrollWidth ${overflow.scrollWidth} > ` +
        `clientWidth ${overflow.clientWidth})`
    );
  }
  if (occlusion && occlusion.overlap) {
    fail(
      'header-covers-lesson',
      `the ${occlusion.position} header covers the lesson (header bottom ` +
        `${occlusion.headerBottom}px, lesson top ${occlusion.contentTop}px)`
    );
  }
  if (collisions.length) {
    fail('header-controls-overlap', `header controls overlap:\n    ${collisions.join('\n    ')}`);
  }
  if (columns && columns.overlap && viewport.width < STACKED_BELOW_PX) {
    fail(
      'sidebar-covers-lesson',
      `the course sidebar (${columns.sidebar}) sits on top of the lesson ` +
        `column (${columns.lesson}) instead of stacking`
    );
  }
  if (targets.length) {
    fail(
      'lesson-controls',
      `lesson controls are off screen or too small to tap:\n    ${targets.join('\n    ')}`
    );
  }
  if (nav.problems.length) {
    fail('navigation', `navigation is not reachable or readable:\n    ${nav.problems.join('\n    ')}`);
  }
  if (embeds) {
    if (embeds.found.length === 0) {
      fail('embed-fit', `no ${embedSelector} found on a ${lesson.content} page`);
    } else if (embeds.problems.length) {
      fail('embed-fit', `embedded content does not fit:\n    ${embeds.problems.join('\n    ')}`);
    }
  }
  if (cards) {
    if (cards.count === 0) {
      fail('flip-cards', 'no flip cards rendered on a flip-cards page');
    } else if (cards.problems.length) {
      fail('flip-cards', `flip cards do not lay out:\n    ${cards.problems.join('\n    ')}`);
    }
  }
  return failed;
}

function record(lesson, viewport, failed) {
  fs.mkdirSync(RECORD_DIR, { recursive: true });
  const name = `${pageKey(lesson)}@${viewport.name}`.replace(/[^\w.@-]+/g, '_');
  fs.writeFileSync(
    path.join(RECORD_DIR, `${name}.json`),
    JSON.stringify({ page: pageKey(lesson), viewport: viewport.name, failed: Object.keys(failed) })
  );
}

test.beforeEach(async ({ page, baseURL }) => {
  await isolateToTestServer(page, baseURL || 'http://127.0.0.1:3939');
});

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} (${viewport.width}px)`, () => {
    // Tests are independent page loads, so they can share the run across
    // workers; see the `responsive-sweep` project in playwright.config.js.
    test.describe.configure({ mode: 'parallel' });
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const lesson of inventory.pages) {
      test(`Course ${lesson.course} › ${lesson.file} [${lesson.shape}]`, async ({ page }) => {
        await openLesson(page, lesson.url, lesson.header);
        const failed = await runChecks(page, lesson, viewport);

        if (RECORDING) {
          record(lesson, viewport, failed);
          return;
        }

        const where = `${pageKey(lesson)} [${lesson.shape}] at ${viewport.name}`;
        const expected = new Set((knownIssues[pageKey(lesson)] || {})[viewport.name] || []);

        const unexpected = Object.entries(failed).filter(([id]) => !expected.has(id));
        const fixed = [...expected].filter((id) => !(id in failed));

        expect.soft(
          unexpected.map(([id]) => id),
          `${where}: new layout failure${unexpected.length === 1 ? '' : 's'}:\n` +
            unexpected.map(([id, msg]) => `  [${id}] ${msg}`).join('\n')
        ).toEqual([]);

        expect.soft(
          fixed,
          `${where}: listed in tests/responsive-known-issues.json but now passes. ` +
            `Remove ${fixed.map((id) => `"${id}"`).join(', ')} from that entry.`
        ).toEqual([]);
      });
    }
  });
}

test.describe('course inventory', () => {
  test('every published course is in the sweep', () => {
    const covered = new Set(inventory.pages.map((p) => p.course));
    const missing = inventory.publishedCourses.filter((c) => !covered.has(c));
    expect(inventory.publishedCourses.length).toBeGreaterThan(0);
    expect(
      missing,
      `published courses with no lesson reachable from the catalog: ${missing.join(', ')}`
    ).toEqual([]);
  });

  test('every lesson has a known layout shape', () => {
    const unknown = inventory.pages.filter(
      (p) => !HEADER_KINDS.includes(p.header) || !CONTENT_KINDS.includes(p.content)
    );
    expect(unknown.map((p) => `${p.url} -> ${p.shape}`)).toEqual([]);
  });

  test('every lesson file in a published course is linked from the catalog', () => {
    // A lesson that exists but cannot be reached is either unfinished work or
    // a broken link hiding it from learners. Either way it escapes the sweep.
    const published = new Set(inventory.publishedCourses);
    const orphans = inventory.unpublishedFiles.filter((f) =>
      published.has(Number(/\/Course (\d+)\//.exec(f)?.[1]))
    );
    expect(
      orphans,
      'lesson files no catalog link reaches; link them or move them out of the course folder'
    ).toEqual([]);
  });

  test('every shape has a representative page', () => {
    const shapes = new Set(inventory.pages.map((p) => p.shape));
    const represented = new Set(shapeRepresentatives(inventory.pages).map((p) => p.shape));
    expect([...represented].sort()).toEqual([...shapes].sort());
  });

  test('known-issues entries all point at pages and widths in the sweep', () => {
    test.skip(RECORDING, 'the recording run rewrites the file');
    const pages = new Set(inventory.pages.map(pageKey));
    const widths = new Set(VIEWPORTS.map((v) => v.name));
    const stale = [];
    for (const [key, byWidth] of Object.entries(knownIssues)) {
      if (!pages.has(key)) stale.push(`${key} (no such published page)`);
      for (const width of Object.keys(byWidth)) {
        if (!widths.has(width)) stale.push(`${key} @ ${width} (no such width)`);
      }
    }
    expect(stale, 'remove these entries from tests/responsive-known-issues.json').toEqual([]);
  });
});
