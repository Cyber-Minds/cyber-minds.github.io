// @ts-check
/**
 * Progressive hint disclosure tests.
 *
 * What these guard against:
 *
 * 1. Coverage drift — a challenge added to `challengeCatalog` without hints
 *    leaves learners with no recovery path, and the panel would silently hide
 *    the section rather than fail loudly.
 * 2. Spoilers — hints are prose, so nothing but a test stops someone from
 *    pasting the answer into one. The leak review below holds a per-challenge
 *    list of values the learner is supposed to discover, derived from the
 *    actual fixtures and checker scripts, and asserts no hint contains them.
 * 3. Progression bypass — revealing hints must never mark a challenge complete.
 *    Completion belongs to the container checker and the server progression
 *    path; the hint UI is local-only and advisory.
 * 4. Accessibility regressions — the reveal control must stay keyboard
 *    operable and announce new hints without trapping focus.
 */
const { test, expect } = require('@playwright/test');
const {
  stubTerminalCdn,
  terminalMockUrl,
} = require('./helpers/terminal-stubs');

/**
 * Values a learner is meant to derive themselves. Sourced from the challenge
 * fixtures and checker scripts in Javascript/terminal/state.js and
 * terminal/Dockerfile.terminal — if a hint contains one of these, the hint is
 * handing over the answer.
 *
 * Matching is case-insensitive and substring-based, so entries are the raw
 * literal values rather than regexes.
 */
const ANSWER_TOKENS = {
  'linux-basics': [],
  'web-recon': ['PHP/7.4.3', 'InternalPortal', '7.4.3'],
  'log-hunt': ['192.168.1.45'],
  'priv-esc': ['jsmith', '02:11'],
  'incident-timeline': ['192.168.50.22', '03:10:47', '03:11:33'],
  'suspicious-beaconing': ['192.0.2.10', '203.0.113.77'],
  'phishing-header': [
    'corporate-alerts.example.com',
    'phish-mailer.invalid',
    'PhishKit',
  ],
  'iam-least-privilege': [
    'cm-backup-data-123456789012',
    'arn:aws:s3:::',
    'arn:aws:logs:',
  ],
};

/**
 * Patterns that indicate a copy-paste solution regardless of challenge: a
 * redirect that writes one of the graded output files, or a fenced command
 * block that produces it.
 */
const GRADED_OUTPUT_FILES = [
  'report.txt',
  'recon-notes.txt',
  'findings.txt',
  'priv-esc-report.txt',
  'timeline.txt',
  'beacon-report.txt',
  'phishing-findings.txt',
  'policy.json',
];

async function openChallenge(page, challengeId) {
  await page.goto(terminalMockUrl(challengeId));
  await expect(page.locator('#statusText')).toHaveText('Connected (mock)', {
    timeout: 10_000,
  });
  await page.waitForFunction(
    // `typeof` on a bare identifier is safe before the module has loaded;
    // the app modules are classic scripts, so this resolves once hints.js runs.
    () => typeof renderHints === 'function',
    null,
    { timeout: 10_000 }
  );
}

async function getCatalog(page) {
  return page.evaluate(() => {
    const out = {};
    Object.keys(challengeCatalog).forEach((id) => {
      out[id] = {
        title: challengeCatalog[id].title,
        hints: challengeCatalog[id].hints || [],
      };
    });
    return out;
  });
}

test.beforeEach(async ({ page }) => {
  await stubTerminalCdn(page);
});

test.describe('hint content review', () => {
  test('every registered challenge has at least two hints', async ({
    page,
  }) => {
    await openChallenge(page, 'linux-basics');
    const catalog = await getCatalog(page);

    const ids = Object.keys(catalog);
    expect(ids.length, 'challengeCatalog appears empty').toBeGreaterThan(0);

    for (const id of ids) {
      expect(
        catalog[id].hints.length,
        `challenge "${id}" (${catalog[id].title}) has ${catalog[id].hints.length} hint(s); at least 2 are required`
      ).toBeGreaterThanOrEqual(2);

      catalog[id].hints.forEach((hint, idx) => {
        expect(
          typeof hint === 'string' && hint.trim().length > 0,
          `challenge "${id}" hint ${idx + 1} is empty`
        ).toBe(true);
      });
    }
  });

  test('no hint leaks an answer value, secret, or graded-file write', async ({
    page,
  }) => {
    await openChallenge(page, 'linux-basics');
    const catalog = await getCatalog(page);

    for (const id of Object.keys(catalog)) {
      const tokens = ANSWER_TOKENS[id];
      expect(
        tokens,
        `challenge "${id}" has no ANSWER_TOKENS entry — add one (use [] if the ` +
          `challenge genuinely has no discoverable answer value) so new ` +
          `challenges cannot skip this review`
      ).toBeDefined();

      catalog[id].hints.forEach((hint, idx) => {
        const lower = hint.toLowerCase();
        const label = `challenge "${id}" hint ${idx + 1}`;

        for (const token of tokens) {
          expect(
            lower.includes(token.toLowerCase()),
            `${label} contains the answer value "${token}"`
          ).toBe(false);
        }

        // A hint may name the output file, but must not hand over a shell
        // redirect that fills it in.
        for (const file of GRADED_OUTPUT_FILES) {
          expect(
            new RegExp(`>\\s*(/workspace/)?${file.replace('.', '\\.')}`).test(
              lower
            ),
            `${label} contains a shell redirect writing ${file}`
          ).toBe(false);
        }
      });
    }
  });
});

test.describe('hint disclosure behaviour', () => {
  test('hints are hidden until requested and reveal one at a time', async ({
    page,
  }) => {
    await openChallenge(page, 'log-hunt');

    const section = page.locator('#challengeHints');
    const list = page.locator('#hintList');
    const revealBtn = page.locator('#revealHintBtn');
    const counter = page.locator('#hintCounter');

    await expect(section).toBeVisible();
    await expect(list.locator('.hint-item')).toHaveCount(0);
    await expect(counter).toHaveText('0 of 3 revealed');
    await expect(revealBtn).toHaveAttribute('aria-expanded', 'false');
    await expect(revealBtn).toHaveText('Reveal first hint');
    await expect(page.locator('#resetHintsBtn')).toBeHidden();

    await revealBtn.click();
    await expect(list.locator('.hint-item')).toHaveCount(1);
    await expect(counter).toHaveText('1 of 3 revealed');
    await expect(revealBtn).toHaveAttribute('aria-expanded', 'true');
    await expect(revealBtn).toHaveText('Reveal next hint');
    await expect(page.locator('#resetHintsBtn')).toBeVisible();

    await revealBtn.click();
    await expect(list.locator('.hint-item')).toHaveCount(2);

    await revealBtn.click();
    await expect(list.locator('.hint-item')).toHaveCount(3);
    await expect(counter).toHaveText('3 of 3 revealed');
    await expect(revealBtn).toBeDisabled();
    await expect(revealBtn).toHaveText('All hints revealed');
  });

  test('revealed hints match the registry in order', async ({ page }) => {
    await openChallenge(page, 'phishing-header');

    const expected = await page.evaluate(
      () => challengeCatalog['phishing-header'].hints
    );

    const revealBtn = page.locator('#revealHintBtn');
    for (let i = 0; i < expected.length; i += 1) {
      await revealBtn.click();
    }

    const rendered = await page
      .locator('#hintList .hint-item-text')
      .allInnerTexts();
    expect(rendered.map((t) => t.trim())).toEqual(expected);
  });

  test('reveal control is reachable and operable by keyboard', async ({
    page,
  }) => {
    await openChallenge(page, 'web-recon');

    const revealBtn = page.locator('#revealHintBtn');
    await revealBtn.focus();
    await expect(revealBtn).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page.locator('#hintList .hint-item')).toHaveCount(1);

    await page.keyboard.press('Space');
    await expect(page.locator('#hintList .hint-item')).toHaveCount(2);

    // The live region must be polite so a revealed hint is announced without
    // yanking focus away from the control being operated.
    await expect(page.locator('#hintList')).toHaveAttribute(
      'aria-live',
      'polite'
    );
    await expect(revealBtn).toBeFocused();

    // Last hint disables the button, so focus must land somewhere sane rather
    // than falling back to <body>.
    await page.keyboard.press('Space');
    await expect(revealBtn).toBeDisabled();
    await expect(page.locator('#hintList')).toBeFocused();
  });

  test('reveal state persists across reload and resets on demand', async ({
    page,
  }) => {
    await openChallenge(page, 'priv-esc');

    const revealBtn = page.locator('#revealHintBtn');
    await revealBtn.click();
    await revealBtn.click();
    await expect(page.locator('#hintList .hint-item')).toHaveCount(2);

    await page.reload();
    await expect(page.locator('#statusText')).toHaveText('Connected (mock)', {
      timeout: 10_000,
    });
    await expect(page.locator('#hintList .hint-item')).toHaveCount(2);
    await expect(page.locator('#hintCounter')).toHaveText('2 of 3 revealed');

    await page.locator('#resetHintsBtn').click();
    await expect(page.locator('#hintList .hint-item')).toHaveCount(0);
    await expect(page.locator('#hintCounter')).toHaveText('0 of 3 revealed');
    await expect(page.locator('#revealHintBtn')).toBeEnabled();
    await expect(page.locator('#resetHintsBtn')).toBeHidden();

    await page.reload();
    await expect(page.locator('#statusText')).toHaveText('Connected (mock)', {
      timeout: 10_000,
    });
    await expect(page.locator('#hintList .hint-item')).toHaveCount(0);
  });

  test('reveal state is per challenge, not global', async ({ page }) => {
    await openChallenge(page, 'log-hunt');
    await page.locator('#revealHintBtn').click();
    await expect(page.locator('#hintList .hint-item')).toHaveCount(1);

    await openChallenge(page, 'iam-least-privilege');
    await expect(page.locator('#hintList .hint-item')).toHaveCount(0);
    await expect(page.locator('#hintCounter')).toHaveText('0 of 3 revealed');

    await openChallenge(page, 'log-hunt');
    await expect(page.locator('#hintList .hint-item')).toHaveCount(1);
  });

  test('corrupt hint storage degrades to zero revealed', async ({ page }) => {
    await page.goto(terminalMockUrl('log-hunt'));
    await page.evaluate(() =>
      localStorage.setItem('cm_ctf_hints_v1', 'not-json{')
    );
    await page.reload();
    await expect(page.locator('#statusText')).toHaveText('Connected (mock)', {
      timeout: 10_000,
    });

    await expect(page.locator('#hintList .hint-item')).toHaveCount(0);
    await expect(page.locator('#revealHintBtn')).toBeEnabled();
  });
});

test.describe('hints stay out of progression and analytics', () => {
  test('revealing every hint does not complete the challenge', async ({
    page,
  }) => {
    await openChallenge(page, 'log-hunt');

    const chipBefore = await page.locator('#progressChip').innerText();

    const revealBtn = page.locator('#revealHintBtn');
    await revealBtn.click();
    await revealBtn.click();
    await revealBtn.click();
    await expect(revealBtn).toBeDisabled();

    await expect(page.locator('#progressChip')).toHaveText(chipBefore);

    const completed = await page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem('cm_ctf_progress_v1') || '{}');
      } catch {
        return {};
      }
    });
    expect(
      completed['log-hunt'],
      'revealing hints marked the challenge complete in stored progress'
    ).toBeFalsy();

    const activeStillIncomplete = await page.evaluate(
      () => !completedChallenges[activeChallengeId]
    );
    expect(activeStillIncomplete).toBe(true);
  });

  test('hint reveals emit no analytics events and no network requests', async ({
    page,
  }) => {
    await openChallenge(page, 'suspicious-beaconing');

    const requests = [];
    page.on('request', (req) => {
      requests.push(req.url());
    });

    const queueBefore = await page.evaluate(
      () => (window.__cybermindsAnalyticsQueue || []).length
    );

    const revealBtn = page.locator('#revealHintBtn');
    await revealBtn.click();
    await revealBtn.click();
    await expect(page.locator('#hintList .hint-item')).toHaveCount(2);

    const queueAfter = await page.evaluate(
      () => (window.__cybermindsAnalyticsQueue || []).length
    );
    expect(
      queueAfter,
      'revealing a hint queued an analytics event'
    ).toBe(queueBefore);

    // Nothing may be shipped anywhere as a result of a reveal. Static assets
    // finishing their load is tolerated; a beacon or anything carrying hint
    // state is not.
    const exfil = requests.filter(
      (url) =>
        /hint/i.test(url) ||
        /\/collect|\/beacon|analytics|telemetry|gtag|gtm/i.test(url)
    );
    expect(
      exfil,
      `revealing hints triggered outbound tracking requests: ${exfil.join(', ')}`
    ).toEqual([]);

    // Nothing hint-shaped should be sitting in any analytics payload either.
    const queueText = await page.evaluate(() =>
      JSON.stringify(window.__cybermindsAnalyticsQueue || [])
    );
    expect(queueText.toLowerCase()).not.toContain('hint');
  });

  test('challenge flow still works when hints are never used', async ({
    page,
  }) => {
    await openChallenge(page, 'linux-basics');

    // Untouched hint section, normal solve path.
    await expect(page.locator('#hintList .hint-item')).toHaveCount(0);

    await page.evaluate(() => {
      setMockFile('report.txt', 'owner: cyberminds, group: staff, perms: 0755\n');
    });
    await page.locator('#checkSolutionBtn').click();

    await expect(page.locator('#progressChip')).toContainText('1/', {
      timeout: 10_000,
    });
    await expect(page.locator('#hintList .hint-item')).toHaveCount(0);
  });
});
