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
let pythonWorker;
let pythonRequestId = 0;
const pendingPythonRuns = new Map();
let commandRunning = false;
let queuedTerminalInput = '';

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
  mockWrite(`cyberminds@workspace:${mockState.cwd}$ `);
}

function getPythonWorker() {
  if (pythonWorker) return pythonWorker;
  pythonWorker = new Worker(
    new URL('../../Javascript/terminal/python-worker.js', window.location.href),
    { type: 'module' }
  );
  pythonWorker.onmessage = ({ data }) => {
    const pending = pendingPythonRuns.get(data.id);
    if (!pending) return;
    if (data.ready) {
      window.clearTimeout(pending.timeout);
      pending.timeout = window.setTimeout(() => {
        pendingPythonRuns.delete(data.id);
        pythonWorker?.terminate();
        pythonWorker = null;
        pending.reject(new Error('Python program exceeded the 15 second time limit'));
      }, 15000);
      return;
    }
    window.clearTimeout(pending.timeout);
    pendingPythonRuns.delete(data.id);
    if (data.files) {
      Object.entries(data.files).forEach(([path, content]) => setMockFile(path, content));
    }
    if (data.error) pending.reject(new Error(data.error));
    else pending.resolve(data.output || '');
    syncWorkspaceFiles();
  };
  pythonWorker.onerror = (event) => {
    pendingPythonRuns.forEach((pending) => {
      window.clearTimeout(pending.timeout);
      pending.reject(new Error(event.message || 'Python runtime failed'));
    });
    pendingPythonRuns.clear();
    pythonWorker.terminate();
    pythonWorker = null;
  };
  return pythonWorker;
}

function runPython(code) {
  const id = ++pythonRequestId;
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      pendingPythonRuns.delete(id);
      pythonWorker?.terminate();
      pythonWorker = null;
      reject(new Error('Python runtime took too long to start'));
    }, 90000);
    pendingPythonRuns.set(id, { resolve, reject, timeout });
    try {
      getPythonWorker().postMessage({ id, code, files: mockState.files });
    } catch (error) {
      window.clearTimeout(timeout);
      pendingPythonRuns.delete(id);
      reject(error);
    }
  });
}

async function runPythonCommand(args) {
  let code = '';
  if (args[0] === '-c' && args[1]) {
    code = args.slice(1).join(' ');
  } else {
    const filePath = args.find((arg) => arg.endsWith('.py'));
    if (filePath && hasMockFile(filePath)) {
      code = getMockFile(filePath);
    } else if (filePath) {
      mockWriteLine(`python3: can't open file '${filePath}': No such file or directory`);
      return;
    }
  }

  if (!code) {
    mockWriteLine('usage: python3 <file.py> | python3 -c <code>');
    return;
  }

  try {
    const output = await runPython(code);
    if (output) mockWrite(output.replace(/\n/g, '\r\n'));
  } catch (error) {
    mockWriteLine(`Python error: ${error.message}`);
  }
}

// Keep the shell deliberately small and data-only: no browser command can run
// arbitrary host commands, open sockets, or access files outside this virtual
// workspace.
function splitMockArgs(input) {
  return (input.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [])
    .map((arg) => arg.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, '$1$2'));
}

function getCurlOptions(args) {
  const options = {
    head: false,
    includeHeaders: false,
    output: null,
    silent: false,
  };
  const positionals = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '-I' || arg === '--head') options.head = true;
    else if (arg === '-L' || arg === '--location') continue;
    else if (arg === '-i' || arg === '--include') options.includeHeaders = true;
    else if (arg === '-s' || arg === '--silent') options.silent = true;
    else if (arg === '-o' || arg === '--output') {
      options.output = args[index + 1] || null;
      index += 1;
    } else if (arg.startsWith('-') && /^-[a-zA-Z]+$/.test(arg)) {
      if (arg.includes('I')) options.head = true;
      if (arg.includes('i')) options.includeHeaders = true;
      if (arg.includes('s')) options.silent = true;
      if ([...arg.slice(1)].some((flag) => !'IisSL'.includes(flag))) {
        options.error = `curl: unknown option ${arg}`;
      }
    } else if (arg.startsWith('-')) {
      options.error = `curl: unknown option ${arg}`;
    } else {
      positionals.push(arg);
    }
  }
  options.url = positionals[0] || '';
  return options;
}

function getCurlHelp() {
  return [
    'Usage: curl [options...] <url>',
    ' -I, --head       Fetch headers only',
    ' -i, --include    Include response headers in output',
    ' -L, --location   Follow redirects',
    ' -o, --output FILE  Save response body to a workspace file',
    ' -s, --silent     Suppress error details',
    ' -h, --help       Display this help',
    'Supports HTTP and HTTPS URLs allowed by the browser.',
  ].join('\n');
}

function formatCurlHeaders(response) {
  const lines = [`HTTP/2 ${response.status} ${response.statusText}`];
  response.headers.forEach((value, key) => lines.push(`${key}: ${value}`));
  return lines.join('\n');
}

function runLessonServiceCurl(url, options) {
  if (url.hostname !== 'localhost' || url.port !== '9090') return false;
  const headers = [
    'HTTP/1.1 200 OK',
    'server: nginx/1.24.0',
    'content-type: text/html; charset=utf-8',
    'x-powered-by: PHP/7.4.3',
    'x-application: InternalPortal/2.1',
  ].join('\n');
  const body = '<!doctype html><title>Internal Portal</title>\n<h1>InternalPortal - Employee Dashboard</h1>';
  const output = [options.includeHeaders || options.head ? headers : '', options.head ? '' : body]
    .filter(Boolean)
    .join('\n');
  if (options.output) {
    setMockFile(options.output, options.head ? '' : body);
    syncWorkspaceFiles();
    if (!options.silent) mockWriteLine(`Saved ${options.head ? 0 : body.length} characters to ${options.output}`);
  } else if (output) {
    mockWrite(`${output.replace(/\n/g, '\r\n')}\r\n`);
  }
  return true;
}

async function readCurlBody(response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  let byteCount = 0;
  const maxBytes = 128 * 1024;
  while (byteCount < maxBytes) {
    // Stream reads are ordered; each chunk is required before the next read.
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = value.subarray(0, maxBytes - byteCount);
    chunks.push(decoder.decode(chunk, { stream: true }));
    byteCount += chunk.byteLength;
    if (chunk.byteLength < value.byteLength) {
      // eslint-disable-next-line no-await-in-loop
      await reader.cancel();
      chunks.push('\n[curl: output truncated at 128 KiB]\n');
      break;
    }
  }
  chunks.push(decoder.decode());
  return chunks.join('');
}

async function runCurl(args) {
  if (args.includes('--help') || args.includes('-h')) {
    mockWrite(`${getCurlHelp().replace(/\n/g, '\r\n')}\r\n`);
    return;
  }
  const options = getCurlOptions(args);
  if (options.error) {
    mockWriteLine(options.error);
    return;
  }
  if (!options.url) {
    mockWriteLine('curl: no URL specified');
    return;
  }

  const rawUrl = /^[a-z][a-z\d+.-]*:/i.test(options.url)
    ? options.url
    : `https://${options.url}`;
  let url;
  try {
    url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('unsupported URL');
    }
  } catch {
    mockWriteLine(`curl: (3) URL rejected: ${options.url}`);
    return;
  }

  if (runLessonServiceCurl(url, options)) return;

  try {
    const response = await fetch(url, {
      method: options.head ? 'HEAD' : 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'follow',
    });
    const headers = formatCurlHeaders(response);
    const body = options.head ? '' : await readCurlBody(response);
    const output = [options.includeHeaders || options.head ? headers : '', body]
      .filter(Boolean)
      .join('\n');
    if (options.output) {
      setMockFile(options.output, body);
      syncWorkspaceFiles();
      if (!options.silent) mockWriteLine(`Saved ${body.length} characters to ${options.output}`);
      return;
    }
    if (output) mockWrite(`${output.replace(/\n/g, '\r\n')}\r\n`);
    if (!response.ok && !options.silent) {
      mockWriteLine(`curl: (22) The requested URL returned error: ${response.status}`);
    }
  } catch (error) {
    mockWriteLine(`curl: (6) Could not retrieve ${url.host}: ${error.message}`);
  }
}

function runMockPipeline(source) {
  let command = source.trim();
  const redirect = command.match(/\s(>>?)\s*([^\s]+)\s*$/);
  if (redirect) command = command.slice(0, redirect.index).trim();
  const stages = command.split(/\s*\|\s*/);
  if (stages.length < 2) return null;

  let output = '';
  for (const stage of stages) {
    const [name, ...args] = splitMockArgs(stage);
    if (name === 'cat') {
      output = getMockFile(args[0]) || '';
    } else if (name === 'grep') {
      const flags = args.filter((arg) => arg.startsWith('-')).join('');
      const operands = args.filter((arg) => !arg.startsWith('-'));
      const pattern = operands[0] || '';
      const file = operands[1];
      const input = file ? getMockFile(file) || '' : output;
      let expression;
      try {
        expression = new RegExp(pattern, flags.includes('i') ? 'i' : '');
      } catch {
        mockWriteLine(`grep: invalid pattern: ${pattern}`);
        return '';
      }
      const matches = input.split(/\r?\n/).filter((line) => expression.test(line));
      output = flags.includes('o')
        ? matches.flatMap((line) => line.match(expression) || []).join('\n')
        : matches.join('\n');
    } else if (name === 'awk') {
      const script = args[0] || '';
      const fieldMatch = script.match(/\$(\d+|NF)/);
      if (!fieldMatch) {
        mockWriteLine('awk: browser simulation supports field-print expressions');
        return '';
      }
      const field = fieldMatch[1];
      output = output.split(/\r?\n/).filter(Boolean).map((line) => {
        const columns = line.trim().split(/\s+/);
        return columns[field === 'NF' ? columns.length - 1 : Number(field) - 1] || '';
      }).join('\n');
    } else if (name === 'sort') {
      const lines = output.split(/\r?\n/).filter(Boolean);
      output = args.includes('-n') || args.includes('-rn')
        ? lines.sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0))
          .join('\n')
        : lines.sort((a, b) => a.localeCompare(b)).join('\n');
      if (args.includes('-r') || args.includes('-rn')) {
        output = output.split('\n').reverse().join('\n');
      }
    } else if (name === 'uniq') {
      const lines = output.split(/\r?\n/).filter(Boolean);
      const counts = [];
      lines.forEach((line) => {
        const last = counts[counts.length - 1];
        if (last && last.line === line) last.count += 1;
        else counts.push({ line, count: 1 });
      });
      output = args.includes('-c')
        ? counts.map(({ line, count }) => `${String(count).padStart(7)} ${line}`).join('\n')
        : counts.map(({ line }) => line).join('\n');
    } else if (name === 'wc' && args.includes('-l')) {
      output = String(output.split(/\r?\n/).filter(Boolean).length);
    } else {
      mockWriteLine(`bash: ${name || stage}: command not found`);
      return '';
    }
  }

  if (redirect) {
    const target = normalizeMockPath(redirect[2]);
    const previous = getMockFile(target) || '';
    setMockFile(target, `${redirect[1] === '>>' ? previous : ''}${output}\n`);
    return '';
  }
  return output;
}

async function runMockCommand(command) {
  const trimmed = command.trim();
  if (!trimmed) {
    return;
  }

  const pipelineOutput = runMockPipeline(trimmed);
  if (pipelineOutput !== null) {
    if (pipelineOutput) mockWrite(`${pipelineOutput.replace(/\n/g, '\r\n')}\r\n`);
    return;
  }

  if (trimmed === 'clear') {
    terminal.clear();
    return;
  }

  if (trimmed === 'help') {
    mockWriteLine('Available commands: pwd, whoami, ls, cat, touch, echo, grep, awk, sort, uniq, wc, ss, curl, python3, clear');
    return;
  }

  const [commandName, ...commandArgs] = splitMockArgs(trimmed);
  if (commandName === 'python3' || commandName === 'python') {
    await runPythonCommand(commandArgs);
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

  const grepMatch = trimmed.match(/^grep\s+(.+?)\s+(.+)$/);
  if (grepMatch) {
    const args = splitMockArgs(grepMatch[1]);
    const pattern = args.filter((arg) => !arg.startsWith('-')).pop() || '';
    const flags = args.filter((arg) => arg.startsWith('-')).join('');
    const expression = new RegExp(pattern, flags.includes('i') ? 'i' : '');
    const content = getMockFile(grepMatch[2]) || '';
    content.split(/\r?\n/)
      .filter((line) => expression.test(line))
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
    mockWriteLine('mkdir: directories are not needed in the challenge workspace');
    return;
  }

  if (trimmed.startsWith('ss -tulpen')) {
    mockWriteLine('Netid State  Recv-Q Send-Q Local Address:Port');
    mockWriteLine('tcp   LISTEN 0      128    0.0.0.0:22');
    mockWriteLine('tcp   LISTEN 0      4096   0.0.0.0:443');
    mockWriteLine('tcp   LISTEN 0      511    0.0.0.0:9090');
    return;
  }

  if (commandName === 'curl') {
    await runCurl(commandArgs);
    return;
  }

  mockWriteLine(`bash: ${splitMockArgs(trimmed)[0] || trimmed}: command not found`);
}

function finishMockCommand() {
  syncWorkspaceFiles();
  mockPrompt();
  commandRunning = false;
  if (queuedTerminalInput) {
    const queued = queuedTerminalInput;
    queuedTerminalInput = '';
    handleMockTerminalInput(queued);
  }
}

function handleMockTerminalInput(data) {
  if (commandRunning) {
    queuedTerminalInput += data;
    return;
  }

  for (let index = 0; index < data.length; index += 1) {
    const ch = data[index];
    if (ch === '\r') {
      mockWrite('\r\n');
      const command = mockState.inputBuffer;
      mockState.inputBuffer = '';
      commandRunning = true;
      queuedTerminalInput += data.slice(index + 1);
      Promise.resolve(runMockCommand(command))
        .catch((error) => mockWriteLine(`Command error: ${error.message}`))
        .finally(finishMockCommand);
      return;
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
