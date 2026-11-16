'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { auditImageBudgets } = require('./image-budget-audit');

function fixture(config = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'image-budget-'));
  const courseDir = path.join(root, 'HTML', 'Courses and Activities', 'Course 1');
  const imageDir = path.join(root, 'Images');
  fs.mkdirSync(courseDir, { recursive: true });
  fs.mkdirSync(imageDir, { recursive: true });
  fs.writeFileSync(path.join(imageDir, 'a.png'), Buffer.alloc(2));
  fs.writeFileSync(path.join(imageDir, 'b.png'), Buffer.alloc(4));
  fs.writeFileSync(
    path.join(courseDir, 'lesson.html'),
    '<!-- <img src="missing-commented.png"> -->\n' +
      '<img data-src="missing-lazy.png" src=../../../Images/a.png>\n' +
      "<img src='../../../Images/a.png'>\n" +
      '<img src="https://example.com/remote.png">\n' +
      '<img src="data:image/png;base64,abc">\n'
  );
  return {
    root,
    config: {
      budgets: { maxImageBytes: 4, maxPageTotalBytes: 2 },
      exceptions: {},
      ...config,
    },
  };
}

test('counts each local image once per course page and ignores comments and remote sources', () => {
  const { root, config } = fixture();
  try {
    const result = auditImageBudgets(root, config);
    assert.deepEqual(result.errors, []);
    assert.equal(result.pageCount, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('enforces exception ceilings and page totals', () => {
  const { root, config } = fixture({
    budgets: { maxImageBytes: 2, maxPageTotalBytes: 6 },
    exceptions: {
      'Images/b.png': { allowedBytes: 4, reason: 'Existing teaching image.' },
    },
  });
  try {
    fs.appendFileSync(
      path.join(root, 'HTML', 'Courses and Activities', 'Course 1', 'lesson.html'),
      '<img src="../../../Images/b.png">'
    );
    assert.deepEqual(auditImageBudgets(root, config).errors, []);
    fs.writeFileSync(path.join(root, 'Images', 'b.png'), Buffer.alloc(5));
    assert.match(auditImageBudgets(root, config).errors.join('\n'), /5 bytes exceeds its 4-byte image budget/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('reports missing assets and paths that escape the repository', () => {
  const { root, config } = fixture();
  try {
    const page = path.join(root, 'HTML', 'Courses and Activities', 'Course 1', 'lesson.html');
    fs.appendFileSync(page, '<img src="missing.png"><img src="../../../../outside.png">');
    const result = auditImageBudgets(root, config);
    assert.match(result.errors.join('\n'), /image file does not exist: missing\.png/);
    assert.match(result.errors.join('\n'), /image path escapes the repository/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
