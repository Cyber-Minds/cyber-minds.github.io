/**
 * @file Core terminal UI helpers.
 *
 * Includes state persistence, command palette, theme switching, and editor-tab
 * selection behavior shared across runtime modules.
 */
/**
 * Load challenge completion progress from localStorage.
 * This is UI-only state for checkmarks in the challenge list.
 */
function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) {
      completedChallenges = {};
      return;
    }
    const parsed = JSON.parse(raw);
    completedChallenges =
      parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    completedChallenges = {};
  }
}

/**
 * Persist challenge completion progress to localStorage.
 */
function saveProgress() {
  localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(completedChallenges));
}

let commandPaletteRestoreFocus = null;

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) {
    return;
  }

  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(toast._hideTimer);
  toast._hideTimer = window.setTimeout(() => {
    toast.classList.remove('visible');
  }, 1800);
}

function renderProgressTimeline() {
  const chip = document.getElementById('progressChip');
  const timeline = document.getElementById('progressTimeline');
  if (!chip || !timeline) {
    return;
  }

  const total = challengeOrder.length;
  const completed = challengeOrder.filter((id) => !!completedChallenges[id]).length;
  chip.textContent = `${completed}/${total} complete`;
  chip.classList.toggle('all-done', completed === total);
  timeline.style.gridTemplateColumns = `repeat(${Math.max(total, 1)}, minmax(0, 1fr))`;

  timeline.innerHTML = '';
  challengeOrder.forEach((id) => {
    const step = document.createElement('div');
    step.className = 'timeline-step';

    const dot = document.createElement('div');
    dot.className = 'timeline-dot';

    const label = document.createElement('div');
    label.className = 'timeline-label';
    label.textContent = challengeCatalog[id].title;

    if (completedChallenges[id]) {
      dot.classList.add('done');
      label.classList.add('done');
    } else if (id === activeChallengeId) {
      dot.classList.add('active');
      label.classList.add('active');
    }

    step.appendChild(dot);
    step.appendChild(label);
    timeline.appendChild(step);
  });
}

function isTerminalConnected() {
  return !!ws && ws.readyState === WebSocket.OPEN;
}

function getCommandPaletteActions() {
  return [
    {
      id: 'run',
      label: 'Run Code',
      hint: 'Ctrl/Cmd + Enter',
      keywords: 'run execute terminal',
      disabled: false,
      run: () => document.getElementById('runBtn').click(),
    },
    {
      id: 'check',
      label: 'Check Solution',
      hint: 'Ctrl/Cmd + Shift + C',
      keywords: 'check validate challenge',
      disabled: false,
      run: () => document.getElementById('checkSolutionBtn').click(),
    },
    {
      id: 'clear',
      label: 'Clear Terminal',
      hint: 'Ctrl/Cmd + Shift + L',
      keywords: 'clear terminal',
      disabled: false,
      run: () => document.getElementById('clearBtn').click(),
    },
  {
    id: 'starter',
    label: 'Load Starter Code',
    hint: 'Ctrl/Cmd + Shift + S',
    keywords: 'starter template',
    disabled: false,
    run: () => document.getElementById('loadStarterBtn').click(),
  },
  {
    id: 'copy',
    label: 'Copy First Command',
    hint: '',
      keywords: 'copy first command',
      disabled: false,
      run: () => document.getElementById('copyCommandBtn').click(),
    },
    {
      id: 'theme',
      label: currentTheme === 'light' ? 'Switch to Dark Theme' : 'Switch to Light Theme',
      hint: '',
      keywords: 'theme dark light',
      disabled: false,
      run: () => {
        applyTheme(currentTheme === 'light' ? 'dark' : 'light');
        showToast('Theme updated');
      },
    },
  ];
}

function renderCommandPalette() {
  const input = document.getElementById('commandPaletteInput');
  const list = document.getElementById('commandPaletteList');
  if (!input || !list) {
    return;
  }

  const q = input.value.trim().toLowerCase();
  const allActions = getCommandPaletteActions();
  commandPaletteItems = allActions.filter((action) => {
    if (!q) {
      return true;
    }
    return (
      action.label.toLowerCase().includes(q) ||
      action.keywords.toLowerCase().includes(q)
    );
  });

  if (commandPaletteSelectedIndex >= commandPaletteItems.length) {
    commandPaletteSelectedIndex = 0;
  }

  list.innerHTML = '';
  if (!commandPaletteItems.length) {
    const empty = document.createElement('div');
    empty.className = 'command-empty';
    empty.textContent = 'No matching command';
    list.appendChild(empty);
    return;
  }

  commandPaletteItems.forEach((action, index) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'command-item';
    item.disabled = !!action.disabled;
    if (index === commandPaletteSelectedIndex) {
      item.classList.add('active');
    }

    const title = document.createElement('span');
    title.textContent = action.label;
    item.appendChild(title);

    if (action.hint) {
      const hint = document.createElement('span');
      hint.className = 'command-kbd';
      hint.textContent = action.hint;
      item.appendChild(hint);
    }

    item.addEventListener('click', () => {
      if (action.disabled) {
        showToast('Terminal not connected');
        return;
      }
      closeCommandPalette();
      action.run();
    });

    list.appendChild(item);
  });
}

function openCommandPalette() {
  isCommandPaletteOpen = true;
  commandPaletteSelectedIndex = 0;
  const overlay = document.getElementById('commandPaletteOverlay');
  const input = document.getElementById('commandPaletteInput');
  if (!overlay || !input) {
    return;
  }
  commandPaletteRestoreFocus = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  overlay.hidden = false;
  input.value = '';
  renderCommandPalette();
  window.setTimeout(() => input.focus(), 0);
}

function closeCommandPalette() {
  isCommandPaletteOpen = false;
  const overlay = document.getElementById('commandPaletteOverlay');
  if (overlay) {
    overlay.hidden = true;
  }
  if (commandPaletteRestoreFocus && document.contains(commandPaletteRestoreFocus)) {
    commandPaletteRestoreFocus.focus();
  }
  commandPaletteRestoreFocus = null;
}

function moveCommandPaletteSelection(delta) {
  if (!commandPaletteItems.length) {
    return;
  }

  let index = commandPaletteSelectedIndex;
  for (let i = 0; i < commandPaletteItems.length; i += 1) {
    index = (index + delta + commandPaletteItems.length) % commandPaletteItems.length;
    if (!commandPaletteItems[index].disabled) {
      commandPaletteSelectedIndex = index;
      renderCommandPalette();
      return;
    }
  }
}

function executeSelectedCommandPaletteItem() {
  if (!commandPaletteItems.length) {
    return;
  }
  const action = commandPaletteItems[commandPaletteSelectedIndex];
  if (!action || action.disabled) {
    showToast('Command unavailable');
    return;
  }
  closeCommandPalette();
  action.run();
}

function applyTheme(theme) {
  currentTheme = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme);
  localStorage.setItem(THEME_STORAGE_KEY, currentTheme);
  const themeButton = document.getElementById('themeToggleBtn');
  if (themeButton) {
    themeButton.textContent =
      currentTheme === 'light' ? 'Dark Theme' : 'Light Theme';
  }
  syncEditorTheme();
  syncTerminalTheme();
}

function loadTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  applyTheme(stored || 'dark');
}

function getChallengeIndex(challengeId) {
  return challengeOrder.indexOf(challengeId);
}

function getNextChallengeId(challengeId) {
  const index = getChallengeIndex(challengeId);
  if (index < 0 || index >= challengeOrder.length - 1) {
    return null;
  }
  return challengeOrder[index + 1];
}

function getFirstIncompleteChallengeId() {
  return challengeOrder.find((id) => !completedChallenges[id]) || null;
}

function normalizeActiveChallenge() {
  if (!completedChallenges[activeChallengeId]) {
    return;
  }
  const nextIncomplete = getFirstIncompleteChallengeId();
  if (nextIncomplete) {
    activeChallengeId = nextIncomplete;
  }
}

function getDraftStorageKey() {
  if (activeEditorFile.kind === 'workspace') {
    return `${DRAFT_STORAGE_PREFIX}:${activeChallengeId}:workspace:${activeEditorFile.path}`;
  }
  return `${DRAFT_STORAGE_PREFIX}:${activeChallengeId}:template:${activeEditorFile.lang}`;
}

function getSavedDraftSummaries() {
  const prefix = `${DRAFT_STORAGE_PREFIX}:`;
  const summaries = [];
 
  try {
    Object.keys(localStorage).forEach((key) => {
      if (!key.startsWith(prefix)) {
        return;
      }
 
      const rest = key.slice(prefix.length);
      let isDiscarded = false;
      let lookupRest = rest;
 
      // Discarded drafts are stored as: discarded:{timestamp}:{challengeId}:{kind}:{scope}
      if (rest.startsWith('discarded:')) {
        isDiscarded = true;
        const afterDiscarded = rest.slice('discarded:'.length);
        const firstColon = afterDiscarded.indexOf(':');
        lookupRest = afterDiscarded.slice(firstColon + 1);
      }
 
      const parts = lookupRest.split(':');
      const challengeId = parts[0];
      const kind = parts[1];
      const scope = parts.slice(2).join(':');
      if (!challengeId || !kind || !scope) {
        return;
      }
 
      const value = localStorage.getItem(key);
      if (value === null) {
        return;
      }
 
      const preview = value
        .split('\n')
        .find((line) => line.trim().length > 0);
 
      summaries.push({
        key,
        challengeId,
        kind,
        scope,
        isDiscarded,
        label: isDiscarded
          ? `${scope} (discarded — click to restore)`
          : scope,
        preview: preview || '(empty draft)',
      });
    });
  } catch (e) {
    console.warn('Draft list failed:', e);
  }
 
  // Active drafts first, then discarded ones
  return summaries.sort((a, b) => {
    if (a.isDiscarded !== b.isDiscarded) return a.isDiscarded ? 1 : -1;
    return a.label.localeCompare(b.label);
  });
}

function restoreDraftOrDefault(fallback) {
  const key = getDraftStorageKey();
  let saved = null;
  try {
    saved = localStorage.getItem(key);
  } catch (e) {
    console.warn('Draft read failed:', e);
  }

  if (saved !== null) {
    try {
      editor.setValue(saved);
      if (typeof showDraftRecoveryBanner === 'function') {
        showDraftRecoveryBanner();
      }
    } catch (e) {
      console.warn('Draft restore failed, falling back:', e);
      editor.setValue(fallback);
    }
    return;
  }
  editor.setValue(fallback);
}

function persistActiveDraft() {
  if (!editor) {
    return;
  }
  try {
    const value = editor.getValue();
    const starterValue = codeSamples[currentLang] || '';
    // Don't save a draft that's identical to the unmodified starter —
    // there's nothing to "recover" in that case.
    if (value === starterValue) {
      if (activeEditorFile.kind === 'template') {
        localStorage.removeItem(getDraftStorageKey());
      }
      return;
    }
    localStorage.setItem(getDraftStorageKey(), value);
  } catch (e) {
    console.warn('Draft save failed:', e);
  }
}

/**
 * Debounced draft save. Waits 30 seconds after the user stops typing
 * before persisting to localStorage, so drafts aren't rewritten on every keystroke.
 */
function queueDraftSave() {
  if (!editor) {
    return;
  }
  window.clearTimeout(autoSaveTimer);
  persistActiveDraft();
}

function flushDraftSave() {
  if (!editor) {
    return;
  }
  window.clearTimeout(autoSaveTimer);
  autoSaveTimer = null;
  persistActiveDraft();
}

function setMobileView(view) {
  const allowed = ['challenge', 'editor', 'terminal'];
  activeMobileView = allowed.includes(view) ? view : 'terminal';
  document.body.classList.remove(
    'mobile-view-challenge',
    'mobile-view-editor',
    'mobile-view-terminal'
  );
  document.body.classList.add(`mobile-view-${activeMobileView}`);
  document
    .querySelectorAll('.mobile-switch-btn')
    .forEach((button) =>
      button.classList.toggle(
        'active',
        button.id === `mobile${activeMobileView[0].toUpperCase()}${activeMobileView.slice(1)}Btn`
      )
    );
}

function updateStatus(status, text) {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  statusDot.className = `status-dot ${status}`;
  statusText.textContent = text;
}

function refreshLanguageBadge() {
  const target = document.getElementById('selectedLanguage');
  if (activeEditorFile.kind === 'workspace') {
    target.textContent = `${currentLang} | ${activeEditorFile.path}`;
    return;
  }
  target.textContent = currentLang;
}

/**
 * Infer Monaco/editor run language from a file path.
 * @param {string} filePath
 * @returns {string}
 */
function detectLanguageFromPath(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.py')) return 'python';
  if (
    lower.endsWith('.js') ||
    lower.endsWith('.mjs') ||
    lower.endsWith('.cjs')
  )
    return 'javascript';
  if (lower.endsWith('.java')) return 'java';
  if (lower.endsWith('.go')) return 'go';
  if (lower.endsWith('.md')) return 'markdown';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.html')) return 'html';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.sh')) return 'shell';
  return 'plaintext';
}

function getFilename(filePath) {
  const parts = filePath.split('/');
  return parts[parts.length - 1] || filePath;
}

function shellQuote(value) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

/**
 * Render template tabs plus discovered workspace files.
 */
function renderFileTabs() {
  const fileTabs = document.getElementById('fileTabs');
  fileTabs.innerHTML = '';

  ['python', 'javascript', 'java', 'go'].forEach((lang) => {
    const tab = document.createElement('div');
    tab.className = 'file-tab';
    tab.dataset.kind = 'template';
    tab.dataset.lang = lang;
    tab.textContent = templateFilenames[lang];
    tab.title = templateFilenames[lang];
    const isActive =
      activeEditorFile.kind === 'template' &&
      activeEditorFile.lang === lang;
    tab.classList.toggle('active', isActive);
    fileTabs.appendChild(tab);
  });

  workspaceFiles.forEach((entry) => {
    const tab = document.createElement('div');
    tab.className = 'file-tab';
    tab.dataset.kind = 'workspace';
    tab.dataset.path = entry.path;
    tab.textContent = getFilename(entry.path);
    tab.title = entry.path;
    const isActive =
      activeEditorFile.kind === 'workspace' &&
      activeEditorFile.path === entry.path;
    tab.classList.toggle('active', isActive);
    fileTabs.appendChild(tab);
  });
}

function switchLanguage(lang, options = {}) {
  const { persistCurrent = true } = options;
  if (editor && persistCurrent && !isInitialLoad) {
    persistActiveDraft();
  }

  currentLang = lang;
  activeEditorFile = {
    kind: 'template',
    lang,
    filename: templateFilenames[lang],
    path: '',
  };

  if (editor) {
    restoreDraftOrDefault(codeSamples[lang]);
    monaco.editor.setModelLanguage(editor.getModel(), lang);
  }

  renderFileTabs();
  refreshLanguageBadge();
}
