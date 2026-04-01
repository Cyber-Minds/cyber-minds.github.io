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

    if (typeof window.umami !== 'undefined' && typeof window.umami.track === 'function') {
      window.umami.track(eventName, safePayload);
    }
  } catch (err) {
    // Analytics errors must never break page functionality
    console.warn('Analytics event failed silently:', err);
  }
}

// Page view enrichment — fires on every page load with page category
(function trackPageCategory() {
  try {
    const path = window.location.pathname.toLowerCase();
    let category = 'general';

    // terminal paths classified as ctf to match event schema
    if (path.includes('ctf') || path.includes('challenge') || path.includes('terminal')) {
      category = 'ctf';
    } else if (path.includes('livehelp')) {
      category = 'chatbox';
    } else if (path.includes('mission')) {
      category = 'mission';
    } else if (path.includes('course')) {
      category = 'course';
    } else if (path === '/' || path.includes('index')) {
      category = 'home';
    }

    trackEvent('page_view', { category });
  } catch (e) {
    // silent fail
  }
})();

// CTF and course click tracking
document.addEventListener('DOMContentLoaded', function () {
  // Track CTF nav link clicks
  document.querySelectorAll('a[href*="CTF"], a[href*="ctf"]').forEach(function (link) {
    link.addEventListener('click', function () {
      trackEvent('ctf_entry_click', {
        source: window.location.pathname,
      });
    });
  });

  // Track Get Started clicks — must be registered before the course selector
  // so course_Contents links are not double-counted as course_entry_click
  document.querySelectorAll('a[href*="course_Contents"]').forEach(function (link) {
    link.addEventListener('click', function () {
      trackEvent('get_started_click', {
        source: window.location.pathname,
      });
    });
  });

  // Track course entry clicks — exclude course_Contents to avoid double firing
  document.querySelectorAll(
    'a[href*="course"]:not([href*="course_Contents"]), a[href*="Course"]:not([href*="course_Contents"])'
  ).forEach(function (link) {
    link.addEventListener('click', function () {
      trackEvent('course_entry_click', {
        source: window.location.pathname,
      });
    });
  });
});

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