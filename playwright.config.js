// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Playwright smoke test config.
 *
 * Run locally:
 *   npx playwright test                  # headless, one-shot
 *   npx playwright test --headed         # watch the browser
 *   npx playwright test --ui             # interactive UI mode
 *
 * The web server (`http-server`) starts automatically on 127.0.0.1:3939 and
 * serves the repo root as a static site — no backend, Docker, or Go required.
 * Pass PLAYWRIGHT_SERVER_URL to point at an already-running server instead:
 *   PLAYWRIGHT_SERVER_URL=http://localhost:3939 npx playwright test
 */

const defaultServerUrl = 'http://127.0.0.1:3939';
const externalServerUrl = process.env.PLAYWRIGHT_SERVER_URL;
const serverUrl = externalServerUrl || defaultServerUrl;
const defaultServer = new URL(defaultServerUrl);

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',

  /* Maximum time for a single test to run. CDN resources (Monaco, xterm) may
   * add a few seconds on first load; 30 s leaves a comfortable margin. */
  timeout: 30_000,

  /* Assertion retry window within a test */
  expect: { timeout: 15_000 },

  /* Run tests sequentially — keeps the static server free of concurrency
   * surprises and gives clear output in CI. */
  fullyParallel: false,
  workers: 1,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    baseURL: serverUrl,
    headless: true,
    /* Capture a screenshot and video on failure to aid debugging in CI */
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    /* Smoke suite runs in Chromium only — fast and sufficient for catching
     * student-journey regressions before they reach production. */
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: externalServerUrl
    ? undefined
    : {
        /* Serve the repo root on loopback only.
         * http-server is a devDependency so npx picks up the local copy. */
        command: [
          'npx http-server .',
          `-a ${defaultServer.hostname}`,
          `-p ${defaultServer.port}`,
          '-s',
          '-d false',
          '--no-dotfiles',
        ].join(' '),
        url: serverUrl,
        /* In CI always spin up a fresh server; locally reuse one if it is
         * already running (speeds up interactive test runs). */
        reuseExistingServer: !process.env.CI,
        timeout: 15_000,
      },
});
