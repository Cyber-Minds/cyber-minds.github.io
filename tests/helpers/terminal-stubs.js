// @ts-check
/**
 * Shared CDN stubs for terminal page tests.
 *
 * The terminal loads xterm, the xterm fit addon, and the Monaco loader from
 * jsdelivr. Tests stub all three so a suite run never depends on CDN
 * availability and so the editor/terminal expose predictable handles
 * (`window.__cybermindsMonacoEditor`) for assertions.
 *
 * Not named `*.spec.js` on purpose: playwright.config.js matches that glob,
 * and this file holds no tests.
 */

const XTERM_STUB = `
window.Terminal = class Terminal {
  constructor(options = {}) {
    this.options = options;
    this.cols = 80;
    this.rows = 24;
    this.element = null;
    this.dataHandlers = [];
  }
  loadAddon() {}
  open(element) {
    this.element = element;
    if (this.element) this.element.textContent = '';
  }
  write(text) {
    if (!this.element) return;
    this.element.textContent += String(text).replace(/\\x1b\\[[0-9;]*m/g, '');
  }
  clear() {
    if (this.element) this.element.textContent = '';
  }
  onData(handler) {
    this.dataHandlers.push(handler);
    return { dispose() {} };
  }
  onResize() {
    return { dispose() {} };
  }
};
`;

const FIT_ADDON_STUB = `
window.FitAddon = {
  FitAddon: class FitAddon {
    fit() {}
  },
};
`;

const MONACO_LOADER_STUB = `
window.monaco = {
  editor: {
    defineTheme() {},
    setTheme() {},
    setModelLanguage(model, language) {
      if (model) model.language = language;
    },
    create(element, options = {}) {
      let value = String(options.value || '');
      const model = { language: options.language || 'plaintext' };
      const listeners = [];
      if (element) element.textContent = value;
      const editor = {
        getValue: () => value,
        setValue(nextValue) {
          value = String(nextValue || '');
          if (element) element.textContent = value;
          listeners.forEach((listener) => listener());
        },
        getModel: () => model,
        onDidChangeModelContent(listener) {
          listeners.push(listener);
          return { dispose() {} };
        },
      };
      window.__cybermindsMonacoEditor = editor;
      return editor;
    },
  },
};
window.require = function require(modules, callback) {
  if (Array.isArray(modules) && typeof callback === 'function') {
    window.setTimeout(callback, 0);
  }
};
window.require.config = function config() {};
`;

/**
 * Install the CDN route stubs on a page. Call from `test.beforeEach`.
 * @param {import('@playwright/test').Page} page
 */
async function stubTerminalCdn(page) {
  await page.route('https://cdn.jsdelivr.net/**', async (route) => {
    const url = route.request().url();

    if (url.includes('/@xterm/xterm@') && url.endsWith('/css/xterm.min.css')) {
      await route.fulfill({ body: '', contentType: 'text/css' });
      return;
    }
    if (url.includes('/@xterm/xterm@') && url.endsWith('/lib/xterm.min.js')) {
      await route.fulfill({ body: XTERM_STUB, contentType: 'text/javascript' });
      return;
    }
    if (
      url.includes('/@xterm/addon-fit@') &&
      url.endsWith('/lib/addon-fit.min.js')
    ) {
      await route.fulfill({
        body: FIT_ADDON_STUB,
        contentType: 'text/javascript',
      });
      return;
    }
    if (url.includes('/monaco-editor@') && url.endsWith('/min/vs/loader.js')) {
      await route.fulfill({
        body: MONACO_LOADER_STUB,
        contentType: 'text/javascript',
      });
      return;
    }
    await route.continue();
  });
}

/**
 * URL for a challenge in the offline mock terminal.
 * @param {string} challengeId
 */
function terminalMockUrl(challengeId) {
  return `/HTML/terminal/index.html?challenge=${encodeURIComponent(
    challengeId
  )}&mockTerminal=1`;
}

module.exports = {
  XTERM_STUB,
  FIT_ADDON_STUB,
  MONACO_LOADER_STUB,
  stubTerminalCdn,
  terminalMockUrl,
};
