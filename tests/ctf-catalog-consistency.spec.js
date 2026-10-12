// @ts-check
/**
 * CTF catalog <-> terminal challenge registry consistency tests.
 *
 * Problem this guards against: HTML/CTF.html links to challenges by a
 * `?challenge=<id>` query string, and the terminal resolves that id against
 * `challengeCatalog` (populated by the terminal's own state module). Those
 * two things are maintained separately, so a stale or misspelled id on a
 * catalog card can silently fall back to whatever challenge was already
 * active instead of failing loudly (see challenges.js: loadChallenge() is a
 * no-op when `challengeCatalog[id]` is undefined).
 *
 * Approach: every card is scraped directly from CTF.html at test time, then
 * cross-checked against the terminal's live `window.challengeCatalog` /
 * `window.activeChallengeId`. There is no second, hand-maintained list of
 * challenge titles/objectives in this file -- the terminal's own registry is
 * the only source of truth being compared against.
 */
const { test, expect } = require('@playwright/test');

const {
  stubTerminalCdn,
  terminalMockUrl,
} = require('./helpers/terminal-stubs');

test.beforeEach(async ({ page }) => {
  await stubTerminalCdn(page);
});

async function getCatalogChallenges(page) {
  await page.goto('/HTML/CTF.html');
  const cards = page.locator('a.course-card[href*="terminal/index.html"]');
  const count = await cards.count();
  const challenges = [];

  for (let i = 0; i < count; i += 1) {
    const card = cards.nth(i);
    const href = await card.getAttribute('href');
    const title = (await card.locator('.course-title').innerText()).trim();
    const url = new URL(href, 'https://example.invalid/HTML/CTF.html');
    const challengeId = url.searchParams.get('challenge');
    challenges.push({ challengeId, title, href });
  }

  return challenges;
}

function attachErrorCollectors(page) {
  const consoleErrors = [];
  const pageErrors = [];

  const onConsole = (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  };
  const onPageError = (err) => {
    pageErrors.push(err.message);
  };

  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  return {
    consoleErrors,
    pageErrors,
    dispose() {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
    },
  };
}

async function waitForMockReady(page) {
  await expect(page.locator('#statusText')).toHaveText('Connected (mock)', {
    timeout: 10_000,
  });
}

test.describe('CTF catalog / terminal challenge registry consistency', () => {
  test('every catalog card has a unique challenge id known to the terminal registry', async ({
    page,
  }) => {
    const catalogChallenges = await getCatalogChallenges(page);
    expect(catalogChallenges.length).toBeGreaterThan(0);

    for (const { challengeId, href } of catalogChallenges) {
      expect(
        challengeId,
        `card with href "${href}" is missing a ?challenge= id`
      ).toBeTruthy();
    }

    const ids = catalogChallenges.map((c) => c.challengeId);
    const duplicates = ids.filter((id, idx) => ids.indexOf(id) !== idx);
    expect(
      Array.from(new Set(duplicates)),
      `duplicate challenge ids found across CTF.html cards`
    ).toEqual([]);

    await page.goto(terminalMockUrl(ids[0]));
    await waitForMockReady(page);
    const registryIds = await page.evaluate(() =>
      Object.keys(challengeCatalog || {})
    );
    expect(
      registryIds.length,
      'terminal challengeCatalog appears empty -- cannot validate against it'
    ).toBeGreaterThan(0);

    for (const { challengeId } of catalogChallenges) {
      expect(
        registryIds,
        `CTF.html links to unknown/misspelled challenge id "${challengeId}"`
      ).toContain(challengeId);
    }
  });

  test('each live card opens the matching challenge with no page/console errors', async ({
    page,
  }) => {
    const catalogChallenges = await getCatalogChallenges(page);

    for (const { challengeId, title } of catalogChallenges) {
      const errors = attachErrorCollectors(page);

      await page.goto(terminalMockUrl(challengeId));
      await waitForMockReady(page);
      await page.waitForFunction(
        () => !!window.__cybermindsMonacoEditor,
        null,
        { timeout: 10_000 }
      );

      const activeId = await page.evaluate(() => activeChallengeId);
      expect(
        activeId,
        `challenge "${challengeId}" from the catalog did not become active ` +
          `(terminal loaded "${activeId}" instead) -- likely an unknown id ` +
          `silently falling back`
      ).toBe(challengeId);

      const registryEntry = await page.evaluate(
        (id) => challengeCatalog[id],
        challengeId
      );
      expect(
        registryEntry,
        `no terminal registry entry for "${challengeId}"`
      ).toBeTruthy();

      await expect(page.locator('#challengeTitle')).toHaveText(
        registryEntry.title
      );
      await expect(page.locator('#challengeObjective')).toHaveText(
        registryEntry.objective
      );
      expect(
        title,
        `card title for "${challengeId}" is empty`
      ).toBeTruthy();

      expect(
        errors.consoleErrors,
        `console errors while loading "${challengeId}": ${errors.consoleErrors.join('; ')}`
      ).toEqual([]);
      expect(
        errors.pageErrors,
        `page errors while loading "${challengeId}": ${errors.pageErrors.join('; ')}`
      ).toEqual([]);

      errors.dispose();
    }
  });
});
