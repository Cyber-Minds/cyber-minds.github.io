/**
 * @file Keyboard shortcuts, UI event wiring, Monaco setup, and app boot sequence.
 */
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
    .addEventListener('click', () => applyChallengeStarter(true));
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

    const flushDraftOnExit = () => {
      flushDraftSave();
    };

    window.addEventListener('pagehide', flushDraftOnExit);
    window.addEventListener('beforeunload', flushDraftOnExit);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushDraftSave();
      }
    });

    switchLanguage('python', { persistCurrent: false });
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
