(function () {
  const storageKey = 'cybermindsPathwayState';
  const pathDefinitions = {
    'beginner-internet-safety': {
      title: 'Beginner Internet Safety',
      steps: [1, 2, 4, 8]
    },
    'linux-terminal-basics': {
      title: 'Linux + Terminal Basics',
      steps: [6, 1, 4]
    },
    'networking-foundations': {
      title: 'Networking Foundations',
      steps: [10, 3, 4, 1]
    },
    'cloud-security': {
      title: 'Cloud Security',
      steps: [11, 10, 4, 1]
    }
  };

  let pendingTargetHref = null;

  function ensureStyles() {
    if (document.getElementById('cm-path-continuation-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'cm-path-continuation-styles';
    style.textContent = `
      .completion-modal {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.72);
        display: none;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        z-index: 50;
      }

      .completion-modal.is-visible {
        display: flex;
      }

      .completion-modal-card {
        width: min(32rem, 100%);
        padding: 1.3rem;
        border-radius: 1rem;
        background: linear-gradient(135deg, rgba(9, 21, 34, 0.95), rgba(20, 54, 82, 0.9));
        border: 1px solid rgba(111, 219, 240, 0.24);
        box-shadow: 0 1rem 2.5rem rgba(0, 0, 0, 0.32);
        color: #ffffff;
      }

      .completion-modal-card h3 {
        color: #ffffff;
      }

      .completion-modal-card p {
        color: #ffffff;
      }

      .completion-modal-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.7rem;
        margin-top: 1rem;
      }

      .completion-dismiss {
        border: 0;
        background: transparent;
        color: rgba(255, 255, 255, 0.78);
        cursor: pointer;
        padding: 0.55rem 0;
      }

      .path-guide-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        padding: 0.55rem 0.9rem;
        background: #6fdbf0;
        color: #091522;
        text-decoration: none;
        border: 0;
        cursor: pointer;
        font-weight: 600;
      }

      .path-guide-button.secondary {
        background: transparent;
        color: #ffffff;
        border: 1px solid rgba(255, 255, 255, 0.24);
      }
    `;
    document.head.appendChild(style);
  }

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(storageKey)) || { pathId: null, completed: [] };
    } catch (error) {
      return { pathId: null, completed: [] };
    }
  }

  function getState() {
    return loadState();
  }

  function getCurrentCourseNumber() {
    const path = window.location.pathname || '';
    const match = path.match(/course(?:\s*|%20*)(\d+)/i) || path.match(/course(\d+)/i);
    return match ? Number(match[1]) : null;
  }

  function buildCourseHref(courseNumber) {
    return new URL(`../Course ${courseNumber}/Introductioncourse${courseNumber}.html`, window.location.href).href;
  }

  function getNextPathHref(courseNumber) {
    const state = getState();
    if (!state.pathId) {
      return null;
    }

    const definition = pathDefinitions[state.pathId];
    if (!definition) {
      return null;
    }

    const currentIndex = definition.steps.findIndex((step) => step === courseNumber);
    if (currentIndex === -1 || currentIndex + 1 >= definition.steps.length) {
      return null;
    }

    return buildCourseHref(definition.steps[currentIndex + 1]);
  }

  function getNextNumericHref(courseNumber) {
    if (!courseNumber) {
      return null;
    }

    return buildCourseHref(courseNumber + 1);
  }

  function showModal(nextPathHref, nextNumericHref) {
    ensureStyles();
    let modal = document.getElementById('coursePathContinuationModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'coursePathContinuationModal';
      modal.className = 'completion-modal is-visible';
      modal.innerHTML = `
        <div class="completion-modal-card">
          <p class="path-section-kicker">Continue learning</p>
          <h3>Choose your next step</h3>
          <p>You can stay aligned with your selected path or move to the next numbered course.</p>
          <div class="completion-modal-actions">
            <button id="continuePathAction" class="path-guide-button" type="button">Continue along path</button>
            <button id="nextNumericAction" class="path-guide-button secondary" type="button">Next course in order</button>
            <button id="dismissPathAction" class="completion-dismiss" type="button">Stay here</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    const continueBtn = document.getElementById('continuePathAction');
    const numericBtn = document.getElementById('nextNumericAction');
    const dismissBtn = document.getElementById('dismissPathAction');

    continueBtn.style.display = nextPathHref ? 'inline-flex' : 'none';
    numericBtn.style.display = nextNumericHref ? 'inline-flex' : 'none';

    continueBtn.onclick = () => {
      if (nextPathHref) {
        window.location.assign(nextPathHref);
      }
    };

    numericBtn.onclick = () => {
      if (nextNumericHref) {
        window.location.assign(nextNumericHref);
      }
    };

    dismissBtn.onclick = () => {
      modal.remove();
    };

    modal.classList.add('is-visible');
  }

  function attachHandlers() {
    document.removeEventListener('click', handleNextLinkClick, true);
    document.addEventListener('click', handleNextLinkClick, true);
  }

  function handleNextLinkClick(event) {
    const link = event.target.closest('a');
    if (!link) {
      return;
    }

    const label = (link.textContent || '').trim().toLowerCase();
    const isEndOfCourseLink =
      link.classList.contains('next_course') ||
      label.includes('skip to next course') ||
      label.includes('skip to next') ||
      label === 'next' ||
      label === 'next >';

    if (!isEndOfCourseLink) {
      return;
    }

    const href = link.getAttribute('href');
    if (!href) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    pendingTargetHref = new URL(href, window.location.href).href;
    const currentCourseNumber = getCurrentCourseNumber();
    const nextPathHref = getNextPathHref(currentCourseNumber);
    const nextNumericHref = getNextNumericHref(currentCourseNumber);
    showModal(nextPathHref, nextNumericHref);
  }

  ensureStyles();
  document.addEventListener('DOMContentLoaded', attachHandlers);
  if (document.readyState !== 'loading') {
    attachHandlers();
  }
})();
