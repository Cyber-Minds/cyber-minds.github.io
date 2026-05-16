/**
 * @file Panel layout controls, runtime theming, and terminal session bootstrap.
 */
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
      ensureChallengeWorkspace(challengeCatalog[activeChallengeId]);
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
