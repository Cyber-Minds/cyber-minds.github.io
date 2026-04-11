/**
 * @file Bootstraps modular terminal app runtime.
 */
(function bootstrapTerminalApp() {
  const current = document.currentScript;
  const baseUrl = current && current.src
    ? current.src.slice(0, current.src.lastIndexOf('/') + 1)
    : '/Javascript/terminal/';

  const modules = [
    'app/core.js',
    'app/workspace.js',
    'app/challenges.js',
    'app/runtime.js',
    'app/ui.js',
  ];

  function loadModule(index) {
    if (index >= modules.length) {
      return;
    }

    const script = document.createElement('script');
    script.src = `${baseUrl}${modules[index]}`;
    script.async = false;
    script.onload = function onLoaded() {
      loadModule(index + 1);
    };
    script.onerror = function onError() {
      console.error(`Failed to load terminal app module: ${modules[index]}`);
    };
    document.head.appendChild(script);
  }

  loadModule(0);
})();
