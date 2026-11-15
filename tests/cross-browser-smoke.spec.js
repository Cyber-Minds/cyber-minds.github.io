// @ts-check
/**
 * Cross-browser learner smoke path.
 *
 * A deliberately small path — course page, quiz, terminal — that runs in
 * Chromium, Firefox, and WebKit (see the projects in playwright.config.js).
 * The full suite stays Chromium-only; this file is the cross-browser signal.
 *
 * Every step is named "<route> › <action>", so a failure report reads as
 * "[browser] › test › step" and names the browser, route, and failing step.
 *
 * Network: only the local test server is reachable. The terminal's CDN
 * assets are answered by local stubs, and every other non-loopback request
 * (fonts, icon kits, analytics) is aborted, so no page content leaves the
 * machine.
 *
 * Browser-specific skips: add them to KNOWN_LIMITATIONS below with a reason
 * and a link to the limitation documented in docs/CROSS-BROWSER-SMOKE.md.
 * Never skip silently inside a test body.
 */

const { test, expect } = require('@playwright/test');
const {
  stubTerminalCdn,
  isStubbedCdnUrl,
  terminalMockUrl,
} = require('./helpers/terminal-stubs');

const CATALOG = '/HTML/course_Contents.html';
const COURSE_INTRO = '/HTML/Courses and Activities/Course 3/Introductioncourse3.html';
const QUIZ = '/HTML/Courses and Activities/Course 3/AttacksQuizcourse3.html';
const QUIZ_ID = 'course-3-attacksquizcourse3';
const TERMINAL = terminalMockUrl('web-recon');

/**
 * Documented browser-specific skips, keyed by test title.
 * Shape: { [title]: [{ browser: 'firefox' | 'webkit' | 'chromium', reason, doc }] }
 * @type {Record<string, Array<{ browser: string, reason: string, doc: string }>>}
 */
const KNOWN_LIMITATIONS = {};

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

function isLocal(url) {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol === 'data:' || protocol === 'blob:' || protocol === 'about:') return true;
    return LOOPBACK_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

/** Run `body` as a step labelled with the route it exercises. */
function step(route, action, body) {
  return test.step(`${route} › ${action}`, body);
}

async function readProgress(page) {
  return page.evaluate(() =>
    JSON.parse(window.localStorage.getItem('cm_learning_progress_v1') || 'null')
  );
}

test.describe('Cross-browser learner smoke @cross-browser', () => {
  // Each test crosses several full page loads; Firefox and WebKit start
  // slower than Chromium, so allow more than the suite-wide 30 s.
  test.describe.configure({ timeout: 60_000 });

  /** @type {string[]} */
  let pageErrors;
  /** @type {string[]} */
  let blockedRequests;

  test.beforeEach(async ({ page, browserName }, testInfo) => {
    const limitation = (KNOWN_LIMITATIONS[testInfo.title] || []).find(
      (entry) => entry.browser === browserName
    );
    test.skip(Boolean(limitation), limitation ? `${limitation.reason} (${limitation.doc})` : '');

    pageErrors = [];
    blockedRequests = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await stubTerminalCdn(page);
    // Registered last, so it runs first: anything not served locally or by a
    // stub is aborted before it can leave the machine.
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (isLocal(url) || isStubbedCdnUrl(url)) {
        await route.fallback();
        return;
      }
      blockedRequests.push(url);
      await route.abort('blockedbyclient');
    });
  });

  test.afterEach(async ({}, testInfo) => {
    if (blockedRequests.length) {
      await testInfo.attach('blocked-external-requests', {
        body: blockedRequests.join('\n'),
        contentType: 'text/plain',
      });
    }
  });

  test('course page: catalog opens Course 3 and its table of contents', async ({ page }) => {
    await step(CATALOG, 'open course catalog', async () => {
      await page.goto(CATALOG);
      await expect(page.locator('a.course-card').first()).toBeVisible();
    });

    await step(CATALOG, 'open Course 3 card', async () => {
      await page
        .locator('a.course-card', { hasText: 'Intro to Attacks in Security' })
        .click();
      await expect(page).toHaveURL(/Course%203\/Introductioncourse3\.html$/);
    });

    await step(COURSE_INTRO, 'render lesson content and shared chrome', async () => {
      await expect(page.locator('.page-title')).toHaveText('Course 3 - Introduction');
      await expect(page.locator('#site-header')).not.toBeEmpty();
      await expect(
        page.getByRole('link', { name: 'Back to all Courses' })
      ).toBeVisible();
    });

    await step(COURSE_INTRO, 'follow table of contents to the quiz', async () => {
      await page.getByRole('link', { name: 'Attacks Quiz' }).click();
      await expect(page).toHaveURL(/AttacksQuizcourse3\.html$/);
      await expect(page.locator('body')).toHaveAttribute('data-quiz-id', QUIZ_ID);
    });

    await step(CATALOG, 'show the visited lesson in progress dashboard', async () => {
      await page.goto(CATALOG);
      await expect(page.locator('#continueLearningLastVisited')).toContainText('Course 3');
    });

    expect(pageErrors, 'uncaught page errors').toEqual([]);
  });

  test('quiz: Course 3 quiz scores, explains, retries, and persists', async ({ page }) => {
    await step(QUIZ, 'open quiz', async () => {
      await page.goto(QUIZ);
      await expect(page.getByRole('button', { name: 'Submit Quiz' })).toBeVisible();
    });

    await step(QUIZ, 'answer with keyboard and labels, then submit', async () => {
      await page.locator('input[name="q1"]').first().focus();
      await page.keyboard.press('ArrowDown');
      await expect(page.locator('#q1-ES')).toBeChecked();
      await page.locator('label[for="q2-verify"]').click();
      await page.locator('label[for="q3-false"]').click();
      await page.locator('label[for="q4-tail"]').click();
      await page.getByRole('button', { name: 'Submit Quiz' }).click();
    });

    await step(QUIZ, 'show score and explanations', async () => {
      await expect(page.locator('#result')).toHaveText('Your score is: 2/4');
      await expect(page.locator('#q1-VS-detail')).toBeVisible();
      await expect(page.locator('#q3-a1')).toHaveClass(/is-correct/);
      await expect(page.locator('#q3-a2')).toHaveClass(/is-incorrect/);
    });

    await step(QUIZ, 'retry and reach full score', async () => {
      await page.getByRole('button', { name: /retry quiz/i }).click();
      await expect(page.locator('#result')).toHaveText('');
      await expect(page.locator('#q1-ES')).not.toBeChecked();
      for (const id of ['q1-VS', 'q2-verify', 'q3-true', 'q4-tail']) {
        await page.locator(`label[for="${id}"]`).click();
      }
      await page.getByRole('button', { name: /submit quiz/i }).click();
      await expect(page.locator('#result')).toHaveText('Your score is: 4/4');
    });

    await step(QUIZ, 'persist completion in localStorage', async () => {
      const saved = await readProgress(page);
      expect(saved?.completedQuizzes?.[QUIZ_ID]).toMatchObject({
        score: 4,
        totalQuestions: 4,
      });
    });

    expect(pageErrors, 'uncaught page errors').toEqual([]);
  });

  test('terminal: Web Recon runs locally and records progress', async ({ page }) => {
    await step(TERMINAL, 'load terminal without a backend', async () => {
      await page.goto(TERMINAL);
      await expect(page.locator('#statusText')).toHaveText('Ready');
      await expect(page.locator('#loading')).toHaveClass(/hidden/);
      await expect(page.locator('#challengeTitle')).not.toBeEmpty();
    });

    await step(TERMINAL, 'run recon commands in the browser shell', async () => {
      await page.evaluate(() => {
        // Same input path the terminal's keystroke handler feeds.
        window.handleMockTerminalInput('ss -tulpen\r');
        window.handleMockTerminalInput('curl -I http://localhost:9090\r');
        window.handleMockTerminalInput(
          'echo "port 9090 server nginx PHP/7.4.3 InternalPortal content-type" > recon-notes.txt\r'
        );
      });
      await expect(page.locator('#terminal')).toContainText('0.0.0.0:9090');
      await expect(page.locator('#terminal')).toContainText('x-powered-by: PHP/7.4.3');
    });

    await step(TERMINAL, 'check solution', async () => {
      await page.locator('#checkSolutionBtn').click();
      await expect(page.locator('#progressChip')).toContainText('1/');
      await expect(page.locator('#toast')).toContainText(/completed/i);
    });

    await step(CATALOG, 'show completed challenge in progress dashboard', async () => {
      await page.goto(CATALOG);
      await expect(page.locator('#continueLearningCtfCount')).toContainText('1');
    });

    expect(pageErrors, 'uncaught page errors').toEqual([]);
  });
});
