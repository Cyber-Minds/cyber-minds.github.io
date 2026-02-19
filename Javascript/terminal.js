/**
 * @file Bootstraps the modular CyberMinds terminal frontend.
 *
 * Loads scripts in dependency order:
 * 1) state/config
 * 2) mock terminal engine
 * 3) app runtime
 */
(function bootstrapTerminalFrontend() {
  const current = document.currentScript;
  const baseUrl = current && current.src
    ? current.src.slice(0, current.src.lastIndexOf('/') + 1)
    : '/Javascript/';

  const modules = [
    'terminal/state.js',
    'terminal/mock.js',
    'terminal/app.js',
  ];

  function loadModule(index) {
    if (index >= modules.length) {
      return;
    }

    const script = document.createElement('script');
    script.src = `${baseUrl}${modules[index]}`;
    script.async = false;
    script.onload = function onModuleLoaded() {
      loadModule(index + 1);
    };
    script.onerror = function onModuleError() {
      console.error(`Failed to load terminal module: ${modules[index]}`);
    };

    document.head.appendChild(script);
  }

  loadModule(0);
})();
