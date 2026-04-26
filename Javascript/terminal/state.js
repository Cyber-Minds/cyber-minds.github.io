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
const MAX_WORKSPACE_FILE_TABS = 200;

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
    objective: 'Run pwd, whoami, and ls -la. Then create report.txt with a one-line ownership summary of the current directory.',
    steps: [
      'Run pwd to print your current working directory.',
      'Run whoami to confirm your current user.',
      'Run ls -la to list all files with permissions and ownership.',
      'Create report.txt and write one line summarising the owner/group/permissions you observed.',
      'Click Check Solution to validate.',
    ],
    firstCommand: 'pwd',
    checkScript: 'set -e; test -f report.txt; test -s report.txt; grep -Eqi "(owner|permission|user|group)" report.txt',
    starterLang: 'python',
    starterCode: `# Linux Basics Warmup — starter\n# Run this to preview what the shell commands return.\nimport os, pwd, grp, stat\n\ncwd = os.getcwd()\ninfo = os.stat(cwd)\nowner = pwd.getpwuid(info.st_uid).pw_name\ngroup = grp.getgrgid(info.st_gid).gr_name\nperms = oct(stat.S_IMODE(info.st_mode))\n\nprint(f"Directory : {cwd}")\nprint(f"Owner     : {owner}")\nprint(f"Group     : {group}")\nprint(f"Permissions: {perms}")\n\n# When you're ready, write your summary to report.txt:\n# echo "owner: <name>, group: <group>, perms: <perms>" > report.txt\n`,
  },
  'web-recon': {
    title: 'Web Recon Starter',
    difficulty: 'Beginner',
    description: 'Practice recon workflows: check open ports and inspect HTTP response headers safely.',
    objective: 'Identify the local nginx service on port 9090, capture its response headers (including X-Powered-By and X-Application), and record findings in recon-notes.txt.',
    steps: [
      'Run ss -tulpen to inspect listening services.',
      'Run curl -I http://localhost:9090 and observe the response headers.',
      'Note the PHP version from X-Powered-By and the app name from X-Application.',
      'Record the port, at least one standard header, the PHP version, and the portal name in recon-notes.txt.',
    ],
    firstCommand: 'ss -tulpen',
    checkScript: [
      'set -e',
      'test -f recon-notes.txt',
      'test -s recon-notes.txt',
      'grep -Eqi "(server|content-type|status|header)" recon-notes.txt',
      'grep -Eq "(^|[^0-9])9090([^0-9]|$)" recon-notes.txt',
      'grep -Eqi "php[/ ]?7" recon-notes.txt',
      'grep -Eqi "internal.?portal" recon-notes.txt',
    ].join('; '),
    starterLang: 'javascript',
    starterCode: `const http = require('http');\n\nhttp.get('http://localhost:9090', (res) => {\n  console.log('Status:', res.statusCode);\n  console.log('Headers:', res.headers);\n});\n`,
  },
  'priv-esc': {
    title: 'Privilege Escalation Trace',
    difficulty: 'Intermediate',
    description: 'Analyse authentication and sudo logs to trace how an attacker moved from a low-privilege SSH session to root.',
    objective: 'Identify the escalating user, the exact timestamp of privilege escalation, and the escalation method (su). Record findings in priv-esc-report.txt.',
    steps: [
      'Read /workspace/auth.log to find the SSH login event for the attacker.',
      'Read /workspace/sudo.log to find the privilege escalation event.',
      'Identify the username, the timestamp (HH:MM), and the escalation method (su).',
      'Write a summary to priv-esc-report.txt including all three findings.',
      'Click Check Solution to validate.',
    ],
    firstCommand: 'cat /workspace/auth.log',
    checkScript: 'python3 /workspace/check-priv-esc.py',
    starterLang: 'python',
    starterCode: `# Read and analyse the auth log\nwith open('/workspace/auth.log') as f:\n    for line in f:\n        if 'Accepted' in line or 'su for root' in line:\n            print(line.strip())\n`,
  },
  'incident-timeline': {
    title: 'Incident Timeline Reconstruction',
    difficulty: 'Intermediate',
    description: 'Correlate SSH, HTTP access, and syslog events to reconstruct the full timeline of a simulated intrusion.',
    objective: 'Use provided synthetic event data to produce a chronological timeline in timeline.txt with at least 8 entries (HH:MM:SS format, ascending, no duplicates).',
    steps: [
      'Run the starter script to inspect synthetic SSH/HTTP/syslog events.',
      'Correlate events across sources by timestamp.',
      'Write a chronological timeline to timeline.txt — one event per line, each starting with HH:MM:SS.',
      'Include at least 8 events covering both SSH and HTTP activity.',
      'Click Check Solution to validate.',
    ],
    firstCommand: 'python3 hello.py',
    checkScript: [
      'set -e',
      'test -f timeline.txt',
      'test -s timeline.txt',
      "awk 'NF{print $1}' timeline.txt > /tmp/cm_timestamps.txt",
      'test "$(wc -l < /tmp/cm_timestamps.txt)" -ge 8',
      "if grep -Evq '^[0-9]{2}:[0-9]{2}:[0-9]{2}$' /tmp/cm_timestamps.txt; then echo 'FAIL: invalid timestamp format'; exit 1; fi",
      'sort /tmp/cm_timestamps.txt | uniq > /tmp/cm_timestamps_sorted.txt',
      'cmp -s /tmp/cm_timestamps.txt /tmp/cm_timestamps_sorted.txt',
      "grep -Eqi '(ssh|login|accept)' timeline.txt",
      "grep -Eqi '(http|get|post|request)' timeline.txt",
    ].join('; '),
    starterLang: 'python',
    starterCode: `import re\n\nDATASETS = {\n    'auth': [\n        'Jan 20 03:10:14 sshd: Failed password for admin from 192.168.50.22',\n        'Jan 20 03:10:29 sshd: Failed password for admin from 192.168.50.22',\n        'Jan 20 03:10:47 sshd: Accepted password for admin from 192.168.50.22',\n        'Jan 20 03:10:48 sshd: session opened for user admin',\n        'Jan 20 03:12:05 sshd: session closed for user admin',\n    ],\n    'access': [\n        '03:10:50 GET /login HTTP/1.1 200',\n        '03:11:02 POST /login HTTP/1.1 302',\n        '03:11:05 GET /admin HTTP/1.1 200',\n        '03:11:33 GET /admin/export HTTP/1.1 200',\n        '03:12:01 GET /logout HTTP/1.1 200',\n    ],\n    'syslog': [\n        'Jan 20 03:10:47 audit: user admin logged in from 192.168.50.22',\n        'Jan 20 03:11:33 audit: file /var/data/export.csv accessed by admin',\n        'Jan 20 03:11:34 audit: 20480 bytes read from /var/data/export.csv',\n        'Jan 20 03:12:05 audit: user admin session terminated',\n    ],\n}\n\nTS_RE = re.compile(r'\\b(\\d{2}:\\d{2}:\\d{2})\\b')\nevents = []\nfor lines in DATASETS.values():\n    for line in lines:\n        m = TS_RE.search(line)\n        if m:\n            events.append((m.group(1), line))\n\nfor ts, event in sorted(events):\n    print(f'{ts} {event}')\n`,
  },
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
