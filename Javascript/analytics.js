/**
 * @file analytics.js
 * CyberMinds custom event tracking via Umami.
 *
 * The Umami script is loaded dynamically from here — the website ID lives
 * in one place rather than being stamped into every HTML file.
 *
 * Privacy guarantees:
 * - No PII fields are sent in any event payload
 * - Query parameters are stripped (data-exclude-search on script tag)
 * - DNT (Do Not Track) is respected — Umami honors DNT by default
 * - Script load failures do not affect page rendering (onerror on script tag)
 * - All payloads are validated before sending
 */

// Umami config — single source of truth; update here to change all pages
var UMAMI_WEBSITE_ID = '4f3f4eed-fd85-4f62-9469-d5440c9bf000';
var UMAMI_DOMAINS = 'cyber-minds.github.io';
var EVENT_QUEUE_KEY = '__cybermindsAnalyticsQueue';
var MAX_QUEUED_EVENTS = 200;
var eventQueue = window[EVENT_QUEUE_KEY];
if (!Array.isArray(eventQueue)) {
  eventQueue = [];
  window[EVENT_QUEUE_KEY] = eventQueue;
}

var BLOCKED_KEYS = ['token', 'sessionid', 'session_id', 'userid', 'user_id', 'email', 'password', 'key', 'secret', 'auth'];

function isBlockedKey(k) {
  var lower = k.toLowerCase();
  for (var i = 0; i < BLOCKED_KEYS.length; i++) {
    if (lower.indexOf(BLOCKED_KEYS[i]) !== -1) return true;
  }
  return false;
}

/**
 * Safe wrapper around umami.track().
 * Validates payload and silently fails if Umami is unavailable.
 * Ensures no PII or token fields are ever sent.
 *
 * @param {string} eventName
 * @param {Object} payload
 */
function trackEvent(eventName, payload) {
  payload = payload || {};
  try {
    if (typeof eventName !== 'string' || eventName.trim() === '') {
      return;
    }

    // Strip any fields that could contain PII or tokens
    var safePayload = {};
    for (var k in payload) {
      if (!Object.prototype.hasOwnProperty.call(payload, k)) continue;
      var v = payload[k];
      if (isBlockedKey(k)) continue;
      // Only allow string, number, boolean values — no objects or arrays
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        safePayload[k] = v;
      }
    }

    if (typeof window.umami !== 'undefined' && typeof window.umami.track === 'function') {
      window.umami.track(eventName, safePayload);
    } else {
      if (eventQueue.length >= MAX_QUEUED_EVENTS) {
        eventQueue.shift();
      }
      eventQueue.push({ eventName, payload: safePayload });
    }
  } catch (err) {
    // Analytics errors must never break page functionality
    console.warn('Analytics event failed silently:', err);
  }
}

/**
 * Flush queued events once Umami is ready.
 * Queue exists to prevent losing early events on first page load.
 */
function flushQueuedEvents() {
  if (!(typeof window.umami !== 'undefined' && typeof window.umami.track === 'function')) {
    return;
  }

  while (eventQueue.length > 0) {
    var queued = eventQueue.shift();
    if (!queued || typeof queued.eventName !== 'string') {
      continue;
    }
    trackEvent(queued.eventName, queued.payload || {});
  }
}

/**
 * Fire page_view with a category derived from the current path.
 * Called from the Umami script's onload so window.umami is guaranteed ready.
 */
function trackPageView() {
  try {
    var path = window.location.pathname.toLowerCase();
    var category = 'general';

    // terminal paths classified as ctf to match event schema
    if (path.indexOf('ctf') !== -1 || path.indexOf('challenge') !== -1 || path.indexOf('terminal') !== -1) {
      category = 'ctf';
    } else if (path.indexOf('livehelp') !== -1) {
      category = 'chatbox';
    } else if (path.indexOf('mission') !== -1) {
      category = 'mission';
    } else if (path.indexOf('course') !== -1) {
      category = 'course';
    } else if (path === '/' || path.indexOf('index') !== -1) {
      category = 'home';
    }

    trackEvent('page_view', { category });
  } catch (e) {
    // silent fail
  }
}

// Load Umami dynamically — fires trackPageView once the script is ready
(function loadUmami() {
  var s = document.createElement('script');
  s.defer = true;
  s.src = 'https://cloud.umami.is/script.js';
  s.setAttribute('data-website-id', UMAMI_WEBSITE_ID);
  s.setAttribute('data-exclude-search', 'true');
  s.setAttribute('data-domains', UMAMI_DOMAINS);
  s.onerror = function () {
    console.warn('Analytics failed to load - page rendering unaffected');
  };
  s.onload = function () {
    trackPageView();
    flushQueuedEvents();
  };
  document.head.appendChild(s);
})();

// Click tracking — DOMContentLoaded is fine here (just registering listeners,
// no umami call happens until the user actually clicks by which point it's loaded)
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
