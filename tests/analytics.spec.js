// @ts-check
/**
 * Analytics payload validation and event emission tests.
 *
 * Strategy:
 *   - Block the Umami CDN route and return empty JS (200) so s.onload fires
 *     with our capture stub still intact as window.umami.
 *   - Use addInitScript to pre-define window.umami before any page script runs,
 *     capturing every trackEvent call into window.__capturedAnalyticsEvents.
 *   - Unit-level tests call trackEvent directly via page.evaluate.
 *   - Emission tests navigate to real pages and wait for events to appear.
 */
const { test, expect } = require('@playwright/test');

const UMAMI_CAPTURE_STUB = `
window.__capturedAnalyticsEvents = [];
window.umami = {
  track: function(name, payload) {
    window.__capturedAnalyticsEvents.push({ name: name, payload: payload || {} });
  }
};
`;

test.beforeEach(async ({ page }) => {
  // Return empty JS with 200 so the analytics.js s.onload fires (triggering
  // trackPageView + flushQueuedEvents) while leaving our umami stub in place.
  await page.route('https://cloud.umami.is/**', async (route) => {
    await route.fulfill({ body: '', contentType: 'text/javascript' });
  });
  await page.addInitScript(UMAMI_CAPTURE_STUB);
});

// ─── Payload validation (unit-level) ────────────────────────────────────────

test.describe('Analytics payload validation', () => {
  test('trackEvent strips blocked PII keys before sending', async ({ page }) => {
    await page.goto('/');
    const captured = await page.evaluate(() => {
      const events = [];
      window.umami.track = function (name, payload) {
        events.push({ name, payload });
      };
      window.trackEvent('quiz_complete', {
        quiz: 'quiz-1',
        email: 'user@example.com',
        password: 'secret123',
        token: 'abc123',
        score: 5,
        total_questions: 10,
      });
      return events;
    });
    expect(captured).toHaveLength(1);
    expect(captured[0].payload).not.toHaveProperty('email');
    expect(captured[0].payload).not.toHaveProperty('password');
    expect(captured[0].payload).not.toHaveProperty('token');
    expect(captured[0].payload).toHaveProperty('quiz', 'quiz-1');
    expect(captured[0].payload).toHaveProperty('score', 5);
    expect(captured[0].payload).toHaveProperty('total_questions', 10);
  });

  test('trackEvent drops object and array payload values', async ({ page }) => {
    await page.goto('/');
    const captured = await page.evaluate(() => {
      const events = [];
      window.umami.track = function (name, payload) {
        events.push({ name, payload });
      };
      window.trackEvent('quiz_complete', {
        quiz: 'quiz-1',
        nested_obj: { secret: 'data' },
        array_val: ['a', 'b'],
        score: 42,
        total_questions: 50,
      });
      return events;
    });
    expect(captured[0].payload).toHaveProperty('quiz', 'quiz-1');
    expect(captured[0].payload).toHaveProperty('score', 42);
    expect(captured[0].payload).toHaveProperty('total_questions', 50);
    expect(captured[0].payload).not.toHaveProperty('nested_obj');
    expect(captured[0].payload).not.toHaveProperty('array_val');
  });

  test('trackEvent drops unknown primitive keys outside the event allowlist', async ({
    page,
  }) => {
    await page.goto('/');
    const captured = await page.evaluate(() => {
      const events = [];
      window.umami.track = function (name, payload) {
        events.push({ name, payload });
      };
      window.trackEvent('quiz_complete', {
        quiz: 'quiz-1',
        score: 4,
        total_questions: 4,
        answer: 'red',
        text: 'free form',
      });
      return events;
    });
    expect(captured[0].payload).toEqual({
      quiz: 'quiz-1',
      score: 4,
      total_questions: 4,
    });
  });

  test('BLOCKED_KEYS covers all required sensitive field names', async ({ page }) => {
    await page.goto('/');
    const blocked = await page.evaluate(() => window.BLOCKED_KEYS);
    const required = ['email', 'password', 'token', 'session_id', 'user_id', 'secret', 'auth'];
    for (const field of required) {
      const covered = blocked.some(
        (b) => b.toLowerCase().includes(field) || field.includes(b.toLowerCase())
      );
      expect(covered, `BLOCKED_KEYS should cover "${field}"`).toBe(true);
    }
  });

  test('trackEvent silently ignores empty or non-string event names', async ({ page }) => {
    await page.goto('/');
    const captured = await page.evaluate(() => {
      const events = [];
      window.umami.track = function (name, payload) {
        events.push({ name, payload });
      };
      window.trackEvent('', { x: 1 });
      window.trackEvent('   ', { x: 1 });
      return events;
    });
    expect(captured).toHaveLength(0);
  });

  test('trackEvent never throws — analytics errors stay silent', async ({ page }) => {
    await page.goto('/');
    const threw = await page.evaluate(() => {
      try {
        // Pass a payload with a getter that throws
        const badPayload = {};
        Object.defineProperty(badPayload, 'boom', {
          get() {
            throw new Error('intentional getter error');
          },
          enumerable: true,
        });
        window.trackEvent('test_event', badPayload);
        return false;
      } catch {
        return true;
      }
    });
    expect(threw).toBe(false);
  });
});

// ─── quiz_start event ────────────────────────────────────────────────────────

test.describe('quiz_start event', () => {
  test('fires when a quiz page initialises with quiz ID and question count', async ({
    page,
  }) => {
    await page.goto(
      '/HTML/Courses and Activities/Course 3/TAandSEquizcourse3.html'
    );
    await page.waitForFunction(
      () => window.__capturedAnalyticsEvents.some((e) => e.name === 'quiz_start'),
      null,
      { timeout: 10_000 }
    );

    const events = await page.evaluate(() =>
      window.__capturedAnalyticsEvents.filter((e) => e.name === 'quiz_start')
    );
    expect(events).toHaveLength(1);
    expect(typeof events[0].payload.quiz).toBe('string');
    expect(events[0].payload.quiz.length).toBeGreaterThan(0);
    expect(typeof events[0].payload.total_questions).toBe('number');
    expect(events[0].payload.total_questions).toBeGreaterThan(0);
  });

  test('quiz_start carries the quiz ID set in the page init call', async ({
    page,
  }) => {
    await page.goto(
      '/HTML/Courses and Activities/Course 3/TAandSEquizcourse3.html'
    );
    await page.waitForFunction(
      () => window.__capturedAnalyticsEvents.some((e) => e.name === 'quiz_start'),
      null,
      { timeout: 10_000 }
    );

    const events = await page.evaluate(() =>
      window.__capturedAnalyticsEvents.filter((e) => e.name === 'quiz_start')
    );
    expect(events[0].payload.quiz).toBe('course-3-threat-actors-social-engineering');
    expect(events[0].payload.total_questions).toBe(4);
  });

  test('quiz_start payload contains no forbidden PII fields', async ({ page }) => {
    await page.goto(
      '/HTML/Courses and Activities/Course 3/TAandSEquizcourse3.html'
    );
    await page.waitForFunction(
      () => window.__capturedAnalyticsEvents.some((e) => e.name === 'quiz_start'),
      null,
      { timeout: 10_000 }
    );

    const payload = await page.evaluate(
      () =>
        window.__capturedAnalyticsEvents.find((e) => e.name === 'quiz_start').payload
    );
    const forbidden = ['email', 'name', 'answer', 'input', 'prompt', 'session', 'user', 'password', 'token', 'text'];
    for (const key of Object.keys(payload)) {
      for (const bad of forbidden) {
        expect(key.toLowerCase(), `key "${key}" must not contain "${bad}"`).not.toContain(bad);
      }
    }
  });

  test('fires on legacy quiz pages that do not use the shared quiz engine', async ({
    page,
  }) => {
    await page.goto(
      '/HTML/Courses and Activities/Course 6/QuizLinuxcourse6.html'
    );
    await page.waitForFunction(
      () => window.__capturedAnalyticsEvents.some((e) => e.name === 'quiz_start'),
      null,
      { timeout: 10_000 }
    );

    const payload = await page.evaluate(
      () =>
        window.__capturedAnalyticsEvents.find((e) => e.name === 'quiz_start').payload
    );
    expect(payload.quiz).toBe('course-6-quizlinuxcourse6');
    expect(payload.total_questions).toBe(4);
  });
});

// ─── course_progress event ───────────────────────────────────────────────────

test.describe('course_progress event', () => {
  test('fires when a course page is visited with page_id and page_type', async ({
    page,
  }) => {
    await page.goto(
      '/HTML/Courses and Activities/Course 3/SocialEngineeringcourse3.html'
    );
    await page.waitForFunction(
      () => window.__capturedAnalyticsEvents.some((e) => e.name === 'course_progress'),
      null,
      { timeout: 10_000 }
    );

    const events = await page.evaluate(() =>
      window.__capturedAnalyticsEvents.filter((e) => e.name === 'course_progress')
    );
    expect(events).toHaveLength(1);
    expect(typeof events[0].payload.page_id).toBe('string');
    expect(events[0].payload.page_id.length).toBeGreaterThan(0);
    expect(events[0].payload.page_type).toBe('course-page');
  });

  test('fires with page_type quiz when a quiz page is visited', async ({
    page,
  }) => {
    await page.goto(
      '/HTML/Courses and Activities/Course 3/TAandSEquizcourse3.html'
    );
    await page.waitForFunction(
      () => window.__capturedAnalyticsEvents.some((e) => e.name === 'course_progress'),
      null,
      { timeout: 10_000 }
    );

    const events = await page.evaluate(() =>
      window.__capturedAnalyticsEvents.filter((e) => e.name === 'course_progress')
    );
    expect(events[0].payload.page_type).toBe('quiz');
  });

  test('course_progress payload contains no forbidden PII fields', async ({
    page,
  }) => {
    await page.goto(
      '/HTML/Courses and Activities/Course 3/SocialEngineeringcourse3.html'
    );
    await page.waitForFunction(
      () => window.__capturedAnalyticsEvents.some((e) => e.name === 'course_progress'),
      null,
      { timeout: 10_000 }
    );

    const payload = await page.evaluate(
      () =>
        window.__capturedAnalyticsEvents.find((e) => e.name === 'course_progress').payload
    );
    const forbidden = ['email', 'name', 'answer', 'input', 'prompt', 'session', 'user', 'password', 'token', 'text'];
    for (const key of Object.keys(payload)) {
      for (const bad of forbidden) {
        expect(key.toLowerCase(), `key "${key}" must not contain "${bad}"`).not.toContain(bad);
      }
    }
  });

  test('does not fire on non-course pages like the home page', async ({
    page,
  }) => {
    await page.goto('/');
    // Allow time for any async events to settle
    await page.waitForTimeout(2000);
    const hasCourseProgress = await page.evaluate(() =>
      window.__capturedAnalyticsEvents.some((e) => e.name === 'course_progress')
    );
    expect(hasCourseProgress).toBe(false);
  });

  test('fires on course pages that load analytics.js without header progress injection', async ({
    page,
  }) => {
    await page.goto(
      '/HTML/Courses and Activities/Course 12/Introductioncourse12.html'
    );
    await page.waitForFunction(
      () => window.__capturedAnalyticsEvents.some((e) => e.name === 'course_progress'),
      null,
      { timeout: 10_000 }
    );

    const payload = await page.evaluate(
      () =>
        window.__capturedAnalyticsEvents.find((e) => e.name === 'course_progress').payload
    );
    expect(payload).toEqual({
      page_id: 'course-12-introductioncourse12',
      page_type: 'course-page',
    });
  });
});

// ─── live_help_opened event ──────────────────────────────────────────────────

test.describe('live_help_opened event', () => {
  test('fires when the Live Help page loads', async ({ page }) => {
    await page.goto('/HTML/LiveHelp.html');
    await page.waitForFunction(
      () => window.__capturedAnalyticsEvents.some((e) => e.name === 'live_help_opened'),
      null,
      { timeout: 10_000 }
    );

    const events = await page.evaluate(() =>
      window.__capturedAnalyticsEvents.filter((e) => e.name === 'live_help_opened')
    );
    expect(events).toHaveLength(1);
  });

  test('live_help_opened payload is empty — no PII risk', async ({ page }) => {
    await page.goto('/HTML/LiveHelp.html');
    await page.waitForFunction(
      () => window.__capturedAnalyticsEvents.some((e) => e.name === 'live_help_opened'),
      null,
      { timeout: 10_000 }
    );

    const payload = await page.evaluate(
      () =>
        window.__capturedAnalyticsEvents.find((e) => e.name === 'live_help_opened').payload
    );
    expect(Object.keys(payload)).toHaveLength(0);
  });

  test('does not fire on non-LiveHelp pages', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    const fired = await page.evaluate(() =>
      window.__capturedAnalyticsEvents.some((e) => e.name === 'live_help_opened')
    );
    expect(fired).toBe(false);
  });
});
