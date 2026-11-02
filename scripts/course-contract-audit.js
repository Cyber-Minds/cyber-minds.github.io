// @ts-check
const fs = require('node:fs');
const path = require('node:path');

// Updated path to point directly to tests/course-contracts.json
const CONTRACT_FILE = path.join(__dirname, '../tests/course-contracts.json');
const contractData = JSON.parse(fs.readFileSync(CONTRACT_FILE, 'utf8'));

let hasError = false;

/**
 * @param {string} courseId
 * @param {string} message
 * @param {string} [filePath]
 * @param {number} [lineNum]
 */
function reportError(courseId, message, filePath = '', lineNum = 0) {
  hasError = true;
  console.error(`[Navigation Drift Error] [${courseId}] ${filePath}:${lineNum} - ${message}`);
}

/**
 * @param {string} content
 * @param {string} targetStr
 * @returns {number}
 */
function findLineNumber(content, targetStr) {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(targetStr)) {
      return i + 1;
    }
  }
  return 1;
}

console.log(`Auditing navigation contracts for ${contractData.courses.length} courses...`);

for (const course of contractData.courses) {
  // Validate that each lesson file actually exists and contains correct sequential links
  for (let i = 0; i < course.lessons.length; i++) {
    const lesson = course.lessons[i];
    const fullPath = path.join(__dirname, '..', lesson.path);

    if (!fs.existsSync(fullPath)) {
      reportError(course.courseId, `Lesson file missing from disk: ${lesson.path}`, lesson.path);
      continue;
    }

    const content = fs.readFileSync(fullPath, 'utf8');

    // Check previous/next navigation consistency if applicable
    const nextLesson = i < course.lessons.length - 1 ? course.lessons[i + 1] : null;

    if (nextLesson && content.includes('next') && !content.includes(nextLesson.path)) {
      const line = findLineNumber(content, 'next');
      reportError(course.courseId, `Next link does not point to expected sequential lesson "${nextLesson.id}"`, lesson.path, line);
    }
  }
}

if (hasError) {
  console.error('\n Course navigation contract audit failed due to drift or broken sequences.');
  process.exit(1);
} else {
  console.log('\n All course navigation contracts passed successfully.');
  process.exit(0);
}