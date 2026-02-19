/**
 * @file Challenge navigation and validation flow.
 */
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
}

function renderChallengeNav() {
  const nav = document.getElementById('challengeNav');
  nav.innerHTML = '';

  Object.entries(challengeCatalog).forEach(([id, challenge]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'challenge-link';
    button.dataset.challenge = id;
    const passed = !!completedChallenges[id];

    if (passed) {
      const icon = document.createElement('span');
      icon.className = 'challenge-check-icon';
      icon.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>';
      button.appendChild(icon);
    }

    const title = document.createElement('span');
    title.className = 'challenge-title';
    title.textContent = `${challenge.title} (${challenge.difficulty})`;
    button.appendChild(title);

    if (passed) {
      button.disabled = true;
      button.title = 'Completed';
    } else {
      button.addEventListener('click', () => loadChallenge(id));
    }

    nav.appendChild(button);
  });

  renderProgressTimeline();
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
    const checksByChallenge = {
      'linux-basics':
        report.trim().length > 0 &&
        /(owner|permission|user|group)/i.test(report),
      'web-recon':
        recon.trim().length > 0 &&
        /(server|content-type|status|header|port)/i.test(recon),
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
