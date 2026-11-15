'use strict';

const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.lastIndexOf(name);
  return index === -1 ? null : args[index + 1];
};

const repoRoot = path.resolve(option('--root') || path.join(__dirname, '..'));
const contractPath = path.resolve(
  option('--contract') || path.join(__dirname, 'course-navigation-contract.json')
);
const catalogPath = 'HTML/course_Contents.html';
const courseDirectory = 'HTML/Courses and Activities';
const HTML_TAG_RE = /<([a-z][a-z0-9-]*)\b([^>]*)>/gi;

function relative(file) {
  return path.relative(repoRoot, file).split(path.sep).join('/');
}

function lineNumberAt(content, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (content.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

function stripComments(content) {
  return content.replace(/<!--[\s\S]*?-->/g, (comment) =>
    comment.replace(/[^\n]/g, ' ')
  );
}

function getAttribute(attributes, name) {
  const pattern = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i'
  );
  const match = pattern.exec(attributes);
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? '';
}

function hasClass(attributes, className) {
  return (getAttribute(attributes, 'class') || '')
    .split(/\s+/)
    .includes(className);
}

function findDiv(content, className, fromIndex = 0) {
  HTML_TAG_RE.lastIndex = fromIndex;
  let match;
  while ((match = HTML_TAG_RE.exec(content)) !== null) {
    if (match[1].toLowerCase() === 'div' && hasClass(match[2], className)) {
      return {
        start: match.index,
        contentStart: HTML_TAG_RE.lastIndex,
        line: lineNumberAt(content, match.index),
      };
    }
  }
  return null;
}

function findSection(content, className, endingClass) {
  const start = findDiv(content, className);
  if (!start) return null;
  const end = findDiv(content, endingClass, start.contentStart);
  if (!end) return { ...start, end: content.length };
  return { ...start, end: end.start };
}

function decodeText(value) {
  return value
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#39;|&apos;/gi, "'");
}

function anchorsIn(content, start, end) {
  const section = content.slice(start, end);
  const entries = [];
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  let match;
  while ((match = anchorPattern.exec(section)) !== null) {
    entries.push({
      attributes: match[1],
      href: getAttribute(match[1], 'href'),
      text: decodeText(match[2].replace(/<[^>]*>/g, ''))
        .replace(/\s+/g, ' ')
        .trim(),
      index: start + match.index,
      line: lineNumberAt(content, start + match.index),
    });
  }
  return entries;
}

function normalizeTarget(href, file) {
  if (href === null) return '<missing href>';
  const value = href.trim();
  if (/^(https?:|mailto:|tel:|data:|javascript:)/i.test(value)) {
    return `external:${value.split(/[?#]/, 1)[0]}`;
  }

  const clean = value.split(/[?#]/, 1)[0];
  let decoded;
  try {
    decoded = decodeURIComponent(clean);
  } catch {
    return `invalid:${clean}`;
  }

  const resolved = decoded.startsWith('/')
    ? path.resolve(repoRoot, `.${decoded}`)
    : path.resolve(path.dirname(file), decoded);
  const insideRepo =
    resolved === repoRoot || resolved.startsWith(`${repoRoot}${path.sep}`);
  return insideRepo ? relative(resolved) : `outside-repo:${decoded}`;
}

function loadContract() {
  if (!fs.existsSync(contractPath)) {
    throw new Error(`Contract file does not exist: ${contractPath}`);
  }

  const source = fs.readFileSync(contractPath, 'utf8');
  let contract;
  try {
    contract = JSON.parse(source);
  } catch (error) {
    throw new Error(`Invalid JSON in ${relative(contractPath)}: ${error.message}`);
  }

  if (contract.version !== 1) {
    throw new Error(`${relative(contractPath)}: unsupported contract version`);
  }
  if (!Array.isArray(contract.courses) || contract.courses.length === 0) {
    throw new Error(`${relative(contractPath)}: courses must be a non-empty array`);
  }
  if (!Array.isArray(contract.exceptions)) {
    throw new Error(`${relative(contractPath)}: exceptions must be an array`);
  }

  const courseIds = new Set();
  const lessonIds = new Set();
  for (const course of contract.courses) {
    if (
      !course ||
      typeof course.id !== 'string' ||
      !/^course-\d+$/.test(course.id) ||
      courseIds.has(course.id)
    ) {
      throw new Error(`${relative(contractPath)}: invalid or duplicate course id`);
    }
    courseIds.add(course.id);

    if (!Array.isArray(course.lessonIds) || course.lessonIds.length === 0) {
      throw new Error(`${relative(contractPath)}: ${course.id} needs lessonIds`);
    }
    for (const lessonId of course.lessonIds) {
      if (
        typeof lessonId !== 'string' ||
        !lessonId.endsWith('.html') ||
        path.basename(lessonId) !== lessonId ||
        lessonIds.has(`${course.id}/${lessonId}`)
      ) {
        throw new Error(
          `${relative(contractPath)}: invalid or duplicate lesson id in ${course.id}`
        );
      }
      lessonIds.add(`${course.id}/${lessonId}`);
    }
  }

  const exceptionKeys = new Set();
  for (const exception of contract.exceptions) {
    const isExceptionValue = (value) =>
      value === null ||
      typeof value === 'string' ||
      (Array.isArray(value) &&
        value.every((item) => typeof item === 'string'));
    if (
      !exception ||
      !courseIds.has(exception.courseId) ||
      ![
        'catalog',
        'course-files',
        'toc',
        'previous',
        'next',
        'course-transition',
      ].includes(exception.surface) ||
      typeof exception.file !== 'string' ||
      !exception.file.trim() ||
      path.isAbsolute(exception.file) ||
      exception.file.split(/[\\/]/).includes('..') ||
      typeof exception.owner !== 'string' ||
      !exception.owner.trim() ||
      typeof exception.reason !== 'string' ||
      !exception.reason.trim() ||
      !isExceptionValue(exception.expected) ||
      !isExceptionValue(exception.actual)
    ) {
      throw new Error(
        `${relative(contractPath)}: every exception needs an exact scope, owner, and reason`
      );
    }
    const key = JSON.stringify([
      exception.courseId,
      exception.surface,
      exception.file,
      exception.expected,
      exception.actual,
    ]);
    if (exceptionKeys.has(key)) {
      throw new Error(`${relative(contractPath)}: duplicate exception`);
    }
    exceptionKeys.add(key);
  }

  return { contract, source };
}

function relativeLessonPath(courseId, lessonId) {
  const courseNumber = courseId.slice('course-'.length);
  return `${courseDirectory}/Course ${courseNumber}/${lessonId}`;
}

function compareArrays(expected, actual) {
  const maxLength = Math.max(expected.length, actual.length);
  for (let index = 0; index < maxLength; index += 1) {
    if (expected[index] !== actual[index]) return index;
  }
  return -1;
}

function contractLine(source, value) {
  const index = source.indexOf(JSON.stringify(value));
  return index === -1 ? 1 : lineNumberAt(source, index);
}

function getCourseFiles(course) {
  const courseNumber = course.id.slice('course-'.length);
  const directory = path.join(
    repoRoot,
    courseDirectory,
    `Course ${courseNumber}`
  );
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => entry.name)
    .sort();
}

function makeArrayFinding({
  courseId,
  surface,
  file,
  source,
  expected,
  actual,
  entries,
  fallbackLine,
}) {
  const index = compareArrays(expected, actual);
  if (index === -1) return null;
  const line =
    entries[index]?.line ||
    entries.at(-1)?.line ||
    fallbackLine ||
    contractLine(source, expected[index]);
  return { courseId, surface, file, line, expected, actual };
}

function findFinding(contract, source, finding, consumedExceptions) {
  const key = JSON.stringify([
    finding.courseId,
    finding.surface,
    finding.file,
    finding.expected,
    finding.actual,
  ]);
  const exceptionIndex = contract.exceptions.findIndex(
    (exception) =>
      JSON.stringify([
        exception.courseId,
        exception.surface,
        exception.file,
        exception.expected,
        exception.actual,
      ]) === key
  );
  if (exceptionIndex !== -1) {
    consumedExceptions.add(exceptionIndex);
    return null;
  }
  return finding;
}

function pageContent(file) {
  return stripComments(fs.readFileSync(file, 'utf8'));
}

function coursePagePath(courseId, lessonId) {
  return path.join(repoRoot, relativeLessonPath(courseId, lessonId));
}

function collectMismatches(contract, contractSource) {
  const consumedExceptions = new Set();
  const allLessons = contract.courses.flatMap((course) =>
    course.lessonIds.map((lessonId) => ({
      courseId: course.id,
      lessonId,
      file: relativeLessonPath(course.id, lessonId),
    }))
  );
  const findings = [];
  const catalogFile = path.join(repoRoot, catalogPath);

  if (!fs.existsSync(catalogFile)) {
    findings.push({
      courseId: contract.courses[0].id,
      surface: 'catalog',
      file: catalogPath,
      line: 1,
      expected: contract.courses.map((course) =>
        relativeLessonPath(course.id, course.lessonIds[0])
      ),
      actual: [],
    });
  } else {
    const catalog = pageContent(catalogFile);
    const cards = anchorsIn(catalog, 0, catalog.length).filter((entry) =>
      hasClass(entry.attributes, 'course-card')
    );
    const expected = contract.courses.map((course) =>
      relativeLessonPath(course.id, course.lessonIds[0])
    );
    const actual = cards.map((entry) =>
      normalizeTarget(entry.href, catalogFile)
    );
    const finding = makeArrayFinding({
      courseId: contract.courses[0].id,
      surface: 'catalog',
      file: catalogPath,
      source: contractSource,
      expected,
      actual,
      entries: cards,
    });
    if (finding) {
      const unexcepted = findFinding(
        contract,
        contractSource,
        finding,
        consumedExceptions
      );
      if (unexcepted) findings.push(unexcepted);
    }
  }

  let lessonIndex = 0;
  for (const [coursePosition, course] of contract.courses.entries()) {
    const courseNumber = course.id.slice('course-'.length);
    const directory = path.join(
      repoRoot,
      courseDirectory,
      `Course ${courseNumber}`
    );
    const expectedFiles = [...course.lessonIds].sort();
    const actualFiles = getCourseFiles(course);
    const courseFile = `${courseDirectory}/Course ${courseNumber}`;
    const fileFinding = makeArrayFinding({
      courseId: course.id,
      surface: 'course-files',
      file: courseFile,
      source: contractSource,
      expected: expectedFiles,
      actual: actualFiles,
      entries: actualFiles.map((name) => ({
        line: fs.existsSync(path.join(directory, name))
          ? lineNumberAt(fs.readFileSync(path.join(directory, name), 'utf8'), 0)
          : 1,
      })),
      fallbackLine: 1,
    });
    if (fileFinding) {
      const unexpectedFile = actualFiles.find(
        (name) => !expectedFiles.includes(name)
      );
      const missingFile = course.lessonIds.find(
        (name) => !actualFiles.includes(name)
      );
      fileFinding.file = unexpectedFile
        ? `${courseFile}/${unexpectedFile}`
        : relative(contractPath);
      fileFinding.line = unexpectedFile
        ? 1
        : contractLine(contractSource, missingFile);
      const unexcepted = findFinding(
        contract,
        contractSource,
        fileFinding,
        consumedExceptions
      );
      if (unexcepted) findings.push(unexcepted);
    }

    for (const lessonId of course.lessonIds) {
      const current = allLessons[lessonIndex];
      const file = coursePagePath(course.id, lessonId);
      if (!fs.existsSync(file)) {
        const missingFinding = {
          courseId: course.id,
          surface: 'course-files',
          file: relative(contractPath),
          line: contractLine(contractSource, lessonId),
          expected: current.file,
          actual: '<missing lesson file>',
        };
        const unexcepted = findFinding(
          contract,
          contractSource,
          missingFinding,
          consumedExceptions
        );
        if (unexcepted) findings.push(unexcepted);
        lessonIndex += 1;
        continue;
      }

      const html = pageContent(file);
      const tocSection = findSection(
        html,
        'leftRectangle-section2',
        'Empty-section2'
      );
      const tocEntries = tocSection
        ? anchorsIn(html, tocSection.contentStart, tocSection.end)
        : [];
      const expectedToc = course.lessonIds.map((id) =>
        relativeLessonPath(course.id, id)
      );
      const actualToc = tocEntries.map((entry) =>
        normalizeTarget(entry.href, file)
      );
      const tocFinding = makeArrayFinding({
        courseId: course.id,
        surface: 'toc',
        file: relative(file),
        source: contractSource,
        expected: expectedToc,
        actual: actualToc,
        entries: tocEntries,
        fallbackLine: tocSection?.line || 1,
      });
      if (tocFinding) {
        const unexcepted = findFinding(
          contract,
          contractSource,
          tocFinding,
          consumedExceptions
        );
        if (unexcepted) findings.push(unexcepted);
      }

      const controls = findSection(
        html,
        'right-side_rectangle-buttons',
        'left-side_rectangle'
      );
      const controlEntries = controls
        ? anchorsIn(html, controls.contentStart, controls.end)
        : [];
      const navigationEntries = controlEntries.filter(
        (entry) => !hasClass(entry.attributes, 'next_course')
      );
      const courseTransition = controlEntries.find((entry) =>
        hasClass(entry.attributes, 'next_course')
      );
      const previous = navigationEntries.find((entry) =>
        /^<\s*Previous\b/i.test(entry.text)
      );
      const next = navigationEntries.find((entry) =>
        /^(?:<\s*)?Next\b/i.test(entry.text)
      );
      const previousIndex = lessonIndex - 1;
      const nextIndex = lessonIndex + 1;
      const expectedPrevious =
        previousIndex >= 0
          ? allLessons[previousIndex].file
          : catalogPath;
      const expectedNext =
        nextIndex < allLessons.length ? allLessons[nextIndex].file : null;
      const nextCourse = contract.courses[coursePosition + 1];
      const expectedCourseTransition = nextCourse
        ? relativeLessonPath(nextCourse.id, nextCourse.lessonIds[0])
        : catalogPath;
      const previousActual = previous
        ? normalizeTarget(previous.href, file)
        : null;
      const nextActual = next ? normalizeTarget(next.href, file) : null;
      const transitionActual = courseTransition
        ? normalizeTarget(courseTransition.href, file)
        : null;

      for (const [surface, expected, actual, entry] of [
        ['previous', expectedPrevious, previousActual, previous],
        ['next', expectedNext, nextActual, next],
        [
          'course-transition',
          expectedCourseTransition,
          transitionActual,
          courseTransition,
        ],
      ]) {
        if (expected === actual) continue;
        const navigationFinding = {
          courseId: course.id,
          surface,
          file: relative(file),
          line: entry?.line || controls?.line || 1,
          expected,
          actual,
        };
        const unexcepted = findFinding(
          contract,
          contractSource,
          navigationFinding,
          consumedExceptions
        );
        if (unexcepted) findings.push(unexcepted);
      }

      lessonIndex += 1;
    }
  }

  contract.exceptions.forEach((exception, index) => {
    if (consumedExceptions.has(index)) return;
    findings.push({
      courseId: exception.courseId,
      surface: 'exception',
      file: relative(contractPath),
      line: contractLine(contractSource, exception.file),
      expected: 'an exact matching navigation mismatch',
      actual: `${exception.file} exception is stale`,
    });
  });

  return { findings, lessonCount: allLessons.length };
}

function describeFinding(finding) {
  if (Array.isArray(finding.expected)) {
    const index = compareArrays(finding.expected, finding.actual);
    const expected = finding.expected[index] ?? '<no lesson>';
    const actual = finding.actual[index] ?? '<no lesson>';
    return `${finding.surface} differs at item ${index + 1}: expected "${expected}", found "${actual}"`;
  }
  return `${finding.surface} expected "${finding.expected ?? '<no link>'}", found "${finding.actual ?? '<no link>'}"`;
}

function run() {
  const { contract, source } = loadContract();
  const { findings, lessonCount } = collectMismatches(contract, source);
  if (findings.length) {
    const first = findings[0];
    console.error(
      `Course navigation contract v1 failed:\n${first.file}:${first.line}: [${first.courseId} ${first.surface}] ${describeFinding(first)}`
    );
    process.exitCode = 1;
    return;
  }

  const exceptionNote = contract.exceptions.length
    ? ` (${contract.exceptions.length} owned exception${contract.exceptions.length === 1 ? '' : 's'})`
    : '';
  console.log(
    `Course navigation contract v1 passed: ${contract.courses.length} courses, ${lessonCount} lessons${exceptionNote}`
  );
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
