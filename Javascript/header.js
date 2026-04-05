// header.js - Shared header renderer for CyberMinds

const navItems = [
  { label: 'Home', href: '/index.html' },
  { label: 'More Info', href: '/HTML/moreinfo.html' },
  { label: 'Mission', href: '/HTML/mission.html' },
  { label: 'Live Help', href: '/HTML/LiveHelp.html' },
  { label: 'Courses', href: '/HTML/course_Contents.html' },
  { label: 'Our Team', href: '/HTML/ourTeam.html' },
  { label: 'CTF', href: '/HTML/CTF.html' },
  { label: 'Sign In', href: '/HTML/SignIn&LogIn.html' }
];

function renderHeader() {
  const header = document.getElementById('site-header');
  if (!header) return;

  const adjustedNav = navItems; // Use root-relative hrefs directly

  const html = `
    <div class="header-content">
      <div id="menuToggle" aria-label="Toggle navigation menu" aria-expanded="false" role="button" tabindex="0">
        <div class="hamburger">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div class="glass"><img src="/Images/cybersecurity.jfif" alt="CyberMinds Logo" /></div>
      </div>
      <nav class="header-buttons" id="main-nav" aria-labelledby="menuToggle">
        ${adjustedNav.map(item => `<a href="${item.href}">${item.label}</a>`).join('')}
      </nav>
    </div>
  `;

  header.innerHTML = html;

  // Event listeners
  const toggle = document.getElementById('menuToggle');
  const nav = document.getElementById('main-nav');
  const hamburger = toggle.querySelector('.hamburger');

  function toggleMenu() {
    const isOpen = nav.classList.contains('open');
    nav.classList.toggle('open');
    hamburger.classList.toggle('open');
    toggle.setAttribute('aria-expanded', !isOpen);
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
      nav.classList.remove('open');
      hamburger.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
      toggle.focus();
    }
  });

  // Close on click outside
  document.addEventListener('click', (e) => {
    if (!header.contains(e.target) && nav.classList.contains('open')) {
      nav.classList.remove('open');
      hamburger.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }
  });
}

// Run on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderHeader);
} else {
  renderHeader();
}