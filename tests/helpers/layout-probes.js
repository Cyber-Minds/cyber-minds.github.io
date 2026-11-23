// @ts-check
/**
 * Shared page setup and geometry probes for the responsive suites.
 *
 * Every probe runs inside the page (via page.evaluate) and returns plain
 * numbers and selectors, so a failure names the element to repair rather than
 * pointing at a screenshot. Nothing here takes screenshots or sends anything
 * off the machine.
 */

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
 * Serve only the repository. Third-party requests (icon kits, analytics,
 * YouTube and game embeds) are answered with an empty 204 instead of going to
 * the network, so results do not depend on a CDN being reachable or on how
 * long it takes, and nothing about the run leaves the machine. Embeds keep
 * their size: an iframe's box comes from its own attributes and CSS, not from
 * the document loaded into it.
 */
async function isolateToTestServer(page, baseURL) {
  const origin = new URL(baseURL).origin;
  await page.route(
    (url) => url.origin !== origin && /^(https?|wss?):$/.test(url.protocol),
    (route) => route.fulfill({ status: 204, body: '' })
  );
}

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

/** Wait until layout has been recomputed and painted at least once. */
async function settleLayout(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      })
  );
}

/**
 * Load a lesson and wait for the header it is supposed to have.
 *
 * @param {'shared-navbar' | 'legacy-header' | 'missing-header'} header
 */
async function openLesson(page, url, header = 'shared-navbar') {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (header === 'shared-navbar') {
    // header.js injects the navbar after DOMContentLoaded. `attached`, not
    // `visible`: below the desktop breakpoint the links collapse into the
    // hamburger menu, which is correct behaviour, not a missing navbar.
    await page.waitForSelector('#cmh-main-nav a', {
      state: 'attached',
      timeout: 10_000,
    });
  }
  await freezeAnimations(page);
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await settleLayout(page);
}

/**
 * Elements extending past the viewport edge. Returns readable selectors so a
 * failure names the element to fix rather than just a scrollWidth number.
 */
function collectOverflow(tolerance) {
  const { clientWidth } = document.documentElement;

  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls =
      typeof el.className === 'string' && el.className.trim()
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
      // Report the outermost offender only: when a container overflows, all
      // of its children usually do too, and listing them buries the cause.
      const parentOffends = offenders.some((o) => o.el.contains(el));
      if (parentOffends) continue;
      offenders.push({
        el,
        selector: describe(el),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
      });
    }
  }

  return {
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth,
    offenders: offenders.slice(0, 8).map(({ el: _el, ...o }) => o),
  };
}

/**
 * Geometry of the page header against the first block of lesson content.
 *
 * A static header must not intersect the content; a fixed or sticky one must
 * not sit on top of it either. In both cases the content has to start below
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
  const { position } = getComputedStyle(header);

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
function collectControlOverlap(headerSelector) {
  const controls = [
    ...document.querySelectorAll(
      `${headerSelector} a, ${headerSelector} button, .cmh-logo`
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
 * Whether the shared navbar is reachable and readable at the current width.
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

  if (links.length === 0) {
    problems.push(
      'the shared navbar did not render (#cmh-main-nav has no links), so the '
        + 'page has no site navigation; check that it loads Javascript/header.js'
    );
    return { totalLinks: 0, renderedLinks: 0, collapsed: true, problems };
  }

  for (const link of rendered) {
    const rect = link.getBoundingClientRect();
    const label = (link.textContent || '').trim().slice(0, 20);

    if (rect.height < minTarget || rect.width < minTarget) {
      problems.push(
        `"${label}" target ${Math.round(rect.width)}x${Math.round(rect.height)} `
          + `below ${minTarget}px minimum`
      );
      continue;
    }
    // Text clipped by its own box: the label is present but unreadable.
    if (link.scrollWidth > link.clientWidth + 1) {
      problems.push(
        `"${label}" text is clipped `
          + `(scrollWidth ${link.scrollWidth} > clientWidth ${link.clientWidth})`
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

/**
 * The same reachability rules for a page that still carries its own static
 * header instead of the shared navbar: every link in it must be rendered, on
 * screen, at least the minimum target size, and not clipped.
 */
function collectLegacyNavReadability(minTarget) {
  const { clientWidth } = document.documentElement;
  const links = [...document.querySelectorAll('header a')];
  const problems = [];

  if (links.length === 0) {
    problems.push('the static header has no links, so the page has no site navigation');
  }

  for (const link of links) {
    const label = (link.textContent || '').trim().slice(0, 20) || link.getAttribute('href');
    const style = getComputedStyle(link);
    const rect = link.getBoundingClientRect();
    if (style.display === 'none' || style.visibility === 'hidden'
        || rect.width === 0 || rect.height === 0) {
      problems.push(`"${label}" is not rendered, and this header has no menu to reveal it`);
      continue;
    }
    if (rect.right > clientWidth + 1 || rect.left < -1) {
      problems.push(`"${label}" sits off screen (${Math.round(rect.left)}..${Math.round(rect.right)})`);
      continue;
    }
    if (rect.height < minTarget || rect.width < minTarget) {
      problems.push(
        `"${label}" target ${Math.round(rect.width)}x${Math.round(rect.height)} `
          + `below ${minTarget}px minimum`
      );
    }
  }
  return { totalLinks: links.length, problems };
}

/**
 * At narrow widths the lesson column and the course sidebar must stack, not
 * sit on top of one another. Returns the overlap if they intersect.
 */
function collectColumnOverlap() {
  const lesson = document.querySelector('.right-side_rectangle');
  const sidebar =
    document.querySelector('.left-side_rectangle') ||
    document.querySelector('.leftRectangle-section2');
  if (!lesson || !sidebar) return null;
  // Some lessons (Course 10's malformed markup, for one) nest the sidebar
  // inside the lesson column. Their boxes then intersect by construction, and
  // whether the content inside overlaps is the overflow check's job.
  if (lesson.contains(sidebar) || sidebar.contains(lesson)) {
    return { overlap: false, nested: true, lesson: '', sidebar: '' };
  }

  const a = lesson.getBoundingClientRect();
  const b = sidebar.getBoundingClientRect();
  const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return {
    overlap: overlapX > 1 && overlapY > 1,
    lesson: `${Math.round(a.left)}..${Math.round(a.right)} x ${Math.round(a.top)}..${Math.round(a.bottom)}`,
    sidebar: `${Math.round(b.left)}..${Math.round(b.right)} x ${Math.round(b.top)}..${Math.round(b.bottom)}`,
  };
}

/**
 * Interactive controls inside the lesson column (quiz options and buttons,
 * editor run controls, previous/next links) that are too small to tap or are
 * pushed off screen. Inline text links are exempt, as WCAG 2.5.8 allows.
 */
function collectLessonTargets(minTarget) {
  const { clientWidth } = document.documentElement;
  const column = document.querySelector('.right-side_rectangle') || document.body;
  const controls = [
    ...column.querySelectorAll(
      'button, input[type="radio"], input[type="checkbox"], input[type="submit"], '
        + 'select, .right-side_rectangle-buttons a, .terminaloutput a'
    ),
  ];
  const problems = [];

  const isRendered = (el) => {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  for (const control of controls) {
    // A radio or checkbox is usually styled through its label and the input
    // itself visually hidden; the label is then what the learner taps.
    let el = control;
    if (control.type === 'radio' || control.type === 'checkbox') {
      const label =
        control.closest('label') ||
        (control.id && document.querySelector(`label[for="${CSS.escape(control.id)}"]`));
      if (label && isRendered(label)) el = label;
    }
    if (!isRendered(el)) continue;
    const rect = el.getBoundingClientRect();

    const label =
      (el.textContent || el.getAttribute('aria-label') || el.getAttribute('value') || el.tagName)
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 24);
    const name = `${el.tagName.toLowerCase()}[${label}]`;

    if (rect.right > clientWidth + 1 || rect.left < -1) {
      problems.push(`${name} sits off screen (${Math.round(rect.left)}..${Math.round(rect.right)})`);
      continue;
    }
    if (rect.height < minTarget || rect.width < minTarget) {
      problems.push(
        `${name} target ${Math.round(rect.width)}x${Math.round(rect.height)} below ${minTarget}px`
      );
    }
  }
  return problems.slice(0, 8);
}

/** Embedded frames and editors that do not fit inside the lesson column. */
function collectEmbedFit(selectors) {
  const { clientWidth } = document.documentElement;
  const column = document.querySelector('.right-side_rectangle');
  const columnBox = column ? column.getBoundingClientRect() : null;
  const problems = [];
  const found = [];

  for (const el of document.querySelectorAll(selectors)) {
    const rect = el.getBoundingClientRect();
    const name =
      `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string'
        ? `.${el.className.trim().split(/\s+/)[0]}` : ''}`;
    found.push(name);
    if (rect.width === 0 || rect.height === 0) {
      problems.push(`${name} has no size (${Math.round(rect.width)}x${Math.round(rect.height)})`);
      continue;
    }
    if (rect.right > clientWidth + 1 || rect.left < -1) {
      problems.push(`${name} spans ${Math.round(rect.left)}..${Math.round(rect.right)}, past the ${clientWidth}px viewport`);
      continue;
    }
    if (columnBox && (rect.right > columnBox.right + 1 || rect.left < columnBox.left - 1)) {
      problems.push(
        `${name} spans ${Math.round(rect.left)}..${Math.round(rect.right)}, outside the lesson `
          + `column ${Math.round(columnBox.left)}..${Math.round(columnBox.right)}`
      );
    }
  }
  return { found, problems };
}

/**
 * Flip cards must stay inside the viewport and must not overlap one another
 * (an overlapping card hides the hint underneath it).
 */
function collectCardLayout() {
  const { clientWidth } = document.documentElement;
  const cards = [...document.querySelectorAll('.box')]
    .map((el, i) => ({ i: i + 1, rect: el.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width > 0 && rect.height > 0);
  const problems = [];

  for (const { i, rect } of cards) {
    if (rect.right > clientWidth + 1 || rect.left < -1) {
      problems.push(`card ${i} spans ${Math.round(rect.left)}..${Math.round(rect.right)}, past the ${clientWidth}px viewport`);
    }
  }
  for (let a = 0; a < cards.length; a += 1) {
    for (let b = a + 1; b < cards.length; b += 1) {
      const ra = cards[a].rect;
      const rb = cards[b].rect;
      const overlapX = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const overlapY = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (overlapX > 1 && overlapY > 1) {
        problems.push(`card ${cards[a].i} overlaps card ${cards[b].i}`);
      }
    }
  }
  return { count: cards.length, problems: problems.slice(0, 8) };
}

module.exports = {
  VIEWPORTS,
  OVERFLOW_TOLERANCE_PX,
  MIN_TARGET_PX,
  isolateToTestServer,
  freezeAnimations,
  settleLayout,
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
};
