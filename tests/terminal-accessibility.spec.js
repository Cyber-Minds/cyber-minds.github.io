// @ts-check
/**
 * Keyboard, landmark, and live-announcement contract for the CTF terminal.
 * The workspace is simulated locally; screenshots and videos are disabled so
 * terminal output and workspace content cannot enter test artifacts.
 */
const { test, expect } = require('@playwright/test');
const {
  stubTerminalCdn,
  terminalMockUrl,
} = require('./helpers/terminal-stubs');

test.use({ screenshot: 'off', video: 'off' });

const browserErrors = new WeakMap();

test.beforeEach(async ({ page }) => {
  browserErrors.set(page, []);
  page.on('pageerror', () => browserErrors.get(page).push('page error'));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      browserErrors.get(page).push('console error');
    }
  });

  await stubTerminalCdn(page);
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ body: '', contentType: 'text/css' })
  );
  await page.route('https://fonts.gstatic.com/**', (route) =>
    route.fulfill({ body: '', contentType: 'font/woff2' })
  );
  await page.route('https://kit.fontawesome.com/**', (route) =>
    route.fulfill({ body: '', contentType: 'text/javascript' })
  );
  await page.route('https://cloud.umami.is/**', (route) =>
    route.fulfill({ body: '', contentType: 'text/javascript' })
  );
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page)).toEqual([]);
});

async function openChallenge(page, challengeId) {
  await page.goto(terminalMockUrl(challengeId));
  await expect(page.locator('#statusText')).toHaveText('Ready', {
    timeout: 10_000,
  });
  await expect(page.getByRole('tablist', { name: 'Workspace files' })).toBeVisible();
}

test('challenge catalog opens a challenge from the keyboard', async ({
  page,
}) => {
  await page.goto('/HTML/CTF.html');

  await expect(page.getByRole('heading', { level: 1, name: 'CTFs' })).toBeVisible();
  await expect(page.locator('main section[aria-label="Available CTF challenges"]')).toBeVisible();

  const challenge = page.getByRole('link', {
    name: 'Open Linux Basics Warmup challenge',
  });
  await challenge.focus();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/terminal\/index\.html\?challenge=linux-basics/);
  await expect(page.locator('#statusText')).toHaveText('Ready', {
    timeout: 10_000,
  });
});

test('terminal panels, editor tabs, and controls expose named semantics', async ({
  page,
}) => {
  await openChallenge(page, 'linux-basics');

  await expect(
    page.getByRole('heading', { level: 1, name: 'CTF terminal workspace' })
  ).toBeAttached();
  await expect(page.getByRole('main', { name: 'CTF terminal workspace' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Challenge' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Challenges' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Linux Basics Warmup' })
  ).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('region', { name: 'Editor' })).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Workspace files' })).toBeVisible();

  const activeTab = page.getByRole('tab', { name: 'hello.py' });
  await expect(activeTab).toHaveAttribute('aria-selected', 'true');
  await expect(activeTab).toHaveAttribute('aria-controls', 'editor');
  await expect(page.getByRole('tabpanel', { name: 'hello.py' })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Terminal input and output' })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load Starter' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy First Command' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check Solution' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear terminal' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run code' })).toBeVisible();
  expect(await page.evaluate(() => terminal.options.screenReaderMode)).toBe(true);
  await expect(page.getByRole('button', { name: 'Toggle color theme' })).toHaveAttribute(
    'aria-pressed',
    'false'
  );

  const themeToggle = page.locator('#themeToggleBtn');
  await themeToggle.focus();
  await page.evaluate(() => updateStatus('error', 'Disconnected'));
  await expect(page.locator('#connectionAnnouncement')).toHaveText(
    'Terminal status: Disconnected.'
  );
  await expect(themeToggle).toBeFocused();
});

test('file tabs switch with arrow keys and retain focus', async ({ page }) => {
  await openChallenge(page, 'linux-basics');

  const pythonTab = page.getByRole('tab', { name: 'hello.py' });
  await pythonTab.focus();
  await page.keyboard.press('ArrowRight');

  const javascriptTab = page.getByRole('tab', { name: 'hello.js' });
  await expect(javascriptTab).toHaveAttribute('aria-selected', 'true');
  await expect(javascriptTab).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'hello.js' })).toBeVisible();
});

test('keyboard challenge selection and validation preserve focus and announce status', async ({
  page,
}) => {
  for (const width of [1280, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await openChallenge(page, 'web-recon');

    const mobile = width <= 980;
    if (mobile) {
      const challengeView = page.locator('#mobileChallengeBtn');
      await challengeView.focus();
      await page.keyboard.press('Enter');
      await expect(challengeView).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.challenge-panel')).toBeVisible();
    }

    const linuxChallenge = page.getByRole('button', {
      name: 'Linux Basics Warmup',
    });
    await linuxChallenge.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#challengeTitle')).toHaveText('Linux Basics Warmup');
    await expect(page.locator('#challengeAnnouncement')).toHaveText(
      'Challenge changed to Linux Basics Warmup.'
    );
    if (mobile) {
      await expect(page.locator('#editorPanelHeading')).toBeFocused();
    } else {
      await expect(linuxChallenge).toBeFocused();
    }

    if (mobile) {
      const challengeView = page.locator('#mobileChallengeBtn');
      await challengeView.focus();
      await page.keyboard.press('Enter');
    }

    const checkButton = page.locator('#checkSolutionBtn');
    await checkButton.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#validationAnnouncement')).toHaveText(
      'Checker result: not passed for Linux Basics Warmup.'
    );
    await expect(checkButton).toBeFocused();

    await page.evaluate(() => {
      setMockFile('report.txt', 'owner: learner, group: staff, permissions: 0755\n');
      mockWriteLine('terminal output privacy fixture');
    });
    await page.keyboard.press('Enter');
    await expect(page.locator('#validationAnnouncement')).toHaveText(
      'Checker result: passed for Linux Basics Warmup.'
    );
    await expect(page.locator('#challengeTitle')).toHaveText('Web Recon Starter');
    await expect(page.locator('#challengeAnnouncement')).toHaveText(
      'Challenge changed to Web Recon Starter.'
    );
    if (mobile) {
      await expect(page.locator('#editorPanelHeading')).toBeFocused();
    } else {
      await expect(checkButton).toBeFocused();
    }

    const analyticsQueue = await page.evaluate(() =>
      JSON.stringify(window.__cybermindsAnalyticsQueue || [])
    );
    expect(analyticsQueue).not.toContain('terminal output privacy fixture');
    await page.evaluate(() => localStorage.removeItem('cm_ctf_progress_v1'));
  }
});

test('mobile view controls and hidden panels respect keyboard order at supported widths', async ({
  page,
}) => {
  await openChallenge(page, 'linux-basics');

  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 });
    const switcher = page.getByRole('navigation', { name: 'Workspace views' });
    const challengeButton = page.getByRole('button', { name: 'Challenge' });
    const editorButton = page.getByRole('button', { name: 'Editor' });
    const terminalButton = page.getByRole('button', { name: 'Terminal' });

    await expect(switcher).toBeVisible();
    await terminalButton.focus();
    await page.keyboard.press('Enter');
    await expect(terminalButton).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.terminal-panel')).toBeVisible();
    await expect(page.locator('.challenge-panel')).toBeHidden();
    await expect(page.locator('.editor-panel')).toBeHidden();

    await challengeButton.focus();
    await page.keyboard.press('Tab');
    await expect(editorButton).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(terminalButton).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#clearBtn')).toBeFocused();
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('#mobileViewSwitcher')).toBeHidden();

  await page.locator('#themeToggleBtn').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('a[href="../../index.html"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('a[href="../CTF.html"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.locator('#challengeNav .challenge-nav-item').first()
  ).toBeFocused();
});
