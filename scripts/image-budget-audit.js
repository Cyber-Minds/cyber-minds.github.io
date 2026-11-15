const fs = require('fs');
const path = require('path');

// Configuration and path resolution
const rootDir = path.join(__dirname, '..');
const exceptionsPath = path.join(__dirname, 'image-budget-exceptions.json');
const config = JSON.parse(fs.readFileSync(exceptionsPath, 'utf8'));

const MAX_IMAGE_BYTES = config.budgets.maxImageBytes;
const MAX_PAGE_TOTAL_BYTES = config.budgets.maxPageTotalBytes;
const exceptions = config.exceptions || {};

let hasErrors = false;

// Find HTML files recursively or in HTML/ directory
function getHtmlFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getHtmlFiles(filePath));
    } else if (file.endsWith('.html')) {
      results.push(filePath);
    }
  });
  return results;
}

const htmlDir = path.join(rootDir, 'HTML');
const htmlFiles = fs.existsSync(htmlDir) ? getHtmlFiles(htmlDir) : [];

console.log(`Auditing image budgets across ${htmlFiles.length} HTML files...\n`);

htmlFiles.forEach(htmlFile => {
  const content = fs.readFileSync(htmlFile, 'utf8');
  // Simple regex to find src attributes in img tags
  const imgRegex = /<img[^>]+src="([^">]+)"/g;
  let match;
  let pageTotalBytes = 0;
  const pageImages = [];

  while ((match = imgRegex.exec(content)) !== null) {
    const imgSrc = match[1];
    // Resolve relative path from HTML file to Images folder
    const resolvedImagePath = path.resolve(path.dirname(htmlFile), imgSrc);
    
    if (fs.existsSync(resolvedImagePath)) {
      const stats = fs.statSync(resolvedImagePath);
      const byteSize = stats.size;
      const relativeRepoPath = path.relative(rootDir, resolvedImagePath).replace(/\\/g, '/');

      pageTotalBytes += byteSize;
      pageImages.push({ path: relativeRepoPath, size: byteSize });

      // Check per-image budget
      if (byteSize > MAX_IMAGE_BYTES) {
        if (exceptions[relativeRepoPath]) {
          console.log(`[INFO] Image exceeds standard budget but has an exception: ${relativeRepoPath} (${byteSize} bytes). Reason: ${exceptions[relativeRepoPath].reason}`);
        } else {
          console.error(`[ERROR] Image exceeds budget (${MAX_IMAGE_BYTES} bytes): ${relativeRepoPath} is ${byteSize} bytes (Owning Page: ${path.relative(rootDir, htmlFile)})`);
          hasErrors = true;
        }
      }
    }
  }

  // Check per-page total budget
  if (pageTotalBytes > MAX_PAGE_TOTAL_BYTES) {
    console.error(`[ERROR] Page total image weight exceeds budget (${MAX_PAGE_TOTAL_BYTES} bytes): ${path.relative(rootDir, htmlFile)} has ${pageTotalBytes} bytes total.`);
    hasErrors = true;
  }
});

if (hasErrors) {
  console.error('\n❌ Image budget audit failed: Some assets or pages exceed defined size limits.');
  process.exit(1);
} else {
  console.log('\n✅ Image budget audit passed successfully!');
}