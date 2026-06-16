// @ts-check
/**
 * Frontend smoke tests for the CyberMinds student learning flow.
 *
 * These tests run against a local static server (no backend, Docker, or Go).
 * Mock-terminal mode (?mockTerminal=1) replaces all WebSocket/backend calls
 * with in-memory fixture data so every flow is self-contained.
 *
 * Flows covered:
 *   1. Home page renders and exposes the Get Started link.
 *   2. Home → Course Catalog navigation.
 *   3. CTF Catalog loads challenge cards and links to the terminal.
 *   4. CTF Catalog → Terminal page navigation.
 *   5. Mock terminal initialises without any backend connection.
 *   6. Challenge panel populates once the editor (Monaco CDN) has loaded.
 *   7. Completing a mock challenge updates the progress chip and shows a toast.
 */
const { test, expect } = require('@playwright/test');

// ─── helpers ────────────────────────────────────────────────────────────────

const TERMINAL_MOCK_URL =
  '/HTML/terminal/index.html?challenge=linux-basics&mockTerminal=1';

/** Wait for the mock session to report "Connected (mock)" in the status bar. */
async function waitForMockReady(page) {
  await expect(page.locator('#statusText')).toHaveText('Connected (mock)', {
    timeout: 10_000,
  });
}

// ─── Home page ───────────────────────────────────────────────────────────────

test.describe('Home page', () => {
  test('loads with site title and Get Started link', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/CyberMinds/);
    await expect(
      page.getByRole('link', { name: /get started/i })
    ).toBeVisible();
  });
});

// ─── Navigation ──────────────────────────────────────────────────────────────

test.describe('Navigation', () => {
  test('home → course catalog', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /get started/i }).click();
    await expect(page).toHaveURL(/course_Contents\.html/);
    await expect(page.locator('.page-title')).toContainText('Courses');
  });

  test('CTF catalog shows challenge cards', async ({ page }) => {
    await page.goto('/HTML/CTF.html');
    await expect(page.locator('.page-title')).toContainText('CTFs');

    const cards = page.locator('a.course-card[href*="terminal/index.html"]');
    await expect(cards.first()).toBeVisible();

    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('CTF catalog → terminal page', async ({ page }) => {
    await page.goto('/HTML/CTF.html');
    await page.locator('a[href*="challenge=linux-basics"]').click();
    await expect(page).toHaveURL(/terminal\/index\.html/);
    await expect(page).toHaveTitle('CyberMinds Terminal');
  });
});

// ─── Mock terminal ───────────────────────────────────────────────────────────

test.describe('Mock terminal', () => {
  test('initialises without backend connection', async ({ page }) => {
    await page.goto(TERMINAL_MOCK_URL);

    // Status bar must flip to "Connected (mock)" — this confirms that
    // isMockTerminal=true was detected and the fake ws object is in place.
    await waitForMockReady(page);

    // Loading skeleton must be hidden once mock init completes.
    await expect(page.locator('#loading')).toHaveClass(/hidden/);
  });

  test('challenge panel populates after editor loads', async ({ page }) => {
    await page.goto(TERMINAL_MOCK_URL);

    // loadChallenge() runs inside the Monaco require() callback, so we allow
    // extra time for the CDN script to arrive and execute.
    await expect(page.locator('#challengeTitle')).toHaveText(
      'Linux Basics Warmup',
      { timeout: 30_000 }
    );
    await expect(page.locator('#challengeObjective')).not.toBeEmpty();
    await expect(page.locator('#challengeSteps li').first()).toBeVisible();
  });

  test('completing challenge updates progress chip and shows toast', async ({
    page,
  }) => {
    await page.goto(TERMINAL_MOCK_URL);
    await waitForMockReady(page);

    // Seed a passing answer directly via the mock file API.
    // setMockFile() is a global function declared in mock.js (non-module
    // sloppy-mode script), so it is accessible on window.
    await page.evaluate(() => {
      // eslint-disable-next-line no-undef
      window.setMockFile(
        'report.txt',
        'owner: cyberminds, group: staff, perms: 0755\n'
      );
    });

    await page.locator('#checkSolutionBtn').click();

    // Progress chip should immediately reflect the first completed challenge.
    await expect(page.locator('#progressChip')).toContainText('1/');

    // Toast text persists in the DOM even after the visible class is removed,
    // so toContainText() matches reliably within the retry window.
    await expect(page.locator('#toast')).toContainText(/completed/i);
  });
});
