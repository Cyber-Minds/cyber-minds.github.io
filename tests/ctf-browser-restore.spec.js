// @ts-check
/**
 * Backend-free CTF workflow verification.
 *
 * The hosted terminal backend is down and unfunded, so the terminal now runs a
 * browser simulation by default. That makes the simulation the product rather
 * than a test fixture, and the whole learner-facing promise of the CTF track
 * now rests on it.
 *
 * The existing suites spot-check three challenges. This walks the entire
 * catalog: for every registered challenge it seeds a correct solution, runs the
 * checker, and asserts the challenge is marked complete and the learner is
 * advanced. If a challenge is unsolvable without the backend, this fails and
 * names it, rather than leaving a learner stuck on a page that cannot be
 * finished.
 *
 * It also pins two properties of the stopgap that are easy to regress:
 *   - no request reaches the dead backend origin (a hanging fetch on every
 *     check would make the page feel broken even though it works);
 *   - progress survives a reload, because localStorage is now the only store.
 *
 * Runs entirely against the repository test server. No backend, no network,
 * no learner data.
 */
const { test, expect } = require('@playwright/test');
const {
  stubTerminalCdn,
  terminalMockUrl,
} = require('./helpers/terminal-stubs');

/**
 * A known-good solution per challenge, derived from the checkers in
 * Javascript/terminal/app/challenges.js. Each entry writes the files a learner
 * would have produced.
 */
const SOLUTIONS = {
  'linux-basics': {
    'report.txt': 'owner: cyberminds, group: staff, perms: 0755\n',
  },
  'web-recon': {
    'recon-notes.txt': [
      'port 9090 open, nginx',
      'header: Server: nginx',
      'X-Powered-By: PHP/7.4.3',
      'X-Application: InternalPortal/2.1',
    ].join('\n'),
  },
  'log-hunt': {
    'findings.txt': [
      '  42 192.168.1.45',
      '   3 10.0.0.8',
      'Summary: brute-force auth spike, repeated failed password attempts',
    ].join('\n'),
  },
  'priv-esc': {
    'priv-esc-report.txt': [
      'user: jsmith authenticated over SSH',
      'escalation at 02:11 via su to root',
    ].join('\n'),
  },
  'incident-timeline': {
    'timeline.txt': [
      '03:10:14 sshd failed password for admin',
      '03:10:29 sshd failed password again',
      '03:10:47 sshd accepted password, ssh login',
      '03:10:50 GET /login HTTP/1.1 200',
      '03:11:02 POST /login HTTP/1.1 302',
      '03:11:05 GET /admin HTTP/1.1 200',
      '03:11:33 GET /admin/export request',
      '03:12:05 sshd session closed',
    ].join('\n'),
  },
  'suspicious-beaconing': {
    'beacon-report.txt': [
      'IP: 192.0.2.10  user-agent: Mozilla/5.0 (Windows NT 10.0)  interval: 30s',
      'IP: 203.0.113.77  user-agent: python-requests/2.28.0  interval: 30s',
      'Pattern: periodic callback every 30 seconds - suspected beaconing',
    ].join('\n'),
  },
  'phishing-header': {
    'phishing-findings.txt': [
      'Impersonated domain: corporate-alerts.example.com',
      '1. Return-Path envelope sender mismatch against the From display address',
      '2. Authentication-Results shows spf=fail',
      '3. Authentication-Results shows dkim=fail (signature verification failed)',
      '4. Received chain includes an unexpected relay hop',
    ].join('\n'),
  },
  'iam-least-privilege': {
    'policy.json': JSON.stringify(
      {
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'S3BackupRead',
            Effect: 'Allow',
            Action: ['s3:GetObject'],
            Resource: ['arn:aws:s3:::cm-backup-data-123456789012/prod/daily/*'],
          },
          {
            Sid: 'S3BackupList',
            Effect: 'Allow',
            Action: ['s3:ListBucket'],
            Resource: ['arn:aws:s3:::cm-backup-data-123456789012'],
          },
          {
            Sid: 'CloudWatchLogsWrite',
            Effect: 'Allow',
            Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
            Resource: [
              'arn:aws:logs:us-east-1:123456789012:log-group:/backup/cm-agent:*',
            ],
          },
        ],
      },
      null,
      2
    ),
  },
};

async function openTerminal(page, challengeId) {
  await page.goto(terminalMockUrl(challengeId));
  await expect(page.locator('#statusText')).toHaveText('Ready', {
    timeout: 15_000,
  });
  await page.waitForFunction(() => typeof setMockFile === 'function', null, {
    timeout: 15_000,
  });
}

async function seedAndCheck(page, challengeId) {
  await page.evaluate((files) => {
    for (const [name, content] of Object.entries(files)) {
      setMockFile(name, content);
    }
  }, SOLUTIONS[challengeId]);

  await page.locator('#checkSolutionBtn').click();
}

test.beforeEach(async ({ page }) => {
  await stubTerminalCdn(page);
});

test.describe('CTF workflow without a backend', () => {
  test('every registered challenge has a seeded solution in this suite', async ({
    page,
  }) => {
    await openTerminal(page, 'linux-basics');
    const registered = await page.evaluate(() => Object.keys(challengeCatalog));

    expect(registered.length).toBeGreaterThan(0);
    const missing = registered.filter((id) => !SOLUTIONS[id]);
    expect(
      missing,
      `these challenges have no seeded solution here, so their backend-free ` +
        `path is unverified: ${missing.join(', ')}`
    ).toEqual([]);
  });

  test('every challenge can be completed with no backend', async ({ page }) => {
    await openTerminal(page, 'linux-basics');
    const registered = await page.evaluate(() => Object.keys(challengeCatalog));

    for (const challengeId of registered) {
      await openTerminal(page, challengeId);

      // Confirm the page actually opened the challenge asked for; a silent
      // fallback would make the next assertion test the wrong thing.
      const active = await page.evaluate(() => activeChallengeId);
      expect(active, `terminal did not open ${challengeId}`).toBe(challengeId);

      await seedAndCheck(page, challengeId);

      await expect
        .poll(
          () =>
            page.evaluate(
              (id) => !!(completedChallenges[id] && completedChallenges[id].passed),
              challengeId
            ),
          {
            timeout: 10_000,
            message:
              `${challengeId} could not be completed in the browser ` +
              'simulation, so a learner reaching it has no way to finish it',
          }
        )
        .toBe(true);
    }
  });

  test('checking a solution contacts no backend origin', async ({ page }) => {
    await openTerminal(page, 'linux-basics');

    const apiOrigin = await page.evaluate(() => apiOrigin);
    const offsite = [];
    page.on('request', (request) => {
      const url = request.url();
      if (apiOrigin && url.startsWith(apiOrigin)) offsite.push(url);
    });

    await seedAndCheck(page, 'linux-basics');
    await expect
      .poll(() =>
        page.evaluate(
          () => !!(completedChallenges['linux-basics'] || {}).passed
        )
      )
      .toBe(true);

    expect(
      offsite,
      `the check reached the offline backend at ${apiOrigin}: ${offsite.join(', ')}`
    ).toEqual([]);
  });

  test('progress survives a reload, since localStorage is the only store', async ({
    page,
  }) => {
    await openTerminal(page, 'linux-basics');
    await seedAndCheck(page, 'linux-basics');
    await expect
      .poll(() =>
        page.evaluate(
          () => !!(completedChallenges['linux-basics'] || {}).passed
        )
      )
      .toBe(true);

    await page.reload();
    await expect(page.locator('#statusText')).toHaveText('Ready', {
      timeout: 15_000,
    });

    const stillComplete = await page.evaluate(
      () => !!(completedChallenges['linux-basics'] || {}).passed
    );
    expect(
      stillComplete,
      'completion was lost on reload; with no backend, localStorage is the ' +
        'only place progress exists'
    ).toBe(true);
  });

  test('an incorrect solution is still rejected', async ({ page }) => {
    // The stopgap must not become a checker that passes anything.
    await openTerminal(page, 'linux-basics');

    await page.evaluate(() => {
      setMockFile('report.txt', 'hello world\n');
    });
    await page.locator('#checkSolutionBtn').click();

    await page.waitForTimeout(1000);
    const passed = await page.evaluate(
      () => !!(completedChallenges['linux-basics'] || {}).passed
    );
    expect(
      passed,
      'a report with no ownership information was accepted; the browser ' +
        'checker is not actually validating'
    ).toBe(false);
  });
});
