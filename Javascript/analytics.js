/**
 * @file analytics.js
 * CyberMinds custom event tracking via Umami.
 *
 * Privacy guarantees:
 * - No PII fields are sent in any event payload
 * - Query parameters are stripped (data-exclude-search on script tag)
 * - DNT (Do Not Track) is respected — Umami honors DNT by default
 * - Script load failures do not affect page rendering (onerror on script tag)
 * - All payloads are validated before sending
 */

/**
 * Safe wrapper around umami.track().
 * Validates payload and silently fails if Umami is unavailable.
 * Ensures no PII or token fields are ever sent.
 *
 * @param {string} eventName
 * @param {Object} payload
 */
function trackEvent(eventName, payload = {}) {
  try {
    // Validate event name
    if (typeof eventName !== 'string' || eventName.trim() === '') {
      return;
    }

    // Strip any fields that could contain PII or tokens
    const BLOCKED_KEYS = ['token', 'sessionid', 'session_id', 'userid', 'user_id',
                          'email', 'password', 'key', 'secret', 'auth'];
    const safePayload = {};
    for (const [k, v] of Object.entries(payload)) {
      if (BLOCKED_KEYS.some(blocked => k.toLowerCase().includes(blocked))) {
        continue;
      }
      // Only allow string, number, boolean values — no objects or arrays
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        safePayload[k] = v;
      }
    }

    // send only when Umami is loaded
    if (typeof window.umami !== 'undefined' && typeof window.umami.track === 'function') {
      window.umami.track(eventName, safePayload);
    }
  } catch (err) {
    // Analytics errors must never break page functionality
    console.warn('Analytics event failed silently:', err);
  }
}

// ─────────────────────────────────────────────
// Page view enrichment
// Fires on every page load with page category
// ─────────────────────────────────────────────
(function trackPageCategory() {
  try {
    const path = window.location.pathname.toLowerCase();
    let category = 'general';
    if (path.includes('ctf') || path.includes('challenge')) category = 'ctf';
    else if (path.includes('course')) category = 'course';
    else if (path.includes('livehelp')) category = 'chatbox';
    else if (path.includes('mission')) category = 'mission';
    else if (path === '/' || path.includes('index')) category = 'home';

    trackEvent('page_view', { category });
  } catch (e) {
    // silent fail
  }
})();

// ─────────────────────────────────────────────
// CTF entry click tracking
// Tracks when users click into the CTF section
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  // Track CTF nav link clicks
  document.querySelectorAll('a[href*="CTF"], a[href*="ctf"]').forEach(function (link) {
    link.addEventListener('click', function () {
      trackEvent('ctf_entry_click', {
        source: window.location.pathname,
      });
    });
  });

  // Track course entry clicks
  document.querySelectorAll('a[href*="course"], a[href*="Course"]').forEach(function (link) {
    link.addEventListener('click', function () {
      trackEvent('course_entry_click', {
        source: window.location.pathname,
      });
    });
  });

  // Track Get Started button clicks
  document.querySelectorAll('a[href*="course_Contents"]').forEach(function (link) {
    link.addEventListener('click', function () {
      trackEvent('get_started_click', {
        source: window.location.pathname,
      });
    });
  });
});

// ─────────────────────────────────────────────
// Challenge progression milestone tracking
// Called by challenges.js when a challenge is completed
// ─────────────────────────────────────────────

/**
 * Track challenge completion milestone.
 * Called from handleCheckOutput in challenges.js after saveProgress().
 * @param {string} challengeId - the completed challenge ID (no PII)
 */
function trackChallengeComplete(challengeId) {
  trackEvent('challenge_complete', {
    challenge: challengeId,
  });
}

/**
 * Track challenge start — called when a challenge loads.
 * @param {string} challengeId
 */
function trackChallengeStart(challengeId) {
  trackEvent('challenge_start', {
    challenge: challengeId,
  });
}