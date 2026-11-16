'use strict';

const fs = require('node:fs');
const path = require('node:path');

const COURSE_PAGES = path.join('HTML', 'Courses and Activities');
const IMG_RE = /<img\b([^<>]*?)\s*\/?>/gi;
const SRC_RE = /(?:^|\s)src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/i;
// shortcut: course pages currently use `src`; add `srcset` candidates when the corpus adopts responsive images.

function listHtmlFiles(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) listHtmlFiles(fullPath, files);
    else if (entry.isFile() && entry.name.endsWith('.html')) files.push(fullPath);
  }
  return files;
}

function resolveImagePath(root, page, source) {
  const value = source.trim().split(/[?#]/, 1)[0];
  if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value) || value.includes('{{')) {
    return null;
  }

  let decoded;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return { error: `invalid encoded image path: ${value}` };
  }

  const rootPath = path.resolve(root);
  const localPath = decoded.startsWith('/')
    ? path.resolve(rootPath, `.${decoded}`)
    : path.resolve(path.dirname(page), decoded);
  if (!localPath.startsWith(`${rootPath}${path.sep}`)) {
    return { error: `image path escapes the repository: ${value}` };
  }

  if (!fs.existsSync(localPath)) {
    return { error: `image file does not exist: ${value}` };
  }

  const realRoot = fs.realpathSync(rootPath);
  const realPath = fs.realpathSync(localPath);
  if (!realPath.startsWith(`${realRoot}${path.sep}`)) {
    return { error: `image symlink escapes the repository: ${value}` };
  }
  if (!fs.statSync(realPath).isFile()) {
    return { error: `image path is not a file: ${value}` };
  }
  return realPath;
}

function imageSources(content) {
  const activeContent = content.replace(/<!--[^]*?-->/g, '');
  const sources = [];
  IMG_RE.lastIndex = 0;
  let match;
  while ((match = IMG_RE.exec(activeContent)) !== null) {
    const src = SRC_RE.exec(match[1]);
    if (src) sources.push(src[1] ?? src[2] ?? src[3]);
  }
  return sources;
}

function auditImageBudgets(root, config) {
  const errors = [];
  const notices = [];
  const realRoot = fs.realpathSync(path.resolve(root));
  const courseDir = path.join(realRoot, COURSE_PAGES);
  if (!fs.existsSync(courseDir)) {
    return { errors: [`Course page directory does not exist: ${COURSE_PAGES}`], notices };
  }

  const pages = listHtmlFiles(courseDir);
  for (const page of pages) {
    const pageAssets = new Set();
    for (const source of imageSources(fs.readFileSync(page, 'utf8'))) {
      const result = resolveImagePath(realRoot, page, source);
      if (result === null) continue;
      if (typeof result === 'object') {
        errors.push(`${path.relative(root, page)}: ${result.error}`);
        continue;
      }
      pageAssets.add(result);
    }

    let pageBytes = 0;
    for (const asset of pageAssets) {
      const relativeAsset = path.relative(realRoot, asset).split(path.sep).join('/');
      const byteSize = fs.statSync(asset).size;
      const exception = config.exceptions[relativeAsset];
      const byteLimit = exception?.allowedBytes ?? config.budgets.maxImageBytes;
      pageBytes += byteSize;
      if (byteSize > byteLimit) {
        errors.push(
          `${relativeAsset}: ${byteSize} bytes exceeds its ${byteLimit}-byte image budget (${path.relative(realRoot, page)})`
        );
      } else if (exception && byteSize > config.budgets.maxImageBytes) {
        notices.push(
          `${relativeAsset}: ${byteSize}/${byteLimit} bytes; ${exception.reason}`
        );
      }
    }

    if (pageBytes > config.budgets.maxPageTotalBytes) {
      errors.push(
        `${path.relative(realRoot, page)}: unique image assets total ${pageBytes} bytes, over the ${config.budgets.maxPageTotalBytes}-byte page budget`
      );
    }
  }

  return { errors, notices, pageCount: pages.length };
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const config = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'image-budget-exceptions.json'), 'utf8')
  );
  const result = auditImageBudgets(root, config);
  console.log(`Auditing image budgets across ${result.pageCount || 0} course pages...`);
  result.notices.forEach((notice) => console.log(`[EXCEPTION] ${notice}`));
  if (result.errors.length) {
    console.error(`Image budget audit failed (${result.errors.length} issue(s)):\n${result.errors.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log('Image budget audit passed.');
  }
}

module.exports = { auditImageBudgets };
