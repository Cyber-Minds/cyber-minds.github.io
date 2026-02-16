let editor;
let terminal;
let fitAddon;
let ws;
let sessionId;
let currentLang = 'python';
let workspaceFiles = [];
let workspaceSyncTimer = null;
let pendingCheck = null;
let completedChallenges = {};
let autoSaveTimer = null;
let currentTheme = 'dark';
let activeMobileView = 'terminal';
let isCommandPaletteOpen = false;
let commandPaletteItems = [];
let commandPaletteSelectedIndex = 0;
let activeEditorFile = {
  kind: 'template',
  lang: 'python',
  filename: 'hello.py',
  path: '',
};
const PROGRESS_STORAGE_KEY = 'cm_ctf_progress_v1';
const THEME_STORAGE_KEY = 'cm_terminal_theme_v1';
const DRAFT_STORAGE_PREFIX = 'cm_terminal_draft_v1';

const query = new URLSearchParams(window.location.search);
// Two-deployment setup:
// - Terminal UI is served by main website deployment.
// - Terminal backend is served by dedicated API domain.
// Localhost is kept for local development convenience.
const isLocalHost = ['localhost', '127.0.0.1'].includes(
  window.location.hostname
);
const defaultApiOrigin = isLocalHost
  ? window.location.origin
  : 'https://terminal.egeuysal.com';
const configuredApiOrigin = query.get('apiOrigin') || defaultApiOrigin;
const apiOrigin = (() => {
  try {
    return new URL(configuredApiOrigin).origin;
  } catch {
    return defaultApiOrigin;
  }
})();

function getWsOrigin(origin) {
  const parsed = new URL(origin);
  parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
  return parsed.origin;
}

const isMockTerminal = query.get('mockTerminal') === '1';
const mockState = {
  sessionId: `mock-${Date.now()}`,
  cwd: '/workspace',
  inputBuffer: '',
  files: {},
};

function normalizeMockPath(path) {
  const value = String(path || '')
    .replace(/^['"]|['"]$/g, '')
    .trim();
  if (!value) {
    return '';
  }
  const withoutWorkspace = value.replace(/^\/workspace\/?/, '');
  const withoutLeading = withoutWorkspace.replace(/^\.\/+/, '');
  return withoutLeading.replace(/^\/+/, '');
}

function setMockFile(path, content) {
  const normalized = normalizeMockPath(path);
  if (!normalized) {
    return;
  }
  mockState.files[normalized] = String(content ?? '');
}

function getMockFile(path) {
  const normalized = normalizeMockPath(path);
  if (!normalized) {
    return '';
  }
  return mockState.files[normalized];
}

function hasMockFile(path) {
  const normalized = normalizeMockPath(path);
  return (
    !!normalized &&
    Object.prototype.hasOwnProperty.call(mockState.files, normalized)
  );
}

function seedMockWorkspace() {
  Object.entries(templateFilenames).forEach(([lang, filename]) => {
    setMockFile(filename, codeSamples[lang]);
  });
  if (!hasMockFile('report.txt')) {
    setMockFile('report.txt', '');
  }
  if (!hasMockFile('recon-notes.txt')) {
    setMockFile('recon-notes.txt', '');
  }
  if (!hasMockFile('sample.log')) {
    setMockFile(
      'sample.log',
      [
        '2026-02-16T10:30:12Z auth failed user=admin ip=10.0.0.2',
        '2026-02-16T10:31:05Z auth failed user=root ip=10.0.0.2',
        '2026-02-16T10:33:44Z auth denied user=test ip=192.168.1.7',
      ].join('\n') + '\n'
    );
  }
}

function getMockWorkspaceFiles() {
  return Object.keys(mockState.files)
    .sort((a, b) => a.localeCompare(b))
    .map((path) => ({
      path,
      size: mockState.files[path].length,
    }));
}

function mockWrite(text) {
  if (!terminal) {
    return;
  }
  terminal.write(text);
}

function mockWriteLine(text) {
  if (typeof text === 'string' && text.length > 0) {
    mockWrite(`${text}\r\n`);
    return;
  }
  mockWrite('\r\n');
}

function mockPrompt() {
  mockWrite(`cyberminds@mock:${mockState.cwd}$ `);
}

function runMockCommand(command) {
  const trimmed = command.trim();
  if (!trimmed) {
    return;
  }

  if (trimmed === 'clear') {
    terminal.clear();
    return;
  }

  if (trimmed === 'help') {
    mockWriteLine('Mock commands: pwd, whoami, ls, cat <file>, touch <file>');
    mockWriteLine('Also supports: echo "text" > file, echo "text" >> file');
    return;
  }

  if (trimmed === 'pwd') {
    mockWriteLine('/workspace');
    return;
  }

  if (trimmed === 'whoami') {
    mockWriteLine('cyberminds');
    return;
  }

  if (trimmed === 'ls' || trimmed === 'ls -la' || trimmed === 'ls -l') {
    const files = Object.keys(mockState.files).sort((a, b) =>
      a.localeCompare(b)
    );
    if (!files.length) {
      mockWriteLine('');
      return;
    }
    if (trimmed === 'ls') {
      mockWriteLine(files.join('  '));
      return;
    }
    files.forEach((name) => {
      const size = mockState.files[name].length;
      mockWriteLine(`-rw-r--r-- 1 cyberminds cyberminds ${size} Feb 16  ${name}`);
    });
    return;
  }

  const touchMatch = trimmed.match(/^touch\s+(.+)$/);
  if (touchMatch) {
    const filePath = normalizeMockPath(touchMatch[1]);
    if (filePath && !hasMockFile(filePath)) {
      setMockFile(filePath, '');
    }
    return;
  }

  const catMatch = trimmed.match(/^cat\s+(.+)$/);
  if (catMatch) {
    const filePath = normalizeMockPath(catMatch[1]);
    if (!hasMockFile(filePath)) {
      mockWriteLine(`cat: ${filePath}: No such file or directory`);
      return;
    }
    const content = getMockFile(filePath);
    if (content) {
      mockWrite(content.replace(/\n/g, '\r\n'));
    }
    if (!content.endsWith('\n')) {
      mockWrite('\r\n');
    }
    return;
  }

  const grepFailedMatch = trimmed.match(
    /^grep\s+-i\s+["']failed["']\s+(.+)$/
  );
  if (grepFailedMatch) {
    const filePath = normalizeMockPath(grepFailedMatch[1]);
    const content = getMockFile(filePath) || '';
    content
      .split(/\r?\n/)
      .filter((line) => line.toLowerCase().includes('failed'))
      .forEach((line) => mockWriteLine(line));
    return;
  }

  const echoRedirectMatch = trimmed.match(
    /^echo\s+(.+?)\s*(>>?)\s*(.+)$/
  );
  if (echoRedirectMatch) {
    const rawText = echoRedirectMatch[1]
      .replace(/^['"]|['"]$/g, '')
      .replace(/\\n/g, '\n');
    const mode = echoRedirectMatch[2];
    const filePath = normalizeMockPath(echoRedirectMatch[3]);
    if (!filePath) {
      return;
    }

    if (!hasMockFile(filePath) || mode === '>') {
      setMockFile(filePath, `${rawText}\n`);
    } else {
      setMockFile(filePath, `${getMockFile(filePath)}${rawText}\n`);
    }
    return;
  }

  if (trimmed.startsWith('mkdir ')) {
    return;
  }

  if (trimmed.startsWith('ss -tulpen')) {
    mockWriteLine('Netid State  Recv-Q Send-Q Local Address:Port');
    mockWriteLine('tcp   LISTEN 0      128    0.0.0.0:22');
    mockWriteLine('tcp   LISTEN 0      4096   0.0.0.0:443');
    return;
  }

  if (trimmed.startsWith('curl -I ')) {
    mockWriteLine('HTTP/1.1 200 OK');
    mockWriteLine('server: Caddy');
    mockWriteLine('content-type: text/html; charset=utf-8');
    return;
  }

  mockWriteLine(`bash: ${trimmed}: command not found`);
}

function handleMockTerminalInput(data) {
  for (const ch of data) {
    if (ch === '\r') {
      mockWrite('\r\n');
      runMockCommand(mockState.inputBuffer);
      mockState.inputBuffer = '';
      syncWorkspaceFiles();
      mockPrompt();
      continue;
    }

    if (ch === '\u0003') {
      mockState.inputBuffer = '';
      mockWrite('^C\r\n');
      mockPrompt();
      continue;
    }

    if (ch === '\u007f') {
      if (mockState.inputBuffer.length > 0) {
        mockState.inputBuffer = mockState.inputBuffer.slice(0, -1);
        mockWrite('\b \b');
      }
      continue;
    }

    if (ch >= ' ' && ch !== '\u007f') {
      mockState.inputBuffer += ch;
      mockWrite(ch);
    }
  }
}

const codeSamples = {
  python: `# Python starter\nprint("CyberMinds terminal ready")\n`,
  javascript: `// JavaScript starter\nconsole.log("CyberMinds terminal ready");\n`,
  java: `public class Hello {\n    public static void main(String[] args) {\n        System.out.println("CyberMinds terminal ready");\n    }\n}\n`,
  go: `package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("CyberMinds terminal ready")\n}\n`,
};

const runCommands = {
  python: 'python3 hello.py',
  javascript: 'node hello.js',
  java: 'javac Hello.java && java Hello',
  go: 'go run starter.go',
};

const templateFilenames = {
  python: 'hello.py',
  javascript: 'hello.js',
  java: 'Hello.java',
  go: 'starter.go',
};

const challengeCatalog = {
  'linux-basics': {
    title: 'Linux Basics Warmup',
    difficulty: 'Beginner',
    description:
      'Get comfortable with directories, files, and basic shell commands before timed CTF tasks.',
    objective:
      'List files, inspect permissions, and create a short report in report.txt.',
    steps: [
      'Run pwd, whoami, and ls -la.',
      'Create challenge-notes and add a file named report.txt.',
      'Write one line summarizing current directory ownership.',
    ],
    firstCommand: 'pwd',
    checkScript:
      'set -e; test -f report.txt; test -s report.txt; grep -Eqi "(owner|permission|user|group)" report.txt',
    starterLang: 'python',
    starterCode: `import os\n\nprint("Current directory:", os.getcwd())\nprint("Directory listing:")\nfor name in sorted(os.listdir(".")):\n    print("-", name)\n`,
  },
  'web-recon': {
    title: 'Web Recon Starter',
    difficulty: 'Beginner',
    description:
      'Practice recon workflows: check open ports and inspect HTTP response headers safely.',
    objective:
      'Identify exposed services and capture response headers into notes.',
    steps: [
      'Run ss -tulpen to inspect listening services.',
      'Use curl -I against a target URL.',
      'Record key headers and suspected tech stack.',
    ],
    firstCommand: 'ss -tulpen',
    checkScript:
      'set -e; test -f recon-notes.txt; test -s recon-notes.txt; grep -Eqi "(server|content-type|status|header|port)" recon-notes.txt',
    starterLang: 'javascript',
    starterCode: `const http = require('http');\n\nhttp.get('http://example.com', (res) => {\n  console.log('Status:', res.statusCode);\n  console.log('Headers:', res.headers);\n});\n`,
  },
  'log-hunt': {
    title: 'Log Hunt',
    difficulty: 'Intermediate',
    description:
      'Use grep, awk, and sorting to identify suspicious events from logs.',
    objective:
      'Find top suspicious IPs from sample logs and summarize findings.',
    steps: [
      'Create sample.log with repeated test entries.',
      'Filter for failed login patterns.',
      'Sort and count source IP occurrences.',
    ],
    firstCommand: 'grep -i "failed" sample.log',
    checkScript:
      'set -e; test -f sample.log; grep -Eqi "failed|error|denied" sample.log',
    starterLang: 'python',
    starterCode: `from collections import Counter\n\nips = [\n    "10.0.0.2", "10.0.0.2", "192.168.1.7", "10.0.0.2", "192.168.1.7"\n]\nfor ip, count in Counter(ips).most_common():\n    print(ip, count)\n`,
  },
};

const challengeOrder = Object.keys(challengeCatalog);
let activeChallengeId = query.get('challenge') || challengeOrder[0];
if (!challengeCatalog[activeChallengeId]) {
  activeChallengeId = challengeOrder[0];
}

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

function restoreDraftOrDefault(fallback) {
  const key = getDraftStorageKey();
  const saved = localStorage.getItem(key);
  if (saved !== null) {
    editor.setValue(saved);
    return;
  }
  editor.setValue(fallback);
}

function persistActiveDraft() {
  if (!editor) {
    return;
  }
  localStorage.setItem(getDraftStorageKey(), editor.getValue());
}

function queueDraftSave() {
  if (!editor) {
    return;
  }
  window.clearTimeout(autoSaveTimer);
  autoSaveTimer = window.setTimeout(persistActiveDraft, 250);
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
    const isActive =
      activeEditorFile.kind === 'workspace' &&
      activeEditorFile.path === entry.path;
    tab.classList.toggle('active', isActive);
    fileTabs.appendChild(tab);
  });
}

function switchLanguage(lang) {
  if (editor) {
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

async function openWorkspaceFile(filePath) {
  if (!sessionId || !editor) {
    return;
  }

  persistActiveDraft();

  if (isMockTerminal) {
    const content = getMockFile(filePath);
    if (typeof content !== 'string') {
      return;
    }

    const language = detectLanguageFromPath(filePath);
    currentLang = language;
    activeEditorFile = {
      kind: 'workspace',
      lang: language,
      filename: getFilename(filePath),
      path: filePath,
    };
    restoreDraftOrDefault(content);
    monaco.editor.setModelLanguage(editor.getModel(), language);
    renderFileTabs();
    refreshLanguageBadge();
    return;
  }

  const response = await fetch(
    `${apiOrigin}/api/session/${sessionId}/file?path=${encodeURIComponent(filePath)}`
  );
  if (!response.ok) {
    return;
  }

  const data = await response.json();
  const language = detectLanguageFromPath(filePath);
  currentLang = language;
  activeEditorFile = {
    kind: 'workspace',
    lang: language,
    filename: getFilename(filePath),
    path: filePath,
  };
  restoreDraftOrDefault(data.content || '');
  monaco.editor.setModelLanguage(editor.getModel(), language);
  renderFileTabs();
  refreshLanguageBadge();
}

/**
 * Poll backend for files under /workspace to keep editor tabs in sync.
 * Runs periodically while a session is active.
 */
async function syncWorkspaceFiles() {
  if (!sessionId) {
    return;
  }

  if (isMockTerminal) {
    const files = getMockWorkspaceFiles()
      .filter((entry) => !!entry.path)
      .filter(
        (entry) => !Object.values(templateFilenames).includes(entry.path)
      )
      .slice(0, 50);

    const previous = workspaceFiles.map((entry) => entry.path).join('|');
    const next = files.map((entry) => entry.path).join('|');
    workspaceFiles = files;
    if (previous !== next) {
      renderFileTabs();
    }
    return;
  }

  try {
    const response = await fetch(
      `${apiOrigin}/api/session/${sessionId}/files`
    );
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    const files = (data.files || [])
      .filter((entry) => !!entry.path)
      .filter(
        (entry) => !Object.values(templateFilenames).includes(entry.path)
      )
      .slice(0, 50);

    const previous = workspaceFiles.map((entry) => entry.path).join('|');
    const next = files.map((entry) => entry.path).join('|');
    workspaceFiles = files;

    if (previous !== next) {
      renderFileTabs();
    }
  } catch (error) {
    console.warn('Failed to sync workspace files', error);
  }
}

function startWorkspaceSync() {
  stopWorkspaceSync();
  syncWorkspaceFiles();
  if (isMockTerminal) {
    return;
  }
  workspaceSyncTimer = window.setInterval(syncWorkspaceFiles, 2000);
}

function stopWorkspaceSync() {
  if (workspaceSyncTimer) {
    window.clearInterval(workspaceSyncTimer);
    workspaceSyncTimer = null;
  }
}

/**
 * Send terminal PTY dimensions to backend.
 * Required for full-screen TUIs (vim, less, top).
 */
function sendResizeMessage() {
  if (!ws || ws.readyState !== WebSocket.OPEN || !terminal) {
    return;
  }

  ws.send(
    JSON.stringify({
      type: 'resize',
      cols: terminal.cols,
      rows: terminal.rows,
    })
  );
}

function scheduleInitialResizeSync() {
  [100, 350, 900].forEach((delay) => {
    window.setTimeout(() => {
      if (fitAddon) {
        fitAddon.fit();
      }
      sendResizeMessage();
    }, delay);
  });
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

/**
 * Enable draggable desktop resizers between:
 * - Instructions <-> Editor
 * - Editor <-> Terminal
 */
function initPanelResizers() {
  const mainContent = document.querySelector('.main-content');
  const challengePanel = document.querySelector('.challenge-panel');
  const editorPanel = document.querySelector('.editor-panel');
  const terminalPanel = document.querySelector('.terminal-panel');
  const resizerLeft = document.getElementById(
    'resizerInstructionsEditor'
  );
  const resizerRight = document.getElementById('resizerEditorTerminal');

  function setupResizer(resizer, onDrag) {
    let dragging = false;

    resizer.addEventListener('mousedown', (event) => {
      if (window.innerWidth <= 980) {
        return;
      }
      dragging = true;
      event.preventDefault();
    });

    document.addEventListener('mousemove', (event) => {
      if (!dragging) {
        return;
      }
      const rect = mainContent.getBoundingClientRect();
      onDrag(event.clientX - rect.left, rect.width);
      if (fitAddon) {
        fitAddon.fit();
        sendResizeMessage();
      }
    });

    document.addEventListener('mouseup', () => {
      dragging = false;
    });
  }

  setupResizer(resizerLeft, (x, total) => {
    const leftPercent = (x / total) * 100;
    if (leftPercent < 18 || leftPercent > 40) {
      return;
    }

    const editorBasis = parseFloat(editorPanel.style.flexBasis || '34');
    if (leftPercent + editorBasis > 82) {
      return;
    }

    challengePanel.style.flexBasis = `${leftPercent}%`;
    terminalPanel.style.flex = '1';
  });

  setupResizer(resizerRight, (x, total) => {
    const leftBasis = parseFloat(challengePanel.style.flexBasis || '24');
    const editorPercent = (x / total) * 100 - leftBasis;
    if (editorPercent < 20 || editorPercent > 55) {
      return;
    }

    editorPanel.style.flexBasis = `${editorPercent}%`;
    terminalPanel.style.flex = '1';
  });
}

function getTerminalTheme() {
  if (currentTheme === 'light') {
    return {
      background: '#f6f9ff',
      foreground: '#1c3552',
      cursor: '#1c3552',
      black: '#d7e3f2',
      red: '#d64545',
      green: '#0f8a59',
      yellow: '#ad7b00',
      blue: '#1d73cf',
      magenta: '#5e4dc9',
      cyan: '#188f9f',
      white: '#1c3552',
      brightBlack: '#8197b3',
      brightRed: '#e64f4f',
      brightGreen: '#17a067',
      brightYellow: '#c58a00',
      brightBlue: '#2f86e2',
      brightMagenta: '#6b5ddb',
      brightCyan: '#1fa0b2',
      brightWhite: '#102033',
    };
  }

  return {
    background: '#111a25',
    foreground: '#e6effa',
    cursor: '#e6effa',
    black: '#111a25',
    red: '#fb4934',
    green: '#6fdbf0',
    yellow: '#fabd2f',
    blue: '#4ea0ff',
    magenta: '#9cb9ff',
    cyan: '#79e2d2',
    white: '#e6effa',
    brightBlack: '#7e9ac0',
    brightRed: '#fb4934',
    brightGreen: '#6fdbf0',
    brightYellow: '#fabd2f',
    brightBlue: '#4ea0ff',
    brightMagenta: '#9cb9ff',
    brightCyan: '#79e2d2',
    brightWhite: '#ffffff',
  };
}

function syncTerminalTheme() {
  if (!terminal) {
    return;
  }
  terminal.options.theme = getTerminalTheme();
}

function syncEditorTheme() {
  if (!editor || typeof monaco === 'undefined') {
    return;
  }
  monaco.editor.setTheme(
    currentTheme === 'light' ? 'cyberminds-light' : 'cyberminds-dark'
  );
}

/**
 * Initialize xterm, create backend session, and connect WebSocket stream.
 */
async function initTerminal() {
  updateStatus('connecting', 'Creating session...');
  const loadingElement = document.getElementById('loading');
  const loadingCaption = document.getElementById('loadingCaption');
  let hasReceivedTerminalOutput = false;

  try {
    terminal = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      theme: getTerminalTheme(),
    });

    fitAddon = new FitAddon.FitAddon();
    terminal.loadAddon(fitAddon);

    document.getElementById('terminal').style.display = 'block';
    terminal.open(document.getElementById('terminal'));
    fitAddon.fit();

    if (isMockTerminal) {
      seedMockWorkspace();
      sessionId = mockState.sessionId;
      ws = {
        readyState: WebSocket.OPEN,
        send: () => {},
        close: () => {
          ws.readyState = WebSocket.CLOSED;
        },
      };

      updateStatus('connected', 'Connected (mock)');
      if (loadingCaption) {
        loadingCaption.textContent = 'Mock session ready';
      }

      terminal.clear();
      mockWriteLine('\x1b[32mCyberMinds terminal mock mode enabled\x1b[0m');
      mockWriteLine('Backend requests are disabled for this session.');
      mockPrompt();
      hasReceivedTerminalOutput = true;
      loadingElement.classList.add('hidden');
      showToast('Mock terminal is active');

      terminal.onData((data) => {
        handleMockTerminalInput(data);
      });

      terminal.onResize(() => {
        if (fitAddon) {
          fitAddon.fit();
        }
      });

      window.addEventListener('resize', () => {
        if (fitAddon) {
          fitAddon.fit();
        }
      });

      startWorkspaceSync();
      window.addEventListener('beforeunload', () => {
        stopWorkspaceSync();
      });
      return;
    }

    const response = await fetch(`${apiOrigin}/api/session`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error('Failed to create session');
    }

    const data = await response.json();
    sessionId = data.sessionId;
    if (loadingCaption) {
      loadingCaption.textContent = 'Starting shell session...';
    }

    const wsUrl = `${getWsOrigin(apiOrigin)}/api/terminal/${sessionId}`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      terminal.clear();
      updateStatus('connected', 'Connected');
      if (loadingCaption) {
        loadingCaption.textContent = 'Connected. Waiting for shell prompt...';
      }
      sendResizeMessage();
      scheduleInitialResizeSync();
    };
    ws.onmessage = (event) => {
      if (!hasReceivedTerminalOutput) {
        hasReceivedTerminalOutput = true;
        loadingElement.classList.add('hidden');
      }
      terminal.write(event.data);
      handleCheckOutput(event.data);
    };
    ws.onerror = () => updateStatus('error', 'Connection error');
    ws.onclose = () => {
      updateStatus('error', 'Disconnected');
      terminal.write('\r\n\x1b[31mConnection closed\x1b[0m\r\n');
    };

    terminal.onData((data) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    terminal.onResize(() => {
      sendResizeMessage();
    });

    window.addEventListener('resize', () => {
      if (fitAddon) {
        fitAddon.fit();
        sendResizeMessage();
      }
    });

    startWorkspaceSync();

    window.addEventListener('beforeunload', () => {
      stopWorkspaceSync();
      if (sessionId && !isMockTerminal) {
        fetch(`${apiOrigin}/api/session/${sessionId}`, {
          method: 'DELETE',
          keepalive: true,
        });
      }
    });
  } catch (error) {
    console.error('Failed to initialize terminal:', error);
    updateStatus('error', 'Failed to create session');
    document.getElementById('loading').innerHTML = `
      <div class="loading-card">
        <div style="color: #fb4934; font-weight: 700; margin-bottom: 8px">
          Could not start terminal session
        </div>
        <div style="font-size: 12px; color: var(--fg3)">
          Refresh and try again in a few seconds.
        </div>
      </div>
    `;
  }
}

/**
 * Attach all UI event handlers (tabs, run/clear/check buttons).
 */
function handleGlobalShortcuts(event) {
  const isCmd = event.metaKey || event.ctrlKey;
  const code = event.code || '';
  const key = (event.key || '').toLowerCase();

  if (isCommandPaletteOpen) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeCommandPalette();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveCommandPaletteSelection(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveCommandPaletteSelection(-1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      executeSelectedCommandPaletteItem();
      return;
    }
  }

  if (!isCmd) {
    return;
  }

  if (code === 'KeyK' || key === 'k') {
    event.preventDefault();
    if (isCommandPaletteOpen) {
      closeCommandPalette();
    } else {
      openCommandPalette();
    }
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    document.getElementById('runBtn').click();
    showToast('Run shortcut used');
    return;
  }

  if (event.shiftKey && (code === 'KeyC' || key === 'c')) {
    event.preventDefault();
    document.getElementById('checkSolutionBtn').click();
    return;
  }

  if (event.shiftKey && (code === 'KeyL' || key === 'l')) {
    event.preventDefault();
    document.getElementById('clearBtn').click();
    return;
  }

  if (event.shiftKey && (code === 'KeyS' || key === 's')) {
    event.preventDefault();
    document.getElementById('loadStarterBtn').click();
  }
}

function attachUiHandlers() {
  document
    .getElementById('fileTabs')
    .addEventListener('click', (event) => {
      const tab = event.target.closest('.file-tab');
      if (!tab) {
        return;
      }

      if (tab.dataset.kind === 'workspace') {
        openWorkspaceFile(tab.dataset.path);
        return;
      }

      switchLanguage(tab.dataset.lang);
    });

  document.getElementById('runBtn').addEventListener('click', () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      showToast('Terminal not connected');
      return;
    }

    const code = editor.getValue();
    const filename =
      activeEditorFile.kind === 'workspace'
        ? activeEditorFile.path
        : templateFilenames[currentLang];

    if (isMockTerminal) {
      setMockFile(filename, code);
      const detectedLang =
        activeEditorFile.kind === 'workspace'
          ? detectLanguageFromPath(filename)
          : currentLang;
      let runLabel = runCommands[currentLang];
      if (activeEditorFile.kind === 'workspace') {
        if (detectedLang === 'python') {
          runLabel = `python3 ${filename}`;
        } else if (detectedLang === 'javascript') {
          runLabel = `node ${filename}`;
        } else if (detectedLang === 'java') {
          const className = getFilename(filename).replace(/\.java$/i, '');
          runLabel = `javac ${filename} && java ${className}`;
        } else if (detectedLang === 'go') {
          runLabel = `go run ${filename}`;
        } else {
          runLabel = filename;
        }
      }

      mockWriteLine(`$ ${runLabel}`);
      if (detectedLang === 'python') {
        mockWriteLine('CyberMinds terminal ready');
        mockWriteLine('[mock] Python execution simulated');
      } else if (detectedLang === 'javascript') {
        mockWriteLine('CyberMinds terminal ready');
        mockWriteLine('[mock] JavaScript execution simulated');
      } else if (detectedLang === 'java') {
        mockWriteLine('[mock] javac Hello.java && java Hello');
        mockWriteLine('CyberMinds terminal ready');
      } else if (detectedLang === 'go') {
        mockWriteLine('CyberMinds terminal ready');
        mockWriteLine('[mock] Go execution simulated');
      } else {
        mockWriteLine(
          `Saved ${filename}. No run command configured for this file type.`
        );
      }
      mockPrompt();
      syncWorkspaceFiles();
      return;
    }

    const delimiter = `CM_EOF_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    ws.send(
      `cat > ${shellQuote(filename)} << '${delimiter}'\n${code}\n${delimiter}\n`
    );

    setTimeout(() => {
      if (activeEditorFile.kind === 'workspace') {
        const detectedLang = detectLanguageFromPath(filename);
        if (detectedLang === 'python') {
          ws.send(`python3 ${shellQuote(filename)}\n`);
          return;
        }
        if (detectedLang === 'javascript') {
          ws.send(`node ${shellQuote(filename)}\n`);
          return;
        }
        if (detectedLang === 'java') {
          const className = getFilename(filename).replace(/\.java$/i, '');
          ws.send(`javac ${shellQuote(filename)} && java ${className}\n`);
          return;
        }
        if (detectedLang === 'go') {
          ws.send(`go run ${shellQuote(filename)}\n`);
          return;
        }
        ws.send(
          `echo \"Saved ${filename}. No run command configured for this file type.\"\n`
        );
        return;
      }

      ws.send(`${runCommands[currentLang]}\n`);
    }, 300);

    syncWorkspaceFiles();
  });

  document.getElementById('clearBtn').addEventListener('click', () => {
    if (terminal) {
      terminal.clear();
    }
  });

  document
    .getElementById('loadStarterBtn')
    .addEventListener('click', applyChallengeStarter);
  document
    .getElementById('copyCommandBtn')
    .addEventListener('click', copyFirstCommand);
  document
    .getElementById('checkSolutionBtn')
    .addEventListener('click', checkChallengeSolution);

  document
    .getElementById('themeToggleBtn')
    .addEventListener('click', () => {
      applyTheme(currentTheme === 'light' ? 'dark' : 'light');
    });

  document
    .getElementById('mobileChallengeBtn')
    .addEventListener('click', () => setMobileView('challenge'));
  document
    .getElementById('mobileEditorBtn')
    .addEventListener('click', () => setMobileView('editor'));
  document
    .getElementById('mobileTerminalBtn')
    .addEventListener('click', () => setMobileView('terminal'));

  const commandPaletteInput = document.getElementById('commandPaletteInput');
  const commandPaletteOverlay = document.getElementById(
    'commandPaletteOverlay'
  );

  commandPaletteInput.addEventListener('input', () => {
    commandPaletteSelectedIndex = 0;
    renderCommandPalette();
  });

  commandPaletteOverlay.addEventListener('click', (event) => {
    if (event.target === commandPaletteOverlay) {
      closeCommandPalette();
    }
  });

  // Capture phase avoids Monaco/xterm consuming shortcuts first.
  window.addEventListener('keydown', handleGlobalShortcuts, true);
}

/**
 * Initialize Monaco editor and apply CyberMinds theme.
 */
function initEditor() {
  require.config({
    paths: {
      vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs',
    },
  });

  require(['vs/editor/editor.main'], function () {
    monaco.editor.defineTheme('cyberminds-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: '', foreground: 'e6effa', background: '111a25' },
        { token: 'comment', foreground: '7e9ac0' },
        { token: 'keyword', foreground: '4ea0ff' },
        { token: 'string', foreground: '6fdbf0' },
        { token: 'number', foreground: 'fabd2f' },
        { token: 'type', foreground: '9cb9ff' },
      ],
      colors: {
        'editor.background': '#111a25',
        'editor.foreground': '#e6effa',
        'editor.lineHighlightBackground': '#182535',
        'editor.selectionBackground': '#2f4a67',
        'editorCursor.foreground': '#e6effa',
        'editorLineNumber.foreground': '#7e9ac0',
        'editorLineNumber.activeForeground': '#c8dbf3',
      },
    });

    monaco.editor.defineTheme('cyberminds-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: '', foreground: '17324f', background: 'f6f9ff' },
        { token: 'comment', foreground: '6683a6' },
        { token: 'keyword', foreground: '1757a6' },
        { token: 'string', foreground: '0b7f53' },
        { token: 'number', foreground: '996a00' },
        { token: 'type', foreground: '554ac2' },
      ],
      colors: {
        'editor.background': '#f6f9ff',
        'editor.foreground': '#17324f',
        'editor.lineHighlightBackground': '#e9f1fb',
        'editor.selectionBackground': '#cfe1f7',
        'editorCursor.foreground': '#17324f',
        'editorLineNumber.foreground': '#7f97b2',
        'editorLineNumber.activeForeground': '#3f5a79',
      },
    });

    editor = monaco.editor.create(document.getElementById('editor'), {
      value: codeSamples.python,
      language: 'python',
      theme:
        currentTheme === 'light'
          ? 'cyberminds-light'
          : 'cyberminds-dark',
      fontSize: 12,
      lineNumbers: 'on',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      padding: { top: 12, bottom: 12 },
    });

    editor.onDidChangeModelContent(() => {
      queueDraftSave();
    });

    switchLanguage('python');
    renderFileTabs();
    loadChallenge(activeChallengeId, false);
  });
}

loadTheme();
loadProgress();
normalizeActiveChallenge();
renderChallengeNav();
setMobileView('terminal');
attachUiHandlers();
initPanelResizers();
initEditor();
initTerminal();

window.addEventListener('resize', () => {
  if (window.innerWidth > 980) {
    document.body.classList.remove(
      'mobile-view-challenge',
      'mobile-view-editor',
      'mobile-view-terminal'
    );
    return;
  }
  setMobileView(activeMobileView);
});
