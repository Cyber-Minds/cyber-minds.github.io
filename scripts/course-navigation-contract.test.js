'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const checker = path.join(__dirname, 'course-navigation-contract.js');

function makeRepo({ firstPage, firstCourseExit, contract } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberminds-navigation-'));
  const courseDirectory = path.join(
    root,
    'HTML',
    'Courses and Activities',
    'Course 1'
  );
  fs.mkdirSync(courseDirectory, { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'HTML', 'course_Contents.html'),
    '<a class="course-card" href="../HTML/Courses and Activities/Course 1/a.html">Course 1</a>\n'
  );
  const sharedToc = [
    '<div class="leftRectangle-section2">',
    '<a href="a.html">A</a>',
    '<a href="b.html">B</a>',
    '</div>',
    '<div class="Empty-section2"></div>',
  ].join('\n');
  const defaultFirstPage = [
    '<div class="right-side_rectangle-buttons">',
    '<a href="../../course_Contents.html">&lt; Previous</a>',
    '<a href="b.html">Next &gt;</a>',
    '</div>',
    '<div class="left-side_rectangle">',
    sharedToc,
  ].join('\n');
  const secondPage = [
    '<div class="right-side_rectangle-buttons">',
    '<a href="a.html">&lt; Previous</a>',
    '</div>',
    '<div class="left-side_rectangle">',
    sharedToc,
  ].join('\n');
  const addCourseExit = (content, href) =>
    content.replace(
      '</div>\n<div class="left-side_rectangle">',
      `<a class="next_course" href="${href}">Back to Courses</a>\n</div>\n<div class="left-side_rectangle">`
    );
  fs.writeFileSync(
    path.join(courseDirectory, 'a.html'),
    `${addCourseExit(
      firstPage || defaultFirstPage,
      firstCourseExit || '../../course_Contents.html'
    )}\n`
  );
  fs.writeFileSync(
    path.join(courseDirectory, 'b.html'),
    `${addCourseExit(secondPage, '../../course_Contents.html')}\n`
  );
  fs.writeFileSync(
    path.join(root, 'scripts', 'contract.json'),
    JSON.stringify(
      contract || {
        version: 1,
        courses: [{ id: 'course-1', lessonIds: ['a.html', 'b.html'] }],
        exceptions: [],
      },
      null,
      2
    )
  );
  return root;
}

function run(root) {
  return spawnSync(
    process.execPath,
    [
      checker,
      '--root',
      root,
      '--contract',
      path.join(root, 'scripts', 'contract.json'),
    ],
    { encoding: 'utf8' }
  );
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

test('passes when catalog, sidebar, and adjacent controls match the contract', () => {
  const root = makeRepo();
  try {
    const result = run(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /1 courses, 2 lessons/);
  } finally {
    cleanup(root);
  }
});

test('reports an out-of-order lesson with the owning page and line', () => {
  const root = makeRepo({
    firstPage: [
      '<div class="right-side_rectangle-buttons">',
      '<a href="../../course_Contents.html">&lt; Previous</a>',
      '<a href="b.html">Next &gt;</a>',
      '</div>',
      '<div class="left-side_rectangle">',
      '<div class="leftRectangle-section2">',
      '<a href="b.html">B</a>',
      '<a href="a.html">A</a>',
      '</div>',
      '<div class="Empty-section2"></div>',
    ].join('\n'),
  });
  try {
    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /HTML\/Courses and Activities\/Course 1\/a\.html:8: \[course-1 toc\]/
    );
    assert.match(result.stderr, /expected "HTML\/Courses and Activities\/Course 1\/a\.html"/);
  } finally {
    cleanup(root);
  }
});

test('rejects missing and duplicated table-of-contents lessons', () => {
  const cases = [
    ['missing', ['<a href="a.html">A</a>']],
    [
      'duplicated',
      ['<a href="a.html">A</a>', '<a href="a.html">A again</a>'],
    ],
  ];

  for (const [description, lessonLinks] of cases) {
    const root = makeRepo({
      firstPage: [
        '<div class="right-side_rectangle-buttons">',
        '<a href="../../course_Contents.html">&lt; Previous</a>',
        '<a href="b.html">Next &gt;</a>',
        '</div>',
        '<div class="left-side_rectangle">',
        '<div class="leftRectangle-section2">',
        ...lessonLinks,
        '</div>',
        '<div class="Empty-section2"></div>',
      ].join('\n'),
    });
    try {
      const result = run(root);
      assert.equal(result.status, 1, description);
      assert.match(
        result.stderr,
        /HTML\/Courses and Activities\/Course 1\/a\.html:\d+: \[course-1 toc\]/
      );
    } finally {
      cleanup(root);
    }
  }
});

test('reports catalog-card drift with the catalog line', () => {
  const root = makeRepo();
  try {
    const catalog = path.join(root, 'HTML', 'course_Contents.html');
    fs.writeFileSync(
      catalog,
      '<a class="course-card" href="../HTML/Courses and Activities/Course 1/b.html">Course 1</a>\n'
    );
    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /HTML\/course_Contents\.html:1: \[course-1 catalog\]/);
  } finally {
    cleanup(root);
  }
});

test('reports a previous/next mismatch with its source line', () => {
  const root = makeRepo({
    firstPage: [
      '<div class="right-side_rectangle-buttons">',
      '<a href="../../course_Contents.html">&lt; Previous</a>',
      '<a href="a.html">Next &gt;</a>',
      '</div>',
      '<div class="left-side_rectangle">',
      '<div class="leftRectangle-section2"><a href="a.html">A</a><a href="b.html">B</a></div>',
      '<div class="Empty-section2"></div>',
    ].join('\n'),
  });
  try {
    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /HTML\/Courses and Activities\/Course 1\/a\.html:3: \[course-1 next\]/
    );
    assert.match(result.stderr, /found "HTML\/Courses and Activities\/Course 1\/a\.html"/);
  } finally {
    cleanup(root);
  }
});

test('checks course handoff links against the next contracted course', () => {
  const root = makeRepo({ firstCourseExit: 'b.html' });
  try {
    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /HTML\/Courses and Activities\/Course 1\/a\.html:\d+: \[course-1 course-transition\]/
    );
    assert.match(result.stderr, /expected "HTML\/course_Contents\.html"/);
    assert.match(result.stderr, /found "HTML\/Courses and Activities\/Course 1\/b\.html"/);
  } finally {
    cleanup(root);
  }
});

test('accepts only exact owned exceptions with a non-empty reason', () => {
  const root = makeRepo({
    firstPage: [
      '<div class="right-side_rectangle-buttons">',
      '<a href="b.html">&lt; Previous</a>',
      '<a href="b.html">Next &gt;</a>',
      '</div>',
      '<div class="left-side_rectangle">',
      '<div class="leftRectangle-section2"><a href="a.html">A</a><a href="b.html">B</a></div>',
      '<div class="Empty-section2"></div>',
    ].join('\n'),
    contract: {
      version: 1,
      courses: [{ id: 'course-1', lessonIds: ['a.html', 'b.html'] }],
      exceptions: [
        {
          courseId: 'course-1',
          surface: 'previous',
          file: 'HTML/Courses and Activities/Course 1/a.html',
          expected: 'HTML/course_Contents.html',
          actual: 'HTML/Courses and Activities/Course 1/b.html',
          owner: 'course-content-team',
          reason: 'Temporary onboarding navigation retained until the next term.',
        },
      ],
    },
  });
  try {
    const result = run(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /1 owned exception/);
  } finally {
    cleanup(root);
  }
});

test('rejects exceptions without an owner and reason', () => {
  const root = makeRepo({
    contract: {
      version: 1,
      courses: [{ id: 'course-1', lessonIds: ['a.html', 'b.html'] }],
      exceptions: [
        {
          courseId: 'course-1',
          surface: 'previous',
          file: 'HTML/Courses and Activities/Course 1/a.html',
          expected: 'HTML/course_Contents.html',
          actual: 'HTML/Courses and Activities/Course 1/b.html',
        },
      ],
    },
  });
  try {
    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /every exception needs an exact scope, owner, and reason/);
  } finally {
    cleanup(root);
  }
});

test('fails when an owned exception no longer matches', () => {
  const root = makeRepo({
    contract: {
      version: 1,
      courses: [{ id: 'course-1', lessonIds: ['a.html', 'b.html'] }],
      exceptions: [
        {
          courseId: 'course-1',
          surface: 'previous',
          file: 'HTML/Courses and Activities/Course 1/a.html',
          expected: 'HTML/course_Contents.html',
          actual: 'HTML/Courses and Activities/Course 1/b.html',
          owner: 'course-content-team',
          reason: 'One-time navigation exception.',
        },
      ],
    },
  });
  try {
    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /exception is stale/);
  } finally {
    cleanup(root);
  }
});
