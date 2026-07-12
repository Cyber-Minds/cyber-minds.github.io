'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function getHtmlFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') {
        getHtmlFiles(full, files);
      }
    } else if (entry.name.endsWith('.html')) {
      files.push(full);
    }
  }

  return files;
}

let changed = 0;

const IMG_RE = /<img\b([^>]*)>/gi;

for (const file of getHtmlFiles(ROOT)) {
  let content = fs.readFileSync(file, 'utf8');

  const updated = content.replace(IMG_RE, (match, attrs) => {
    // Already has alt
    if (/\balt\s*=/i.test(attrs)) {
      return match;
    }

    changed++;

    return `<img${attrs} alt="">`;
  });

  if (updated !== content) {
    fs.writeFileSync(file, updated, 'utf8');
    console.log(`Updated: ${path.relative(ROOT, file)}`);
  }
}

console.log(`\nAdded alt="" to ${changed} images.`);