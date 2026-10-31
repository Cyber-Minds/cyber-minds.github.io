/* Run learner Python in an isolated worker with a virtual /workspace. */
const PYODIDE_VERSION = '314.0.7';
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
let pyodidePromise;

async function getPyodide() {
  if (!pyodidePromise) {
    pyodidePromise = import(`${PYODIDE_URL}pyodide.mjs`)
      .then(({ loadPyodide }) => loadPyodide({ indexURL: PYODIDE_URL }))
      .then((pyodide) => {
      pyodide.FS.mkdir('/workspace');
      // Python code has no DOM or network access; the worker only returns text
      // and workspace files to the terminal UI.
      globalThis.fetch = () => Promise.reject(new Error('Network access is disabled'));
      globalThis.XMLHttpRequest = undefined;
      globalThis.WebSocket = undefined;
      globalThis.EventSource = undefined;
      globalThis.importScripts = undefined;
      return pyodide;
      });
  }
  return pyodidePromise;
}

self.onmessage = async ({ data }) => {
  const output = [];
  try {
    const pyodide = await getPyodide();
    for (const [path, content] of Object.entries(data.files || {})) {
      if (!/^[\w.-]+$/.test(path)) continue;
      pyodide.FS.writeFile(`/workspace/${path}`, String(content));
    }
    pyodide.setStdout({ batched: (text) => output.push(text) });
    pyodide.setStderr({ batched: (text) => output.push(text) });
    await pyodide.runPythonAsync("import os, sys\nos.chdir('/workspace')\nsys.path.insert(0, '/workspace')");
    self.postMessage({ id: data.id, ready: true });
    await pyodide.runPythonAsync(data.code);

    const files = {};
    for (const name of pyodide.FS.readdir('/workspace')) {
      if (name === '.' || name === '..') continue;
      try {
        files[name] = pyodide.FS.readFile(`/workspace/${name}`, { encoding: 'utf8' });
      } catch {
        // Directories and non-text files are outside the course workspace contract.
      }
    }
    self.postMessage({ id: data.id, output: output.join(''), files });
  } catch (error) {
    self.postMessage({ id: data.id, output: output.join(''), error: error.message });
  }
};
