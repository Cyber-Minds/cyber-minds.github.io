// @ts-check
const { test, expect } = require('@playwright/test');

const COURSE_PAGES = [
  '/HTML/Courses and Activities/Course 9/Introductioncourse9.html',
  '/HTML/Courses and Activities/Course 9/ResourcesPentestingcourse9.html',
  '/HTML/Courses and Activities/Course 10/Addresses&Packetscourse10.html',
  '/HTML/Courses and Activities/Course 10/Introductioncourse10.html',
  '/HTML/Courses and Activities/Course 10/NetworkSecurityMethodscourse10.html',
  '/HTML/Courses and Activities/Course 10/NetworkTopologiescourse10.html',
  '/HTML/Courses and Activities/Course 10/NetworkingBasicscourse10.html',
  '/HTML/Courses and Activities/Course 10/NetworkingQuiz1course10.html',
  '/HTML/Courses and Activities/Course 10/NetworkingQuiz2.html',
  '/HTML/Courses and Activities/Course 10/OSI&TCPcourse10.html',
  '/HTML/Courses and Activities/Course 10/Protocols&Portscourse10.html',
  '/HTML/Courses and Activities/Course 11/Introductioncourse11.html',
  '/HTML/Courses and Activities/Course 11/CybersecurityCloudQuiz1Course11.html',
];

async function assertCoursePage(page, path) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#cmh-main-nav a')).toHaveCount(7);

  const layout = await page.evaluate(() => {
    const toggle = document.querySelector('#cmh-menu-toggle');
    const logo = document.querySelector('.cmh-logo');
    const logoBox = logo?.getBoundingClientRect();
    const toggleBox = toggle?.getBoundingClientRect();

    return {
      headers: document.querySelectorAll('header').length,
      navs: document.querySelectorAll('nav').length,
      nestedAnchors: document.querySelectorAll('a a').length,
      currentLinks: document.querySelectorAll(
        '#cmh-main-nav a[aria-current="page"]'
      ).length,
      sideCurrentLinks: document.querySelectorAll(
        '.leftRectangle-section2 a[aria-current="page"]'
      ).length,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      logoToggleOverlap:
        !!(
          logoBox &&
          toggleBox &&
          logoBox.left < toggleBox.right &&
          toggleBox.left < logoBox.right &&
          logoBox.top < toggleBox.bottom &&
          toggleBox.top < logoBox.bottom
        ),
    };
  });

  expect(errors).toEqual([]);
  expect(layout.headers).toBe(1);
  expect(layout.navs).toBe(1);
  expect(layout.nestedAnchors).toBe(0);
  expect(layout.currentLinks).toBe(1);
  expect(layout.sideCurrentLinks).toBe(1);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
  expect(layout.logoToggleOverlap).toBe(false);

  const toggle = page.locator('#cmh-menu-toggle');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#cmh-main-nav a').first()).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();

  await toggle.click();
  await page.locator('#cmh-menu-backdrop').dispatchEvent('click');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
}

test.describe('Shared course navbar', () => {
  test('renders one accessible, overflow-free navbar on every changed course page', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 812 });

    for (const path of COURSE_PAGES) {
      await assertCoursePage(page, path);
    }
  });

  test('keeps the Course 10 layout within tablet and desktop viewports', async ({
    page,
  }) => {
    for (const width of [768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(
        '/HTML/Courses and Activities/Course 10/Introductioncourse10.html',
        { waitUntil: 'domcontentloaded' }
      );
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        headers: document.querySelectorAll('header').length,
        navs: document.querySelectorAll('nav').length,
      }));
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
      expect(metrics.headers).toBe(1);
      expect(metrics.navs).toBe(1);
    }
  });

  test('keeps the Course 10 networking quiz functional', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto(
      '/HTML/Courses and Activities/Course 10/NetworkingQuiz1course10.html',
      { waitUntil: 'domcontentloaded' }
    );

    for (const answer of ['q1-VW', 'q2-open', 'q3-true', 'q4-dive']) {
      await page.locator(`label[for="${answer}"]`).click();
    }
    await page.locator('.submit').click();
    await expect(page.locator('#result')).toHaveText('Your score is: 4/4');
  });
});
