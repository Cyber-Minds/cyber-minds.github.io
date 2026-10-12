// header.js - Shared header renderer for CyberMinds

(function () {
  if (window.__cyberMindsHeaderInitialized) {
    return;
  }
  window.__cyberMindsHeaderInitialized = true;

  const navItems = Object.freeze([
    { label: 'Home', href: 'index.html' },
    { label: 'More Info', href: 'HTML/moreinfo.html' },
    { label: 'Mission', href: 'HTML/mission.html' },
    { label: 'Live Help', href: 'HTML/LiveHelp.html' },
    { label: 'Courses', href: 'HTML/course_Contents.html' },
    { label: 'Our Team', href: 'HTML/ourTeam.html' },
    { label: 'CTF', href: 'HTML/CTF.html' }
  ]);

  const SHARED_HEADER_STYLE_ID = 'cmh-shared-styles';
  const SHARED_PROGRESS_SCRIPT_ID = 'cm-progress-script';

  function ensureSharedHeaderStyles() {
    if (document.getElementById(SHARED_HEADER_STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = SHARED_HEADER_STYLE_ID;
    style.textContent = [
      '#site-header {',
      '  box-sizing: border-box;',
      '  background: #000;',
      '  padding: 0.75rem 1rem;',
      '  position: relative;',
      '  z-index: 1200;',
      '  max-width: 100%;',
      '}',
      '#site-header .cmh-content {',
      '  box-sizing: border-box;',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 0.85rem;',
      '  width: 100%;',
      '  max-width: 100%;',
      '  min-width: 0;',
      '}',
      '#site-header .cmh-logo {',
      '  display: inline-flex;',
      '  align-items: center;',
      '  text-decoration: none;',
      '  line-height: 0;',
      '  flex-shrink: 0;',
      '  margin-right: auto;',
      '}',
      '#site-header .cmh-logo img {',
      '  display: block;',
      '  width: auto;',
      '  height: 3rem;',
      '  margin: 0;',
      '  max-width: 100%;',
      '  max-height: none;',
      '}',
      '#site-header #cmh-menu-toggle {',
      '  display: none;',
      '  width: 2.6rem;',
      '  height: 2.6rem;',
      '  border: 1px solid rgba(98, 170, 220, 0.42);',
      '  border-radius: 0.75rem;',
      '  background: rgba(13, 23, 34, 0.9);',
      '  color: #fff;',
      '  align-items: center;',
      '  justify-content: center;',
      '  cursor: pointer;',
      '  padding: 0;',
      '  margin: 0;',
      '  z-index: 1204;',
      '}',
      '#site-header .cmh-hamburger {',
      '  display: flex;',
      '  flex-direction: column;',
      '  justify-content: space-between;',
      '  width: 1.25rem;',
      '  height: 0.95rem;',
      '  pointer-events: none;',
      '}',
      '#site-header .cmh-hamburger span {',
      '  width: 100%;',
      '  height: 2px;',
      '  border-radius: 999px;',
      '  background: #fff;',
      '  transition: transform 0.2s ease, opacity 0.2s ease;',
      '  transform-origin: center;',
      '}',
      '#site-header .cmh-hamburger.open span:first-child {',
      '  transform: translateY(6px) rotate(45deg);',
      '}',
      '#site-header .cmh-hamburger.open span:nth-child(2) {',
      '  opacity: 0;',
      '}',
      '#site-header .cmh-hamburger.open span:nth-child(3) {',
      '  transform: translateY(-6px) rotate(-45deg);',
      '}',
      '#site-header #cmh-main-nav {',
      '  display: flex;',
      '  flex: 1 1 auto;',
      '  justify-content: flex-end;',
      '  align-items: center;',
      '  gap: 0.5rem;',
      '  margin: 0;',
      '  padding: 0;',
      '  background: transparent;',
      '  position: relative;',
      '  min-width: 0;',
      '}',
      '#site-header #cmh-main-nav a {',
      '  box-sizing: border-box;',
      '  text-decoration: none;',
      '  font-size: 1rem;',
      '  color: #fff;',
      '  padding: 0.5em 0.9em;',
      '  border-radius: 0.7em;',
      '  background: #16425d;',
      '  white-space: nowrap;',
      '  transition: background-color 0.2s ease;',
      '  margin: 0;',
      '}',
      '#site-header #cmh-main-nav a:hover,',
      '#site-header #cmh-main-nav a:focus-visible,',
      '#site-header #cmh-main-nav a[aria-current="page"] {',
      '  background: #286aa7;',
      '}',
      '#site-header #cmh-main-nav a[aria-current="page"] {',
      '  box-shadow: inset 0 0 0 1px rgba(63, 225, 217, 0.8);',
      '}',
      '#site-header #cmh-menu-backdrop {',
      '  display: none;',
      '}',
      'html, body {',
      '  max-width: 100%;',
      '  overflow-x: hidden;',
      '}',
      '@media (max-width: 1199px) {',
      '  body > section.section {',
      '    box-sizing: border-box;',
      '    width: 100%;',
      '    max-width: 100%;',
      '    margin-left: 0;',
      '    margin-right: 0;',
      '    flex-wrap: wrap;',
      '  }',
      '  body > section.section > .right-side_rectangle,',
      '  body > section.section > .left-side_rectangle {',
      '    box-sizing: border-box;',
      '    max-width: 100%;',
      '    min-width: 0;',
      '  }',
      '}',
      '@media (max-width: 1023px) {',
      '  #site-header .cmh-content {',
      '    padding-left: 4.25rem;',
      '  }',
      '  #site-header #cmh-menu-toggle {',
      '    display: inline-flex;',
      '    position: fixed;',
      '    top: 0.75rem;',
      '    left: 0.75rem;',
      '  }',
      '  #site-header .cmh-logo img {',
      '    height: 2.35rem;',
      '  }',
      '  #site-header #cmh-main-nav {',
      '    display: none;',
      '    position: fixed;',
      '    top: 0;',
      '    left: 0;',
      '    right: 0;',
      '    width: 100vw;',
      '    max-width: 100vw;',
      '    height: auto;',
      '    max-height: min(64dvh, 26rem);',
      '    flex-direction: column;',
      '    justify-content: flex-start;',
      '    align-items: stretch;',
      '    gap: 0.45rem;',
      '    padding: 3.75rem 0.75rem 0.75rem;',
      '    overflow-y: auto;',
      '    background: rgba(4, 8, 14, 0.97);',
      '    border: 1px solid rgba(98, 170, 220, 0.24);',
      '    border-radius: 0 0 0.85rem 0.85rem;',
      '    z-index: 1202;',
      '}',
      '  #site-header #cmh-main-nav.open {',
      '    display: flex;',
      '  }',
      '  #site-header #cmh-main-nav a {',
      '    width: 100%;',
      '    max-width: 100%;',
      '    font-size: 0.95rem;',
      '    text-align: left;',
      '    padding: 0.62em 0.8em;',
      '    border-radius: 0.62em;',
      '  }',
      '  #site-header #cmh-menu-backdrop.open {',
      '    display: block;',
      '    position: fixed;',
      '    inset: 0;',
      '    z-index: 1201;',
      '    background: rgba(0, 0, 0, 0.58);',
      '    backdrop-filter: blur(2px);',
      '  }',
      '  body > section.section,',
      '  body > section {',
      '    box-sizing: border-box;',
      '    display: flex;',
      '    flex-direction: column;',
      '    width: 100%;',
      '    max-width: 100%;',
      '    margin-left: 0;',
      '    margin-right: 0;',
      '  }',
      '  section.section .right-side_rectangle,',
      '  section.section .left-side_rectangle {',
      '    box-sizing: border-box;',
      '    width: 100%;',
      '    max-width: 100%;',
      '    min-width: 0;',
      '    margin-left: 0;',
      '    margin-right: 0;',
      '  }',
      '  section.section .right-side_rectangle img {',
      '    box-sizing: border-box;',
      '    max-width: 100%;',
      '    height: auto;',
      '    margin-left: 0 !important;',
      '  }',
      '  section.section .right-side_rectangle-buttons {',
      '    box-sizing: border-box;',
      '    height: auto;',
      '    min-height: 3.2em;',
      '    gap: 0.4em;',
      '  }',
      '  section.section .right-side_rectangle-buttons a,',
      '  section.section .leftRectangle-section2 a {',
      '    box-sizing: border-box;',
      '    max-width: 100%;',
      '    min-width: 0;',
      '    white-space: normal;',
      '  }',
      '}'
    ].join('\n');

    document.head.appendChild(style);
  }

  function normalizeBasePath(pathname) {
    return pathname.endsWith('/') ? pathname : pathname + '/';
  }

  function getBasePath() {
    const script = document.querySelector('script[src$="Javascript/header.js"]');
    if (script) {
      const scriptUrl = new URL(script.getAttribute('src'), window.location.href);
      const match = scriptUrl.pathname.match(/^(.*\/)Javascript\/header\.js$/);
      if (match && match[1]) {
        return normalizeBasePath(match[1]);
      }
    }

    const pathname = window.location.pathname;
    const htmlIndex = pathname.indexOf('/HTML/');
    return htmlIndex === -1 ? '/' : normalizeBasePath(pathname.slice(0, htmlIndex + 1));
  }

  function joinBasePath(basePath, relativePath) {
    const cleanBase = basePath.replace(/\/+$/, '');
    const cleanRelative = relativePath.replace(/^\/+/, '');
    return cleanBase + '/' + cleanRelative;
  }

  function ensureProgressScript(basePath) {
    if (document.getElementById(SHARED_PROGRESS_SCRIPT_ID)) {
      return;
    }

    const script = document.createElement('script');
    script.id = SHARED_PROGRESS_SCRIPT_ID;
    script.src = joinBasePath(basePath, 'Javascript/progress.js');
    document.head.appendChild(script);
  }

  function normalizePath(url) {
    try {
      const path = new URL(url, window.location.href).pathname;
      return decodeURIComponent(path).replace(/\/+$/, '') || '/';
    } catch {
      return '';
    }
  }

  function markCurrentPage() {
    const currentPath = normalizePath(window.location.href);
    document.querySelectorAll('#cmh-main-nav a').forEach((link) => {
      const linkPath = normalizePath(link.href);
      const isCoursesPage =
        link.textContent.trim() === 'Courses' &&
        currentPath.includes('/HTML/Courses and Activities/');
      if (linkPath === currentPath || isCoursesPage) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });

    document.querySelectorAll('.leftRectangle-section2 a').forEach((link) => {
      if (normalizePath(link.href) === currentPath) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  function renderHeader() {
    let header = document.getElementById('site-header') || document.querySelector('header');

    if (!header && document.body) {
      header = document.createElement('header');
      document.body.insertAdjacentElement('afterbegin', header);
    }
    if (!header) {
      return;
    }

    header.id = 'site-header';
    document.querySelectorAll('header').forEach((candidate) => {
      if (candidate !== header) {
        candidate.remove();
      }
    });

    ensureSharedHeaderStyles();

    const basePath = getBasePath();
    ensureProgressScript(basePath);

    const adjustedNav = navItems.map((item) => ({
      label: item.label,
      href: joinBasePath(basePath, item.href)
    }));
    const logoSrc = joinBasePath(basePath, 'Images/circle.jpg');
    const homeHref = joinBasePath(basePath, 'index.html');

    header.innerHTML = [
      '<div class="cmh-content">',
      '<button id="cmh-menu-toggle" aria-label="Toggle navigation menu" aria-expanded="false" aria-controls="cmh-main-nav" type="button">',
      '<span class="cmh-hamburger" aria-hidden="true"><span></span><span></span><span></span></span>',
      '</button>',
      '<a class="cmh-logo" href="' + homeHref + '" aria-label="CyberMinds home">',
      '<img src="' + logoSrc + '" alt="CyberMinds Logo" />',
      '</a>',
      '<nav id="cmh-main-nav" aria-label="Primary navigation">',
      adjustedNav.map((item) => '<a href="' + item.href + '">' + item.label + '</a>').join(''),
      '</nav>',
      '<div id="cmh-menu-backdrop"></div>',
      '</div>'
    ].join('');

    const toggle = document.getElementById('cmh-menu-toggle');
    const nav = document.getElementById('cmh-main-nav');
    const backdrop = document.getElementById('cmh-menu-backdrop');
    const hamburger = toggle.querySelector('.cmh-hamburger');
    const mobileQuery = window.matchMedia('(max-width: 1023px)');

    function closeMenu({ restoreFocus = false } = {}) {
      nav.classList.remove('open');
      hamburger.classList.remove('open');
      backdrop.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
      if (restoreFocus) {
        toggle.focus();
      }
    }

    function toggleMenu() {
      if (!mobileQuery.matches) {
        return;
      }

      const isOpen = nav.classList.contains('open');
      nav.classList.toggle('open');
      hamburger.classList.toggle('open');
      backdrop.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(!isOpen));
      document.body.style.overflow = isOpen ? '' : 'hidden';

      if (!isOpen) {
        const firstLink = nav.querySelector('a');
        if (firstLink) {
          firstLink.focus();
        }
      }
    }

    toggle.addEventListener('click', toggleMenu);
    toggle.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleMenu();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && nav.classList.contains('open')) {
        closeMenu({ restoreFocus: true });
      }
    });

    document.addEventListener('click', (event) => {
      if (!header.contains(event.target) && nav.classList.contains('open')) {
        closeMenu({ restoreFocus: true });
      }
    });

    backdrop.addEventListener('click', () => {
      if (nav.classList.contains('open')) {
        closeMenu({ restoreFocus: true });
      }
    });

    nav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        if (mobileQuery.matches) {
          closeMenu({ restoreFocus: true });
        }
      });
    });

    window.addEventListener('resize', () => {
      if (!mobileQuery.matches && nav.classList.contains('open')) {
        closeMenu();
      }
    });

    markCurrentPage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderHeader, { once: true });
  } else {
    renderHeader();
  }
})();
