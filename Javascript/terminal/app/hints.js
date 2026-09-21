/**
 * @file Progressive, non-spoiling hint disclosure for CTF challenges.
 *
 * Design constraints this module deliberately honours:
 *
 * 1. Hints are advisory only. Nothing here writes to `completedChallenges`,
 *    calls `saveProgress()`, or touches the backend progression endpoints.
 *    Challenge completion stays entirely with the container checker and the
 *    server progression path (see challenges.js: checkChallengeSolution).
 * 2. Reveal state is per-challenge and stored in this browser under
 *    HINTS_STORAGE_KEY. It is never sent to analytics or any third party, so
 *    no terminal output, learner file content, or personal data leaves the page.
 * 3. Refresh behaviour is deterministic: the revealed count is restored from
 *    localStorage on load, and "Reset hints" returns the challenge to zero
 *    revealed. A storage failure degrades to zero revealed rather than throwing.
 */

/**
 * Map of challengeId -> number of hints the learner has revealed.
 * @type {Record<string, number>}
 */
let revealedHints = {};

/**
 * Load revealed-hint counts from localStorage.
 *
 * Values are coerced to non-negative integers so a hand-edited storage entry
 * cannot push the renderer past the end of a challenge's hint array.
 */
function loadRevealedHints() {
  try {
    const raw = localStorage.getItem(HINTS_STORAGE_KEY);
    if (!raw) {
      revealedHints = {};
      return;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      revealedHints = {};
      return;
    }
    revealedHints = {};
    Object.keys(parsed).forEach((key) => {
      const count = Number(parsed[key]);
      if (Number.isFinite(count) && count > 0) {
        revealedHints[key] = Math.floor(count);
      }
    });
  } catch {
    revealedHints = {};
  }
}

/**
 * Persist revealed-hint counts. Storage failures (private mode, quota) are
 * swallowed: losing hint state is never worth breaking the challenge panel.
 */
function saveRevealedHints() {
  try {
    localStorage.setItem(HINTS_STORAGE_KEY, JSON.stringify(revealedHints));
  } catch {
    /* non-fatal: hints simply will not survive a refresh */
  }
}

/**
 * Hints configured for a challenge, always as an array.
 * @param {string} challengeId
 * @returns {string[]}
 */
function getChallengeHints(challengeId) {
  const challenge = challengeCatalog[challengeId];
  if (!challenge || !Array.isArray(challenge.hints)) {
    return [];
  }
  return challenge.hints;
}

/**
 * How many hints are currently revealed for a challenge, clamped to the number
 * that actually exist.
 * @param {string} challengeId
 * @returns {number}
 */
function getRevealedCount(challengeId) {
  const total = getChallengeHints(challengeId).length;
  const stored = revealedHints[challengeId] || 0;
  return Math.min(stored, total);
}

/**
 * Render the hint section for the active challenge.
 *
 * Accessibility contract:
 * - the reveal control is a real <button>, so it is tabbable and responds to
 *   Enter/Space without extra key handling;
 * - `aria-expanded` reflects whether any hint is currently visible, and
 *   `aria-controls` points at the list that grows;
 * - the list is an `aria-live="polite"` region, so a newly revealed hint is
 *   announced without stealing focus from the button the learner just pressed;
 * - when every hint is out, the button is disabled and labelled as such rather
 *   than silently doing nothing.
 */
function renderHints() {
  const section = document.getElementById('challengeHints');
  const list = document.getElementById('hintList');
  const revealBtn = document.getElementById('revealHintBtn');
  const resetBtn = document.getElementById('resetHintsBtn');
  const counter = document.getElementById('hintCounter');
  const policy = document.getElementById('hintPolicy');

  if (!section || !list || !revealBtn || !resetBtn || !counter) {
    return;
  }

  const hints = getChallengeHints(activeChallengeId);
  const total = hints.length;

  if (policy) {
    policy.textContent = HINT_POLICY_TEXT;
  }

  // A challenge with no configured hints hides the whole section rather than
  // showing an empty, focusable control.
  if (total === 0) {
    section.hidden = true;
    return;
  }
  section.hidden = false;

  const revealed = getRevealedCount(activeChallengeId);

  list.innerHTML = '';
  for (let i = 0; i < revealed; i += 1) {
    const li = document.createElement('li');
    li.className = 'hint-item';

    const label = document.createElement('span');
    label.className = 'hint-item-label';
    label.textContent = `Hint ${i + 1}`;

    const body = document.createElement('p');
    body.className = 'hint-item-text';
    body.textContent = hints[i];

    li.appendChild(label);
    li.appendChild(body);
    list.appendChild(li);
  }

  counter.textContent = `${revealed} of ${total} revealed`;
  revealBtn.setAttribute('aria-expanded', revealed > 0 ? 'true' : 'false');

  if (revealed >= total) {
    revealBtn.disabled = true;
    revealBtn.textContent = 'All hints revealed';
  } else {
    revealBtn.disabled = false;
    revealBtn.textContent =
      revealed === 0 ? 'Reveal first hint' : 'Reveal next hint';
  }

  resetBtn.hidden = revealed === 0;
}

/**
 * Reveal the next hint for the active challenge.
 *
 * Intentionally has no side effects on progression: it updates local reveal
 * state, persists it, and re-renders. It never marks a challenge complete.
 */
function revealNextHint() {
  const hints = getChallengeHints(activeChallengeId);
  const revealed = getRevealedCount(activeChallengeId);

  if (revealed >= hints.length) {
    return;
  }

  revealedHints[activeChallengeId] = revealed + 1;
  saveRevealedHints();
  renderHints();

  // Keep focus on the control the learner pressed. When the last hint lands
  // that button becomes disabled, so move focus to the list instead of letting
  // it fall back to <body>.
  const revealBtn = document.getElementById('revealHintBtn');
  const list = document.getElementById('hintList');
  if (revealBtn && revealBtn.disabled && list) {
    list.focus();
  }
}

/**
 * Collapse all hints for the active challenge back to zero revealed.
 */
function resetHints() {
  delete revealedHints[activeChallengeId];
  saveRevealedHints();
  renderHints();

  const revealBtn = document.getElementById('revealHintBtn');
  if (revealBtn) {
    revealBtn.focus();
  }
}

/**
 * Wire up the hint controls once. Safe to call before the challenge loads.
 */
function initHints() {
  loadRevealedHints();

  const revealBtn = document.getElementById('revealHintBtn');
  const resetBtn = document.getElementById('resetHintsBtn');

  if (revealBtn) {
    revealBtn.addEventListener('click', revealNextHint);
  }
  if (resetBtn) {
    resetBtn.addEventListener('click', resetHints);
  }

  renderHints();
}
