/**
 * @file Shared runtime state and static configuration for the terminal frontend.
 *
 * Defines mutable UI/session state, API origin resolution, starter templates,
 * and challenge metadata used by `mock.js` and `app.js`.
 */
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
  go: 'go run hello.go',
};

const templateFilenames = {
  python: 'hello.py',
  javascript: 'hello.js',
  java: 'Hello.java',
  go: 'hello.go',
};

const challengeCatalog = {
  'linux-basics': {
    title: 'Linux Basics Warmup',
    difficulty: 'Beginner',
    description: 'Get comfortable with directories, files, and basic shell commands before timed CTF tasks.',
    objective: 'List files, inspect permissions, and create a short report in report.txt.',
    steps: [
      'Run pwd, whoami, and ls -la.',
      'Create challenge-notes and add a file named report.txt.',
      'Write one line summarizing current directory ownership.',
    ],
    firstCommand: 'pwd',
    checkScript: 'set -e; test -f report.txt; test -s report.txt; grep -Eqi "(owner|permission|user|group)" report.txt',
    starterLang: 'python',
    starterCode: `import os\n\nprint("Current directory:", os.getcwd())\nprint("Directory listing:")\nfor name in sorted(os.listdir(".")):\n    print("-", name)\n`,
  },
  'web-recon': {
    title: 'Web Recon Starter',
    difficulty: 'Beginner',
    description: 'Practice recon workflows: check open ports and inspect HTTP response headers safely.',
    objective: 'Identify exposed services and capture response headers into notes.',
    steps: [
      'Run ss -tulpen to inspect listening services.',
      'Use curl -I against a target URL.',
      'Record key headers and suspected tech stack.',
    ],
    firstCommand: 'ss -tulpen',
    checkScript: 'set -e; test -f recon-notes.txt; test -s recon-notes.txt; grep -Eqi "(server|content-type|status|header|port)" recon-notes.txt',
    starterLang: 'javascript',
    starterCode: `const http = require('http');\n\nhttp.get('http://example.com', (res) => {\n  console.log('Status:', res.statusCode);\n  console.log('Headers:', res.headers);\n});\n`,
  }
};

/**
 * UPDATED: Loop to generate 10 identical Log Hunt subsections with grouping metadata.
 * These will be accessible via keys like 'log-hunt-1', 'log-hunt-2', etc.
 */
for (let i = 1; i <= 10; i++) {
  const taskId = `log-hunt-${i}`;
  challengeCatalog[taskId] = {
    title: `Task ${i}`,            // Shortened so the UI reads neatly inside the dropdown
    groupId: 'log-hunt-group',     // NEW: Identifies which group this belongs to
    groupTitle: 'Log Hunt',        // NEW: The text for the parent dropdown button
    difficulty: 'Intermediate',
    description: 'Use grep, awk, and sorting to identify suspicious events from logs.',
    objective: 'Find top suspicious IPs from sample logs and summarize findings.',
    steps: [
      'Create sample.log with repeated test entries.',
      'Filter for failed login patterns.',
      'Sort and count source IP occurrences.',
    ],
    firstCommand: 'grep -i "failed" sample.log',
    checkScript: 'set -e; test -f sample.log; grep -Eqi "failed|error|denied" sample.log',
    starterLang: 'python',
    starterCode: `from collections import Counter\n\nips = [\n    "10.0.0.2", "10.0.0.2", "192.168.1.7", "10.0.0.2", "192.168.1.7"\n]\nfor ip, count in Counter(ips).most_common():\n    print(ip, count)\n`,
  };
}

// Re-calculate order and set active challenge
const challengeOrder = Object.keys(challengeCatalog);
let activeChallengeId = query.get('challenge') || challengeOrder[0];

// If the URL has an old "log-hunt" ID, redirect it to "log-hunt-1"
if (activeChallengeId === 'log-hunt') {
    activeChallengeId = 'log-hunt-1';
}

if (!challengeCatalog[activeChallengeId]) {
  activeChallengeId = challengeOrder[0];
}