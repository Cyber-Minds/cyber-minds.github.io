/**
 * @file Challenge navigation and validation flow.
 */
function queueAnalyticsEvent(eventName, payload) {
  var queueKey = '__cybermindsAnalyticsQueue';
  var queue = window[queueKey];
  if (!Array.isArray(queue)) {
    queue = [];
    window[queueKey] = queue;
  }
  queue.push({ eventName, payload: payload || {} });
}

function loadChallenge(challengeId, updateUrl = true) {

  let resolvedChallengeId = challengeId;

  if (
    completedChallenges[resolvedChallengeId] &&
    resolvedChallengeId !== activeChallengeId
  ) {
    const nextOpen = getFirstIncompleteChallengeId();
    if (nextOpen && nextOpen !== resolvedChallengeId) {
      showToast('Completed challenges are locked. Continue forward.');
      resolvedChallengeId = nextOpen;
    }
  }

  const challenge = challengeCatalog[resolvedChallengeId];
  if (!challenge) {
    return;
  }

  if (editor) {
    persistActiveDraft();
  }

  activeChallengeId = resolvedChallengeId;

  document.getElementById('challengeTitle').textContent = challenge.title;
  document.getElementById('challengeDifficulty').textContent =
    challenge.difficulty;
  document.getElementById('challengeDescription').textContent =
    challenge.description;
  document.getElementById('challengeObjective').textContent =
    challenge.objective;

  const stepList = document.getElementById('challengeSteps');
  stepList.innerHTML = '';
  challenge.steps.forEach((step) => {
    const li = document.createElement('li');
    li.textContent = step;
    stepList.appendChild(li);
  });

  document.querySelectorAll('.challenge-link').forEach((button) => {
    button.classList.toggle(
      'active',
      button.dataset.challenge === resolvedChallengeId
    );
  });

  if (updateUrl) {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('challenge', resolvedChallengeId);
    history.replaceState({}, '', nextUrl.toString());
  }

  renderProgressTimeline();

  if (window.innerWidth <= 980) {
    setMobileView('editor');
  }

  // Track challenge start in analytics
  if (typeof trackChallengeStart === 'function') trackChallengeStart(resolvedChallengeId);
}

function renderChallengeNav() {
  const container = document.querySelector('.challenge-nav-list') || document.getElementById('challengeNav');
  if (!container) return;

  container.innerHTML = '';
  const renderedGroups = new Set();

  challengeOrder.forEach((id) => {
    const challenge = challengeCatalog[id];
    const isCompleted = !!completedChallenges[id];
    const isActive = activeChallengeId === id;

    // Check if this challenge belongs to a group (e.g., Log Hunt)
    if (challenge.groupId) {
      if (!renderedGroups.has(challenge.groupId)) {
        renderedGroups.add(challenge.groupId);

        // Create the Dropdown (details/summary)
        const details = document.createElement('details');
        details.className = 'challenge-group-wrapper';
        // Auto-open the dropdown if the active challenge is inside it
        if (activeChallengeId.startsWith(id.split('-')[0])) {
          details.open = true;
        }

        const summary = document.createElement('summary');
        summary.className = 'challenge-nav-group-header';
        summary.textContent = challenge.groupTitle || 'Group';

        details.appendChild(summary);
        container.appendChild(details);
      }

      // Add the task button inside the existing details element
      const parentDetails = container.lastChild;
      const btn = document.createElement('button');
      btn.className = `challenge-nav-item sub-task ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`;
      btn.innerHTML = `
        <span class="status-dot"></span>
        <span class="title">${challenge.title}</span>
      `;
      btn.onclick = () => {
        const currentIndex = getChallengeIndex(activeChallengeId);
        const targetIndex = getChallengeIndex(id);
        if (targetIndex > currentIndex && !completedChallenges[activeChallengeId]) {
          showToast('Finish the current challenge first!');
          return;
        }
        loadChallenge(id);
      };
      parentDetails.appendChild(btn);

    } else {
      // Standard rendering for standalone challenges
      const btn = document.createElement('button');
      btn.className = `challenge-nav-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`;
      btn.innerHTML = `
        <span class="status-dot"></span>
        <span class="title">${challenge.title}</span>
      `;
      btn.onclick = () => {
        const currentIndex = getChallengeIndex(activeChallengeId);
        const targetIndex = getChallengeIndex(id);
        if (targetIndex > currentIndex && !completedChallenges[activeChallengeId]) {
          showToast('Finish the current challenge first!');
          return;
        }
        loadChallenge(id);
      };
      container.appendChild(btn);
    }
  });
}

function applyChallengeStarter() {
  const challenge = challengeCatalog[activeChallengeId];
  if (!challenge || !editor) {
    return;
  }

  currentLang = challenge.starterLang;
  codeSamples[currentLang] = challenge.starterCode;
  switchLanguage(currentLang);
  editor.setValue(challenge.starterCode);
  persistActiveDraft();
  showToast('Starter code loaded');
}

function copyFirstCommand() {
  const challenge = challengeCatalog[activeChallengeId];
  if (!challenge) {
    return;
  }

  if (!navigator.clipboard) {
    showToast('Clipboard is not available in this browser');
    return;
  }

  navigator.clipboard
    .writeText(challenge.firstCommand)
    .then(() => {
      showToast('First command copied');
    })
    .catch(() => {
      showToast('Failed to copy command');
      console.warn('Failed to copy first command');
    });
}

/**
 * Execute challenge validator script in container and parse pass/fail.
 * Uses unique markers so output parsing is deterministic.
 */
function checkChallengeSolution() {
  const challenge = challengeCatalog[activeChallengeId];
  if (!challenge || !ws || ws.readyState !== WebSocket.OPEN) {
    showToast('Terminal not connected');
    return;
  }
  if (!challenge.checkScript) {
    showToast('No checker configured for this challenge');
    return;
  }

  if (isMockTerminal) {
    const report = getMockFile('report.txt') || '';
    const recon = getMockFile('recon-notes.txt') || '';
    const sampleLog = getMockFile('sample.log') || '';
    const escalationReport = getMockFile('escalation-report.txt') || '';
    // Offline-mode validators: JS mirrors of the real bash/Python checkers.
    // Runs when isMockTerminal is true (no live container available).
    const checksByChallenge = {
      'linux-basics':
        report.trim().length > 0 &&
        /(owner|permission|user|group)/i.test(report),
      'web-recon':
        recon.trim().length > 0 &&
        /(port|9090)/i.test(recon) &&
        /php.7/i.test(recon) &&
        /internalportal/i.test(recon),
      'priv-esc': (() => {
        if (!escalationReport.trim()) return false;
        if (!/\bjsmith\b/i.test(escalationReport)) return false;
        if (!/02:11/.test(escalationReport)) return false;
        if (!/\bsu\b|escalat/i.test(escalationReport)) return false;
        return true;
      })(),
      'log-hunt': /(failed|error|denied)/i.test(sampleLog),
    };
    const passed = !!checksByChallenge[activeChallengeId];

    mockWriteLine(`--- Checking ${challenge.title} ---`);
    if (passed) {
      completedChallenges[activeChallengeId] = {
        passed: true,
        passedAt: new Date().toISOString(),
      };
      saveProgress();
      renderChallengeNav();
      mockWriteLine('PASS: challenge checks passed.');
      const nextChallengeId = getNextChallengeId(activeChallengeId);
      if (nextChallengeId) {
        mockWriteLine(
          `Moving to next challenge: ${challengeCatalog[nextChallengeId].title}`
        );
        loadChallenge(nextChallengeId);
        applyChallengeStarter();
        showToast('Challenge completed. Moved to next.');
      } else {
        showToast('All challenges completed.');
      }
      return;
    }

    mockWriteLine('FAIL: challenge checks did not pass yet.');
    return;
  }

  const checkId = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const startMarker = `__CM_CHECK_START_${checkId}__`;
  const resultMarker = `__CM_CHECK_RESULT_${checkId}__`;
  const endMarker = `__CM_CHECK_END_${checkId}__`;
  pendingCheck = {
    challengeId: activeChallengeId,
    startMarker,
    resultMarker,
    endMarker,
    buffer: '',
    started: false,
    finished: false,
  };

  ws.send(`echo "\\n--- Checking ${challenge.title} ---"\n`);
  ws.send(`printf '%s\\n' '${startMarker}'\n`);
  ws.send(`bash -lc ${shellQuote(challenge.checkScript)}\n`);
  ws.send(`printf '%s:%s\\n' '${resultMarker}' \"$?\"\n`);
  ws.send(`printf '%s\\n' '${endMarker}'\n`);
}

/**
 * Parse checker output markers from terminal stream.
 * Marks challenge passed and updates local progress.
 * Also syncs completion to the server for server-side enforcement.
 * @param {string} chunk
 */
function handleCheckOutput(chunk) {
  if (!pendingCheck || pendingCheck.finished) {
    return;
  }

  pendingCheck.buffer += chunk;
  if (
    !pendingCheck.started &&
    pendingCheck.buffer.includes(pendingCheck.startMarker)
  ) {
    pendingCheck.started = true;
  }

  if (!pendingCheck.started) {
    return;
  }

  const resultRegex = new RegExp(`${pendingCheck.resultMarker}:(\\d+)`);
  const resultMatch = pendingCheck.buffer.match(resultRegex);
  const hasEnd = pendingCheck.buffer.includes(pendingCheck.endMarker);
  if (!resultMatch || !hasEnd) {
    return;
  }

  const exitCode = Number(resultMatch[1]);
  const passed = exitCode === 0;
  const challengeId = pendingCheck.challengeId;
  pendingCheck.finished = true;
  pendingCheck = null;

  if (passed) {
    completedChallenges[challengeId] = {
      passed: true,
      passedAt: new Date().toISOString(),
    };
    saveProgress();
    renderChallengeNav();

    // Sync completion to server-side progression enforcement.
    // This prevents localStorage bypass — the backend is the source of truth.
    if (sessionId) {
      fetch(`/api/session/${sessionId}/progress/${challengeId}`, {
        method: 'POST',
      }).catch((err) =>
        console.warn('Failed to sync progress to server:', err)
      );
    }

    // Track challenge completion in analytics
    if (typeof trackChallengeComplete === 'function') trackChallengeComplete(challengeId);

    ws.send(`echo "PASS: challenge checks passed."\n`);
    const nextChallengeId = getNextChallengeId(challengeId);
    if (nextChallengeId) {
      ws.send(
        `echo "Moving to next challenge: ${challengeCatalog[nextChallengeId].title}"\n`
      );
      loadChallenge(nextChallengeId);
      applyChallengeStarter();
      showToast('Challenge completed. Moved to next.');
    } else {
      showToast('All challenges completed.');
    }
    return;
  }

  ws.send(`echo "FAIL: challenge checks did not pass yet."\n`);
}
