// @ts-check
/**
 * Terminal third-party asset integrity.
 *
 * Two layers, deliberately separated:
 *
 * 1. Served-markup assertions (always run, no external network). These read
 *    the terminal page exactly as the static server delivers it and confirm
 *    every reviewed asset still carries its integrity hash and crossorigin.
 *    The mock-terminal suites strip `integrity` so their CDN stubs can run --
 *    see tests/helpers/terminal-stubs.js -- so without this guard, deleting
 *    SRI from the page would not fail a single test. This file never installs
 *    that stub.
 *
 * 2. A live CDN load (opt-in via TERMINAL_LIVE_CDN=1). This is the only check
 *    that proves a recorded hash is actually correct against a real browser
 *    enforcing SRI: a wrong hash blocks the script and the terminal never
 *    starts. It is gated because a CDN hiccup must not fail an unrelated pull
 *    request; the weekly workflow and the dependency-update procedure run it.
 */
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const inventory = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'terminal-assets.json'),
    'utf8'
  )
);

const htmlAssets = inventory.assets.filter((a) => a.declaredIn === 'html');
const pinnedAssets = htmlAssets.filter((a) => a.sri === 'required');
const TERMINAL_PAGE = '/HTML/terminal/index.html';

test.describe('terminal asset integrity (served markup)', () => {
  test('every reviewed asset is pinned in the page as served', async ({
    request,
  }) => {
    const response = await request.get(TERMINAL_PAGE);
    expect(response.ok(), `${TERMINAL_PAGE} did not load`).toBe(true);
    const html = await response.text();

    expect(
      pinnedAssets.length,
      'inventory lists no integrity-pinned assets'
    ).toBeGreaterThan(0);

    for (const asset of pinnedAssets) {
      expect(html, `page no longer references ${asset.id}`).toContain(asset.url);
      expect(
        html,
        `${asset.id} is missing its reviewed integrity hash in the served HTML`
      ).toContain(asset.integrity);
    }

    // crossorigin is not optional: without it the browser cannot verify a
    // cross-origin subresource and blocks it outright.
    const crossoriginCount = (html.match(/crossorigin="anonymous"/g) || []).length;
    expect(
      crossoriginCount,
      'every integrity-pinned asset needs crossorigin="anonymous"'
    ).toBeGreaterThanOrEqual(pinnedAssets.length);
  });

  test('the page makes no insecure or protocol-relative external request', async ({
    request,
  }) => {
    const response = await request.get(TERMINAL_PAGE);
    const html = (await response.text()).replace(/<!--[\s\S]*?-->/g, '');

    const insecure = [...html.matchAll(/(?:src|href)="(http:\/\/[^"]*)"/gi)]
      .map((m) => m[1])
      .filter((url) => !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(url));
    expect(insecure, `insecure http:// references: ${insecure.join(', ')}`).toEqual([]);

    const protocolRelative = [...html.matchAll(/(?:src|href)="(\/\/[^"]*)"/gi)].map(
      (m) => m[1]
    );
    expect(
      protocolRelative,
      `protocol-relative references: ${protocolRelative.join(', ')}`
    ).toEqual([]);
  });

  test('external references stay within the approved origins', async ({
    request,
  }) => {
    const response = await request.get(TERMINAL_PAGE);
    const html = (await response.text()).replace(/<!--[\s\S]*?-->/g, '');
    const approved = new Set(inventory.approvedOrigins);

    const external = [...html.matchAll(/(?:src|href)="(https:\/\/[^"]*)"/gi)].map(
      (m) => m[1]
    );
    expect(external.length).toBeGreaterThan(0);

    for (const url of external) {
      const { origin } = new URL(url);
      expect(
        approved.has(origin),
        `unapproved origin ${origin} in ${TERMINAL_PAGE}`
      ).toBe(true);
    }
  });
});

// Opt-in: real CDN, real SRI enforcement, no stubs.
const liveCdn = process.env.TERMINAL_LIVE_CDN === '1';

test.describe('terminal asset integrity (live CDN)', () => {
  test.skip(
    !liveCdn,
    'set TERMINAL_LIVE_CDN=1 to verify the pinned hashes against the real CDN'
  );

  test('terminal starts with SRI enforced against the real CDN', async ({
    page,
  }) => {
    const sriErrors = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (msg.type() === 'error' && /integrity|Subresource Integrity/i.test(text)) {
        sriErrors.push(text);
      }
    });

    const blocked = [];
    page.on('requestfailed', (request) => {
      if (request.url().startsWith('https://cdn.jsdelivr.net')) {
        blocked.push(`${request.url()} (${request.failure()?.errorText})`);
      }
    });

    await page.goto(`${TERMINAL_PAGE}?mockTerminal=1`);

    // A failed integrity check blocks the script, so these only resolve if
    // every pinned hash is correct.
    await expect(page.locator('#statusText')).toHaveText('Connected (mock)', {
      timeout: 30_000,
    });
    await page.waitForFunction(() => typeof window.Terminal === 'function', null, {
      timeout: 30_000,
    });
    await page.waitForSelector('.monaco-editor', { timeout: 30_000 });

    expect(
      sriErrors,
      `integrity failures from the real CDN: ${sriErrors.join(' | ')}`
    ).toEqual([]);
    expect(blocked, `blocked CDN requests: ${blocked.join(' | ')}`).toEqual([]);
  });
});
