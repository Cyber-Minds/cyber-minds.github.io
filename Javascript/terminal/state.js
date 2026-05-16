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

const logHuntSampleLog = [
  '# SYNTHETIC DATA - NOT FROM A REAL INCIDENT',
  'Jan 20 14:00:01 server sshd[1101]: Failed password for root from 192.168.1.45 port 51001 ssh2',
  'Jan 20 14:00:05 server sshd[1102]: Failed password for admin from 192.168.1.45 port 51002 ssh2',
  'Jan 20 14:00:09 server sshd[1103]: Failed password for ubuntu from 192.168.1.45 port 51003 ssh2',
  'Jan 20 14:00:14 server sshd[1104]: Failed password for root from 192.168.1.45 port 51004 ssh2',
  'Jan 20 14:00:18 server sshd[1105]: Failed password for pi from 192.168.1.45 port 51005 ssh2',
  'Jan 20 14:00:22 server sshd[1106]: Failed password for test from 192.168.1.45 port 51006 ssh2',
  'Jan 20 14:00:26 server sshd[1107]: Failed password for guest from 192.168.1.45 port 51007 ssh2',
  'Jan 20 14:00:31 server sshd[1108]: Failed password for user from 192.168.1.45 port 51008 ssh2',
  'Jan 20 14:00:35 server sshd[1109]: Failed password for admin from 192.168.1.45 port 51009 ssh2',
  'Jan 20 14:00:39 server sshd[1110]: Failed password for root from 192.168.1.45 port 51010 ssh2',
  'Jan 20 14:00:43 server sshd[1111]: Failed password for deploy from 192.168.1.45 port 51011 ssh2',
  'Jan 20 14:00:47 server sshd[1112]: Failed password for root from 192.168.1.45 port 51012 ssh2',
  'Jan 20 14:01:05 server sshd[1201]: Failed password for root from 10.0.0.12 port 52001 ssh2',
  'Jan 20 14:01:33 server sshd[1202]: Failed password for admin from 10.0.0.12 port 52002 ssh2',
  'Jan 20 14:02:07 server sshd[1203]: Failed password for ubuntu from 10.0.0.12 port 52003 ssh2',
  'Jan 20 14:02:41 server sshd[1204]: Failed password for root from 10.0.0.12 port 52004 ssh2',
  'Jan 20 14:03:10 server sshd[1205]: Failed password for test from 10.0.0.12 port 52005 ssh2',
  'Jan 20 14:03:22 server sshd[1206]: Failed password for pi from 10.0.0.12 port 52006 ssh2',
  'Jan 20 14:05:10 server sshd[1301]: Failed password for root from 172.16.0.99 port 53001 ssh2',
  'Jan 20 14:05:45 server sshd[1302]: Failed password for admin from 172.16.0.99 port 53002 ssh2',
  'Jan 20 14:06:03 server sshd[1303]: Failed password for ubuntu from 172.16.0.99 port 53003 ssh2',
  'Jan 20 14:10:00 server sshd[1401]: Accepted password for deploy from 10.0.50.1 port 43210 ssh2',
].join('\n');

const logHuntSetupScript = [
  "cat > /workspace/sample.log <<'CM_LOG_HUNT_SAMPLE'",
  logHuntSampleLog,
  'CM_LOG_HUNT_SAMPLE',
].join('\n');

const logHuntCheckScript = [
  "python3 - <<'CM_LOG_HUNT_CHECK'",
  'import re, sys',
  'try:',
  '    with open("/workspace/findings.txt") as f:',
  '        content = f.read()',
  'except Exception:',
  '    print("FAIL: cannot read findings.txt")',
  '    sys.exit(1)',
  'if not content.strip():',
  '    print("FAIL: findings.txt is empty")',
  '    sys.exit(1)',
  'if "192.168.1.45" not in content:',
  '    print("FAIL: top offending IP 192.168.1.45 not identified")',
  '    sys.exit(1)',
  'm = re.search(r"(\\d+)\\s+192\\.168\\.1\\.45", content)',
  'if not m or int(m.group(1)) < 10:',
  '    print("FAIL: include the attempt count for 192.168.1.45")',
  '    sys.exit(1)',
  'if not re.search(r"failed|attempt|auth|spike|brute", content, re.I):',
  '    print("FAIL: add an incident summary mentioning the attack type")',
  '    sys.exit(1)',
  'print("PASS")',
  'CM_LOG_HUNT_CHECK',
].join('\n');

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
    starterCode: [
      '# Linux Basics Warmup — starter',
      '# Run the commands below in the terminal, then write your findings to report.txt.',
      '#',
      '# STEP 1: Run these in the terminal panel:',
      '#   pwd',
      '#   whoami',
      '#   ls -la',
      '#',
      '# STEP 2: Write your summary to report.txt. Examples:',
      '#',
      '#   VALID (passes the checker):',
      '#     echo "owner: cyberminds, group: staff, perms: 0755" > report.txt',
      '#     echo "user is cyberminds, group is root" > report.txt',
      '#     echo "permission: drwxr-xr-x, owner: root" > report.txt',
      '#',
      '#   INVALID (will fail the checker):',
      '#     echo "hello world" > report.txt        <- no ownership keyword',
      '#     echo "the directory exists" > report.txt  <- no ownership keyword',
      '#',
      '# STEP 3: Click Check Solution to validate.',
      '',
      'import os, pwd, grp, stat',
      '',
      'cwd   = os.getcwd()',
      'info  = os.stat(cwd)',
      'owner = pwd.getpwuid(info.st_uid).pw_name',
      'group = grp.getgrgid(info.st_gid).gr_name',
      'perms = oct(stat.S_IMODE(info.st_mode))',
      '',
      'print(f"Directory  : {cwd}")',
      'print(f"Owner      : {owner}")',
      'print(f"Group      : {group}")',
      'print(f"Permissions: {perms}")',
      'print()',
      'print("Now write this to report.txt in the terminal:")',
      'print(f\'echo "owner: {owner}, group: {group}, perms: {perms}" > report.txt\')',
    ].join('\n'),
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
  'log-hunt': {
    title: 'Log Hunt: Failed Auth Spike',
    difficulty: 'Intermediate',
    description: 'Analyse a server authentication log to identify a brute-force spike and rank the top offending source IPs.',
    objective: 'Use grep, sort, and uniq to extract and rank offending IPs from /workspace/sample.log. Record the ranked IP list and a one-line incident summary in findings.txt.',
    steps: [
      'Run grep "Failed" /workspace/sample.log | awk \'{print $11}\' | sort | uniq -c | sort -rn to rank IPs by attempt count.',
      'Identify the top offending IP and confirm its attempt count.',
      'Write the ranked IP list to findings.txt.',
      'Add a one-line incident summary describing the attack (e.g. brute-force, auth spike).',
      'Click Check Solution to validate.',
    ],
    firstCommand: 'grep "Failed" /workspace/sample.log | wc -l',
    setupScript: logHuntSetupScript,
    checkScript: logHuntCheckScript,
    starterLang: 'python',
    starterCode: `# Log Hunt: Failed Auth Spike — starter\nfrom collections import Counter\n\nwith open('/workspace/sample.log') as f:\n    lines = [l for l in f if 'Failed' in l and not l.startswith('#')]\n\nips = []\nfor line in lines:\n    parts = line.split()\n    try:\n        idx = parts.index('from')\n        ips.append(parts[idx + 1])\n    except (ValueError, IndexError):\n        pass\n\nfor ip, count in Counter(ips).most_common():\n    print(f'{count:4d}  {ip}')\n\n# Write to findings.txt when ready:\n# with open('/workspace/findings.txt', 'w') as out:\n#     for ip, count in Counter(ips).most_common():\n#         out.write(f'{count:4d}  {ip}\\n')\n#     out.write('Summary: brute-force auth spike from 192.168.1.45\\n')\n`,
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

if (!challengeCatalog[activeChallengeId]) {
  activeChallengeId = challengeOrder[0];
}
