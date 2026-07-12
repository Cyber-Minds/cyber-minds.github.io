// header.js - Shared header renderer for CyberMinds

const navItems = [
  { label: 'Home', href: 'index.html' },
  { label: 'More Info', href: 'HTML/moreinfo.html' },
  { label: 'Mission', href: 'HTML/mission.html' },
  { label: 'Live Help', href: 'HTML/LiveHelp.html' },
  { label: 'Courses', href: 'HTML/course_Contents.html' },
  { label: 'Our Team', href: 'HTML/ourTeam.html' },
  { label: 'CTF', href: 'HTML/CTF.html' }
];

const SHARED_HEADER_STYLE_ID = 'cmh-shared-styles';
const SHARED_PROGRESS_SCRIPT_ID = 'cm-progress-script';

function ensureSharedHeaderStyles() {
  if (document.getElementById(SHARED_HEADER_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = SHARED_HEADER_STYLE_ID;
  style.textContent = `
    #site-header {
      background: #000;
      padding: 0.75rem 1rem;
      position: relative;
      z-index: 1200;
    }

    #site-header .cmh-content {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      width: 100%;
    }

    #site-header .cmh-logo {
      display: inline-flex;
      align-items: center;
      text-decoration: none;
      line-height: 0;
      flex-shrink: 0;
      margin-right: auto;
    }

    #site-header .cmh-logo img {
      display: block;
      width: auto;
      height: 3rem;
      margin: 0;
      max-width: none;
      max-height: none;
    }

    #site-header #cmh-menu-toggle {
      display: none;
      width: 2.6rem;
      height: 2.6rem;
      border: 1px solid rgba(98, 170, 220, 0.42);
      border-radius: 0.75rem;
      background: rgba(13, 23, 34, 0.9);
      color: #fff;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      padding: 0;
      margin: 0;
      z-index: 1202;
    }

    #site-header .cmh-hamburger {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      width: 1.25rem;
      height: 0.95rem;
      pointer-events: none;
    }

    #site-header .cmh-hamburger span {
      width: 100%;
      height: 2px;
      border-radius: 999px;
      background: #fff;
      transition: transform 0.2s ease, opacity 0.2s ease;
      transform-origin: center;
    }

    #site-header .cmh-hamburger.open span:first-child {
      transform: translateY(6px) rotate(45deg);
    }

    #site-header .cmh-hamburger.open span:nth-child(2) {
      opacity: 0;
    }

    #site-header .cmh-hamburger.open span:nth-child(3) {
      transform: translateY(-6px) rotate(-45deg);
    }

    #site-header #cmh-main-nav {
      display: flex;
      flex: 1;
      justify-content: flex-end;
      align-items: center;
      gap: 0.5rem;
      margin: 0;
      padding: 0;
      background: transparent;
      position: relative;
    }

    #site-header #cmh-main-nav a {
      text-decoration: none;
      font-size: 1rem;
      color: #fff;
      padding: 0.5em 0.9em;
      border-radius: 0.7em;
      background: #16425d;
      white-space: nowrap;
      transition: background-color 0.2s ease;
      margin: 0;
    }

    #site-header #cmh-main-nav a:hover {
      background: #286aa7;
    }

    #site-header #cmh-menu-backdrop {
      display: none;
    }

    @media (max-width: 1023px) {
      #site-header #cmh-menu-toggle {
        display: inline-flex;
        position: fixed;
        top: 0.75rem;
        left: 0.75rem;
        z-index: 1204;
      }

      #site-header .cmh-logo img {
        height: 2.35rem;
      }

      #site-header #cmh-main-nav {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        width: 98vw;
        height: auto;
        max-height: min(64dvh, 26rem);
        flex-direction: column;
        justify-content: flex-start;
        align-items: stretch;
        gap: 0.45rem;
        padding: 3.75rem 0.75rem 0.75rem;
        overflow-y: auto;
        background: rgba(4, 8, 14, 0.97);
        border: 1px solid rgba(98, 170, 220, 0.24);
        border-radius: 0 0 0.85rem 0.85rem;
        box-sizing: border-box;
        z-index: 1202;
      }

      #site-header #cmh-main-nav.open {
        display: flex;
      }

      #site-header #cmh-main-nav a {
        width: 95%;
        font-size: 0.95rem;
        text-align: left;
        padding: 0.62em 0.8em;
        border-radius: 0.62em;
      }

      #site-header #cmh-menu-backdrop.open {
        display: block;
        position: fixed;
        inset: 0;
        z-index: 1201;
        background: rgba(0, 0, 0, 0.58);
        backdrop-filter: blur(2px);
      }
    }
  `;

  document.head.appendChild(style);
}

function normalizeBasePath(pathname) {
  return pathname.endsWith('/') ? pathname : `${pathname}/`;
}

function getBasePath() {
  const script =
    document.currentScript ||
    document.querySelector('script[src$="Javascript/header.js"]');
  if (script) {
    const scriptUrl = new URL(script.getAttribute('src'), window.location.href);
    const match = scriptUrl.pathname.match(/^(.*\/)Javascript\/header\.js$/);
    if (match && match[1]) {
      return normalizeBasePath(match[1]);
    }
  }

  const pathname = window.location.pathname;
  const htmlIndex = pathname.indexOf('/HTML/');
  if (htmlIndex !== -1) {
    return normalizeBasePath(pathname.slice(0, htmlIndex + 1));
  }
  return '/';
}

function joinBasePath(basePath, relativePath) {
  const cleanBase = basePath.replace(/\/+$/, '');
  const cleanRelative = relativePath.replace(/^\/+/, '');
  return `${cleanBase}/${cleanRelative}`;
}

function ensureProgressScript(basePath) {
  if (document.getElementById(SHARED_PROGRESS_SCRIPT_ID)) {
    return;
  }

  const script = document.createElement('script');
  script.id = SHARED_PROGRESS_SCRIPT_ID;
  script.src = joinBasePath(basePath, 'Javascript/progress.js');
  document.head.appendChild(script);

  const continuationScript = document.createElement('script');
  continuationScript.src = joinBasePath(basePath, 'Javascript/pathContinuation.js');
  document.head.appendChild(continuationScript);
}

function renderHeader() {
  let header = document.getElementById('site-header');
  if (!header) {
    header = document.querySelector('header');
    if (header) {
      header.id = 'site-header';
    }
  }
  if (!header && document.body) {
    header = document.createElement('header');
    header.id = 'site-header';
    document.body.insertAdjacentElement('afterbegin', header);
  }
  if (!header) return;
  ensureSharedHeaderStyles();

  const basePath = getBasePath();
  ensureProgressScript(basePath);
  const adjustedNav = navItems.map((item) => ({
    ...item,
    href: joinBasePath(basePath, item.href)
  }));
  const logoSrc = joinBasePath(basePath, 'Images/circle.jpg');
  const homeHref = joinBasePath(basePath, 'index.html');

  const html = `
    <div class="cmh-content">
      <button id="cmh-menu-toggle" aria-label="Toggle navigation menu" aria-expanded="false" aria-controls="cmh-main-nav" type="button">
        <div class="cmh-hamburger">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </button>
      <a class="cmh-logo" href="${homeHref}" aria-label="CyberMinds home">
        <img src="${logoSrc}" alt="CyberMinds Logo" />
      </a>
      <nav id="cmh-main-nav" aria-labelledby="cmh-menu-toggle">
        ${adjustedNav.map(item => `<a href="${item.href}">${item.label}</a>`).join('')}
      </nav>
      <div id="cmh-menu-backdrop"></div>
    </div>
  `;

  header.innerHTML = html;

  // Event listeners
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
    if (!mobileQuery.matches) return;

    const isOpen = nav.classList.contains('open');
    nav.classList.toggle('open');
    hamburger.classList.toggle('open');
    backdrop.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(!isOpen));
    document.body.style.overflow = isOpen ? '' : 'hidden';
    if (!isOpen) {
      // Focus first link
      const firstLink = nav.querySelector('a');
      if (firstLink) firstLink.focus();
    }
  }

  toggle.addEventListener('click', toggleMenu);
  toggle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleMenu();
    }
  });

  // Close on escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('open')) {
      closeMenu({ restoreFocus: true });
    }
  });

  // Close on click outside
  document.addEventListener('click', (e) => {
    if (!header.contains(e.target) && nav.classList.contains('open')) {
      closeMenu();
    }
  });

  backdrop.addEventListener('click', () => {
    if (nav.classList.contains('open')) {
      closeMenu();
    }
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      if (mobileQuery.matches) {
        closeMenu();
      }
    });
  });

  window.addEventListener('resize', () => {
    if (!mobileQuery.matches && nav.classList.contains('open')) {
      closeMenu();
    }
  });
}

// Run on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderHeader);
} else {
  renderHeader();
}
