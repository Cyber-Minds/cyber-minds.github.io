/**
 * @file Frontend-only learner progress tracking for no-sign-in flows.
 *
 * Stores only safe local identifiers in localStorage. No names, answers,
 * prompts, or personal identifiers are persisted.
 */
(function attachLearnerProgress(global) {
  if (global.CyberMindsProgress) {
    return;
  }

  var STORAGE_KEY = 'cm_learning_progress_v1';
  var CTF_STORAGE_KEY = 'cm_ctf_progress_v1';
  var DEFAULT_RESUME_PATH =
    '/HTML/Courses and Activities/Course 1/Introductioncourse1.html';
  var CTF_CATALOG_PATH = '/HTML/CTF.html';
  var DEFAULT_RESUME = {
    id: 'course-1-introduction',
    title: 'Course 1 - Introduction',
    href: DEFAULT_RESUME_PATH,
    type: 'course-page',
  };
  var RECOMMENDATIONS = {
    'course-3-social-engineering': {
      id: 'course-3-threat-actors-social-engineering',
      title: 'Threat Actors and Social Engineering Quiz',
      href:
        '/HTML/Courses and Activities/Course 3/TAandSEquizcourse3.html',
      type: 'quiz',
    },
    'course-4-automationwithpythoncourse4': {
      id: 'course-4-technical-measures-quiz',
      title: 'Course 4 - Technical Measures Quiz',
      href:
        '/HTML/Courses and Activities/Course 4/TechnicalDefenseQUIZ.html',
      type: 'quiz',
    },
  };

  function getRecommendationKey(lastVisited) {
    if (!lastVisited) {
      return '';
    }

    if (RECOMMENDATIONS[lastVisited.id]) {
      return lastVisited.id;
    }

    if (/SocialEngineeringcourse3\.html$/i.test(lastVisited.href || '')) {
      return 'course-3-social-engineering';
    }

    if (/AutomationwithPythoncourse4\.html$/i.test(lastVisited.href || '')) {
      return 'course-4-automationwithpythoncourse4';
    }

    return '';
  }

  function defaultState() {
    return {
      lastVisited: null,
      visitedPages: {},
      completedQuizzes: {},
    };
  }

  function sanitizeSegment(segment) {
    return String(segment || '')
      .toLowerCase()
      .replace(/\.html?$/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function normalizeHref(href) {
    if (!href) {
      return '/';
    }

    try {
      var parsed = new URL(href, global.location.origin);
      return parsed.pathname + parsed.search;
    } catch (error) {
      return String(href);
    }
  }

  function getSiteBasePath(pathname) {
    var currentPath = pathname || normalizeHref(global.location.pathname);
    var decoded = currentPath;
    try {
      decoded = decodeURIComponent(currentPath);
    } catch (error) {
      decoded = currentPath;
    }

    var htmlIndex = decoded.indexOf('/HTML/');
    if (htmlIndex !== -1) {
      return decoded.slice(0, htmlIndex);
    }

    if (decoded === DEFAULT_RESUME_PATH || decoded === CTF_CATALOG_PATH) {
      return '';
    }

    return '';
  }

  function resolveSitePath(targetPath, pathname) {
    var normalizedTarget = normalizeHref(targetPath);
    var basePath = getSiteBasePath(pathname);
    var baseStrippedTarget = normalizedTarget.indexOf(basePath) === 0
      ? normalizedTarget.slice(basePath.length) || '/'
      : normalizedTarget;

    if (!isSafeInternalHref(baseStrippedTarget)) {
      return normalizedTarget;
    }

    return basePath + baseStrippedTarget;
  }

  function readState() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return defaultState();
      }

      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return defaultState();
      }

      return {
        lastVisited:
          parsed.lastVisited && typeof parsed.lastVisited === 'object'
            ? parsed.lastVisited
            : null,
        visitedPages:
          parsed.visitedPages && typeof parsed.visitedPages === 'object'
            ? parsed.visitedPages
            : {},
        completedQuizzes:
          parsed.completedQuizzes && typeof parsed.completedQuizzes === 'object'
            ? parsed.completedQuizzes
            : {},
      };
    } catch (error) {
      return defaultState();
    }
  }

  function writeState(state) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      // Storage can be disabled or full. Progress UI should still render.
    }
  }

  function readCtfProgress() {
    try {
      var raw = global.localStorage.getItem(CTF_STORAGE_KEY);
      if (!raw) {
        return {};
      }

      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function isSafeInternalHref(href) {
    var normalized = normalizeHref(href);
    var decoded = normalized;
    try {
      decoded = decodeURIComponent(normalized);
    } catch (error) {
      decoded = normalized;
    }

    return (
      decoded.indexOf('/HTML/Courses and Activities/') === 0 ||
      normalized.indexOf('/HTML/terminal/index.html') === 0 ||
      normalized === '/HTML/CTF.html'
    );
  }

  function toSafeHref(href, fallbackHref) {
    return isSafeInternalHref(href)
      ? resolveSitePath(href)
      : resolveSitePath(fallbackHref);
  }

  function derivePageMeta() {
    var path = normalizeHref(global.location.pathname);
    var decodedPath = path;
    try {
      decodedPath = decodeURIComponent(path);
    } catch (error) {
      decodedPath = path;
    }
    var query = new URLSearchParams(global.location.search);
    var challengeId = query.get('challenge');
    var pageTitleElement = global.document.querySelector('.page-title');
    var title = global.document.title || (pageTitleElement && pageTitleElement.textContent) || 'CyberMinds';
    title = String(title).trim();

    if (challengeId) {
      return {
        id: 'ctf-' + sanitizeSegment(challengeId),
        title,
        href: toSafeHref(path + global.location.search, CTF_CATALOG_PATH),
        type: 'ctf-challenge',
      };
    }

    if (decodedPath.indexOf('/HTML/Courses and Activities/') !== -1) {
      var segments = decodedPath.split('/');
      var courseSegment = sanitizeSegment(segments[segments.length - 2]);
      var pageSegment = sanitizeSegment(segments[segments.length - 1]);
      var type = pageSegment.indexOf('quiz') !== -1 ? 'quiz' : 'course-page';

      return {
        id: courseSegment + '-' + pageSegment,
        title,
        href: toSafeHref(path, DEFAULT_RESUME_PATH),
        type,
      };
    }

    if (decodedPath.indexOf('/HTML/CTF.html') !== -1) {
      return {
        id: 'ctf-catalog',
        title,
        href: toSafeHref(path, CTF_CATALOG_PATH),
        type: 'ctf-catalog',
      };
    }

    return null;
  }

  function trackCurrentPage() {
    var meta = derivePageMeta();
    if (!meta || (meta.type !== 'course-page' && meta.type !== 'quiz' && meta.type !== 'ctf-challenge')) {
      return;
    }

    var state = readState();
    var record = {
      id: meta.id,
      title: meta.title,
      href: toSafeHref(meta.href, DEFAULT_RESUME_PATH),
      type: meta.type,
      visitedAt: new Date().toISOString(),
    };

    state.lastVisited = record;
    state.visitedPages[meta.id] = record;
    writeState(state);
  }

  function markQuizComplete(quizId, payload) {
    if (!quizId) {
      return;
    }

    var state = readState();
    state.completedQuizzes[quizId] = {
      score: Number(payload.score) || 0,
      totalQuestions: Number(payload.totalQuestions) || 0,
      completedAt: new Date().toISOString(),
    };
    writeState(state);

    if (typeof global.trackEvent === 'function') {
      global.trackEvent('quiz_complete', {
        quiz: quizId,
        score: Number(payload.score) || 0,
        total_questions: Number(payload.totalQuestions) || 0,
      });
    }
  }

  function initLegacyQuizTracking() {
    var meta = derivePageMeta();
    if (!meta || meta.type !== 'quiz') {
      return;
    }

    var resultElement = global.document.getElementById('result');
    if (!resultElement) {
      return;
    }

    var persistFromResult = function () {
      var text = String(resultElement.textContent || '').trim();
      var match = text.match(/Your score is:\s*(\d+)\s*\/\s*(\d+)/i);
      if (!match) {
        return;
      }

      var quizId = global.document.body.dataset.quizId || meta.id;
      markQuizComplete(quizId, {
        score: Number(match[1]),
        totalQuestions: Number(match[2]),
      });
    };

    var observer = new MutationObserver(persistFromResult);
    observer.observe(resultElement, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    persistFromResult();
  }

  function getRecommendation(state) {
    var lastVisited = state.lastVisited;
    var recommendationKey = getRecommendationKey(lastVisited);

    if (
      recommendationKey &&
      RECOMMENDATIONS[recommendationKey] &&
      !state.completedQuizzes[RECOMMENDATIONS[recommendationKey].id]
    ) {
      return RECOMMENDATIONS[recommendationKey];
    }

    if (lastVisited) {
      return {
        id: lastVisited.id,
        title: 'Resume ' + lastVisited.title,
        href: toSafeHref(lastVisited.href, DEFAULT_RESUME_PATH),
        type: lastVisited.type,
      };
    }

    return DEFAULT_RESUME;
  }

  function getSummary() {
    var state = readState();
    var ctfProgress = readCtfProgress();
    var completedQuizCount = Object.keys(state.completedQuizzes).length;
    var completedCtfCount = Object.keys(ctfProgress).filter(function (key) {
      return !!ctfProgress[key];
    }).length;

    return {
      state,
      lastVisited: state.lastVisited,
      completedQuizCount,
      completedCtfCount,
      recommendation: getRecommendation(state),
    };
  }

  function renderDashboard() {
    var panel = global.document.getElementById('continueLearningPanel');
    if (!panel) {
      return;
    }

    var summary = getSummary();
    var resumeLink = global.document.getElementById('continueLearningLink');
    var lastVisited = global.document.getElementById('continueLearningLastVisited');
    var quizCount = global.document.getElementById('continueLearningQuizCount');
    var ctfCount = global.document.getElementById('continueLearningCtfCount');
    var recommendation = global.document.getElementById('continueLearningRecommendation');
    var recommendationLink = global.document.getElementById('continueLearningRecommendationLink');
    var resetButton = global.document.getElementById('progressResetBtn');

    if (summary.lastVisited) {
      resumeLink.setAttribute('href', toSafeHref(summary.lastVisited.href, DEFAULT_RESUME_PATH));
      resumeLink.textContent = 'Resume where you left off';
      lastVisited.textContent = summary.lastVisited.title;
    } else {
      resumeLink.setAttribute('href', resolveSitePath(DEFAULT_RESUME_PATH));
      resumeLink.textContent = 'Start your first lesson';
      lastVisited.textContent = 'No course progress yet';
    }

    quizCount.textContent = String(summary.completedQuizCount);
    ctfCount.textContent = String(summary.completedCtfCount);
    recommendation.textContent = summary.recommendation.title;
    recommendationLink.setAttribute(
      'href',
      toSafeHref(summary.recommendation.href, DEFAULT_RESUME_PATH)
    );

    if (resetButton && !resetButton.dataset.bound) {
      resetButton.dataset.bound = 'true';
      resetButton.addEventListener('click', function () {
        if (!global.confirm('Reset your local course, quiz, and CTF progress on this device?')) {
          return;
        }

        try {
          global.localStorage.removeItem(STORAGE_KEY);
          global.localStorage.removeItem(CTF_STORAGE_KEY);
        } catch (error) {
          // Ignore storage failures so the UI can still refresh.
        }
        renderDashboard();
      });
    }
  }

  function init() {
    trackCurrentPage();
    initLegacyQuizTracking();
    renderDashboard();
  }

  global.CyberMindsProgress = {
    markQuizComplete,
    getSummary,
    renderDashboard,
    resolveSitePath,
    STORAGE_KEY,
  };

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
