/**
 * @file Mock terminal engine for offline/local demo mode.
 *
 * Supports a constrained command surface (`pwd`, `ls`, `cat`, `grep`, `echo >`)
 * and emulates a writable `/workspace` used by challenge checks.
 */
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
  if (!hasMockFile('sample.log') && typeof logHuntSampleLog === 'string') {
    setMockFile('sample.log', `${logHuntSampleLog}\n`);
  }
  if (!hasMockFile('beacon-report.txt')) {
    setMockFile('beacon-report.txt', '');
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
    mockWriteLine('tcp   LISTEN 0      511    0.0.0.0:9090');
    return;
  }

  if (trimmed.startsWith('curl -I ')) {
    mockWriteLine('HTTP/1.1 200 OK');
    mockWriteLine('server: nginx/1.24.0');
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
