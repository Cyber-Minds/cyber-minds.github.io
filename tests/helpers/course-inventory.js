// @ts-check
/**
 * Inventory of published course lesson pages, grouped by layout shape.
 *
 * Built from the repository at test-collection time, so a new lesson joins the
 * responsive suite without anyone editing a list:
 *
 *   - Published courses come from scripts/content-manifest.json
 *     (`type: "course"`, `status: "published"`).
 *   - Published pages are the lesson files a learner can reach by following
 *     links from the course catalog (HTML/course_Contents.html). A file that
 *     sits in a course folder but nothing links to is not published.
 *   - Each page's layout shape is read from its source, not from a rendered
 *     browser, so the inventory is identical on every machine and every run.
 *
 * Everything is sorted, so the generated test list is stable.
 */
const fs = require('node:fs');
const path = require('node:path');
const posix = path.posix;

const REPO_ROOT = path.join(__dirname, '..', '..');
const CATALOG = 'HTML/course_Contents.html';
const COURSE_ROOT = 'HTML/Courses and Activities';
const MANIFEST = 'scripts/content-manifest.json';

/**
 * Header variants. The shared navbar is injected by Javascript/header.js;
 * a few older pages still carry their own static header, and a page that has
 * the header placeholder without the script renders no navigation at all.
 */
const HEADER_KINDS = ['shared-navbar', 'legacy-header', 'missing-header'];

/**
 * Content variants, checked in this order (first match wins). Each one puts a
 * different kind of element into the lesson column, which is what decides
 * whether that column can overflow at narrow widths.
 */
const CONTENT_RULES = [
  {
    kind: 'quiz',
    test: (src) => /Javascript\/quiz-engine\.js/.test(src),
  },
  {
    kind: 'code-editor',
    test: (src) => /course\d+editor\.bundle\.js/.test(src),
  },
  {
    kind: 'embedded-game',
    test: (src) =>
      iframeSources(src).some((s) => !/youtube(-nocookie)?\.com/.test(s)),
  },
  {
    kind: 'flip-cards',
    test: (src) => /class="box-inner"/.test(src),
  },
  {
    kind: 'video-lesson',
    test: (src) =>
      iframeSources(src).some((s) => /youtube(-nocookie)?\.com/.test(s)),
  },
  {
    // Step-by-step activities (SQL injection walk-through, the Linux
    // "Explore" exercises) are named as activities by their authors; their
    // markup is otherwise an article with wide screenshots.
    kind: 'activity',
    test: (_src, file) => /Activity|Explore/.test(file),
  },
  { kind: 'article', test: () => true },
];

function read(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

function stripComments(src) {
  return src.replace(/<!--[\s\S]*?-->/g, '');
}

function iframeSources(src) {
  return [...src.matchAll(/<iframe\b[^>]*\bsrc="([^"]+)"/gi)].map((m) => m[1]);
}

function decodeHref(href) {
  const entities = { '&amp;': '&', '&quot;': '"', '&#39;': "'" };
  const unescaped = href.replace(/&(amp|quot|#39);/g, (e) => entities[e]);
  try {
    return decodeURI(unescaped);
  } catch {
    return unescaped;
  }
}

function courseNumber(dir) {
  const match = /^Course (\d+)$/.exec(dir);
  return match ? Number(match[1]) : null;
}

/** Course numbers marked published in the content manifest. */
function publishedCourseNumbers() {
  const manifest = JSON.parse(read(MANIFEST));
  return manifest.entries
    .filter((e) => e.type === 'course' && e.status === 'published')
    .map((e) => Number(/^course-(\d+)$/.exec(e.id)?.[1]))
    .filter((n) => Number.isInteger(n))
    .sort((a, b) => a - b);
}

/** Every lesson file under the course folders, as repo-relative paths. */
function lessonFiles() {
  const files = new Set();
  for (const dir of fs.readdirSync(path.join(REPO_ROOT, COURSE_ROOT))) {
    if (courseNumber(dir) === null) continue;
    for (const file of fs.readdirSync(path.join(REPO_ROOT, COURSE_ROOT, dir))) {
      if (file.endsWith('.html')) files.add(posix.join(COURSE_ROOT, dir, file));
    }
  }
  return files;
}

/** Lesson files reachable by following links from the course catalog. */
function reachableLessons(lessons) {
  const seen = new Set();
  const stack = [CATALOG];
  while (stack.length) {
    const current = stack.pop();
    if (seen.has(current)) continue;
    seen.add(current);

    const src = stripComments(read(current));
    for (const [, raw] of src.matchAll(/href="([^"#?]+)/g)) {
      const href = decodeHref(raw);
      if (/^[a-z]+:/i.test(href) || !href.endsWith('.html')) continue;
      const target = posix.normalize(posix.join(posix.dirname(current), href));
      if (lessons.has(target) && !seen.has(target)) stack.push(target);
    }
  }
  seen.delete(CATALOG);
  return seen;
}

function classify(rel) {
  const src = stripComments(read(rel));
  const file = posix.basename(rel);

  let header = 'missing-header';
  if (/Javascript\/header\.js/.test(src)) header = 'shared-navbar';
  else if (/class="header-buttons"/.test(src)) header = 'legacy-header';

  const content = CONTENT_RULES.find((rule) => rule.test(src, file)).kind;
  return { header, content, shape: `${header}/${content}` };
}

let cached;

/**
 * @returns {{
 *   publishedCourses: number[],
 *   pages: Array<{ course: number, file: string, url: string,
 *                  header: string, content: string, shape: string }>,
 *   unpublishedFiles: string[],
 * }}
 */
function loadCourseInventory() {
  if (cached) return cached;

  const published = publishedCourseNumbers();
  const lessons = lessonFiles();
  const reachable = reachableLessons(lessons);

  const pages = [...reachable]
    .map((rel) => {
      const course = courseNumber(posix.basename(posix.dirname(rel)));
      return {
        course,
        file: posix.basename(rel),
        url: `/${rel}`,
        ...classify(rel),
      };
    })
    .filter((p) => published.includes(p.course))
    .sort((a, b) => a.course - b.course || a.file.localeCompare(b.file));

  cached = {
    publishedCourses: published,
    pages,
    unpublishedFiles: [...lessons].filter((f) => !reachable.has(f)).sort(),
  };
  return cached;
}

/** One page per distinct shape: the first in course, then file, order. */
function shapeRepresentatives(pages) {
  const byShape = new Map();
  for (const page of pages) {
    if (!byShape.has(page.shape)) byShape.set(page.shape, page);
  }
  return [...byShape.values()];
}

module.exports = {
  HEADER_KINDS,
  CONTENT_KINDS: CONTENT_RULES.map((r) => r.kind),
  loadCourseInventory,
  shapeRepresentatives,
};
