/**
 * @file Workspace file synchronization and PTY sizing helpers.
 */
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
