'use strict';

/**
 * Networked half of the terminal supply-chain check.
 *
 * scripts/check-terminal-assets.js is deterministic and offline: it proves the
 * page matches the reviewed inventory. It cannot prove the recorded hashes
 * still describe what the CDN actually serves. This does that, by fetching
 * each integrity-pinned asset and recomputing its digest.
 *
 * Kept out of the blocking CI path on purpose -- a CDN hiccup must not fail an
 * unrelated pull request. Run it when updating a dependency (see
 * docs/TERMINAL-ASSETS.md) and on the weekly schedule.
 *
 * A mismatch means one of two things, and they are not equally urgent:
 *   - the inventory hash was recorded wrong (the page is already broken), or
 *   - immutable CDN content changed under a pinned version, which is a
 *     supply-chain event and should be escalated, not "fixed" by rehashing.
 *
 * Usage:
 *   node scripts/verify-asset-integrity.js
 *   node scripts/verify-asset-integrity.js --json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const inventoryPath = path.join(__dirname, 'terminal-assets.json');
const TIMEOUT_MS = 30_000;

function parseIntegrity(value) {
  const match = /^sha(256|384|512)-(.+)$/.exec(value);
  if (!match) return null;
  return { algorithm: `sha${match[1]}`, digest: match[2] };
}

async function fetchBuffer(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    if (!response.url.startsWith('https://')) {
      throw new Error(`redirected off https to ${response.url}`);
    }
    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
  const pinned = (inventory.assets || []).filter((a) => a.sri === 'required');
  const results = [];
  let failures = 0;

  for (const asset of pinned) {
    const expected = parseIntegrity(asset.integrity);
    if (!expected) {
      results.push({ id: asset.id, status: 'invalid-inventory-hash' });
      failures += 1;
      continue;
    }

    try {
      const body = await fetchBuffer(asset.url);
      const actual = crypto
        .createHash(expected.algorithm)
        .update(body)
        .digest('base64');

      if (actual === expected.digest) {
        results.push({ id: asset.id, status: 'ok', bytes: body.length });
      } else {
        results.push({
          id: asset.id,
          status: 'mismatch',
          url: asset.url,
          expected: asset.integrity,
          actual: `${expected.algorithm}-${actual}`,
        });
        failures += 1;
      }
    } catch (error) {
      results.push({ id: asset.id, status: 'fetch-failed', error: error.message });
      failures += 1;
    }
  }

  if (asJson) {
    console.log(JSON.stringify({ checked: pinned.length, failures, results }, null, 2));
  } else {
    for (const result of results) {
      if (result.status === 'ok') {
        console.log(`  ok        ${result.id} (${result.bytes} bytes)`);
      } else if (result.status === 'mismatch') {
        console.error(`  MISMATCH  ${result.id}`);
        console.error(`            url:      ${result.url}`);
        console.error(`            expected: ${result.expected}`);
        console.error(`            actual:   ${result.actual}`);
      } else {
        console.error(`  ${result.status.toUpperCase()}  ${result.id}: ${result.error || ''}`);
      }
    }
  }

  if (failures) {
    console.error(
      `\n${failures} of ${pinned.length} pinned asset(s) failed verification.`
      + '\nA hash mismatch on an immutable versioned URL is a supply-chain event.'
      + '\nDo not rehash to make it pass -- see docs/TERMINAL-ASSETS.md.'
    );
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${pinned.length} pinned asset(s) match the reviewed hashes.`);
  }
}

main().catch((error) => {
  console.error(`verify-asset-integrity failed: ${error.message}`);
  process.exitCode = 1;
});
