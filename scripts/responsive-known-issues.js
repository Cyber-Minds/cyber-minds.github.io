'use strict';

/**
 * Rebuild tests/responsive-known-issues.json from the current pages.
 *
 *   npm run test:responsive:baseline
 *
 * Runs the course sweep in recording mode (every check is evaluated, nothing
 * is asserted), then writes the checks that failed into the known-issues file.
 * Pass --no-run to rebuild from an earlier recording without re-running.
 *
 * Only do this when you mean to accept the current state as the baseline:
 * after fixing pages (the file shrinks), or when a new lesson lands with debt
 * the team has agreed to fix later. Review the diff before committing it; a new
 * entry is a known defect learners will see.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const observedDir = path.join(repoRoot, 'test-results', 'responsive-observed');
const outPath = path.join(repoRoot, 'tests', 'responsive-known-issues.json');
const WIDTH_ORDER = ['mobile-320', 'tablet-768', 'laptop-1024', 'desktop-1440'];

if (!process.argv.includes('--no-run')) {
  fs.rmSync(observedDir, { recursive: true, force: true });
  const run = spawnSync(
    'npx',
    ['playwright', 'test', '--project=responsive-sweep', '--workers=4', '--reporter=dot'],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      // shell: true lets `npx` resolve to npx.cmd on Windows.
      shell: process.platform === 'win32',
      env: { ...process.env, RESPONSIVE_RECORD: '1' },
    }
  );
  if (run.status !== 0) {
    console.error('The recording run failed; the known-issues file was not changed.');
    process.exit(run.status || 1);
  }
}

if (!fs.existsSync(observedDir)) {
  console.error(
    `No recording found at ${path.relative(repoRoot, observedDir)}.\n` +
      'Run `npm run test:responsive:baseline` without --no-run first.'
  );
  process.exit(1);
}

const observations = fs
  .readdirSync(observedDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(observedDir, f), 'utf8')));

const pageOrder = (key) => {
  const [, course, file] = /^Course (\d+)\/(.*)$/.exec(key);
  return [Number(course), file];
};

const pages = {};
for (const { page, viewport, failed } of observations) {
  if (!failed.length) continue;
  pages[page] = pages[page] || {};
  pages[page][viewport] = [...failed].sort();
}

const sorted = {};
for (const key of Object.keys(pages).sort((a, b) => {
  const [ca, fa] = pageOrder(a);
  const [cb, fb] = pageOrder(b);
  return ca - cb || fa.localeCompare(fb);
})) {
  sorted[key] = {};
  for (const width of WIDTH_ORDER) {
    if (pages[key][width]) sorted[key][width] = pages[key][width];
  }
}

const existing = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : {};
const output = {
  description:
    existing.description ||
    'Layout checks that currently fail on published lessons, by page and viewport. ' +
      'tests/responsive-course-sweep.spec.js expects exactly these to fail: any other ' +
      'failure, or a listed check that now passes, fails the suite. Fix pages and ' +
      'delete entries; do not add entries to make a new regression pass. ' +
      'See docs/RESPONSIVE-TESTING.md.',
  pages: sorted,
};

fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);

const total = Object.values(sorted).reduce(
  (n, byWidth) => n + Object.values(byWidth).reduce((m, ids) => m + ids.length, 0),
  0
);
console.log(
  `Wrote ${path.relative(repoRoot, outPath)}: ${Object.keys(sorted).length} pages, ` +
    `${total} known failing checks from ${observations.length} observations.`
);
