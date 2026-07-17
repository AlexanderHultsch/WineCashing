// Gemeinsame Hamburger-Navigation für index.html und search.html.
// Rein visuell + generisches Auf-/Zuklappen; seitenspezifische Klicks (Logout, Route
// erstellen, …) verdrahtet jede Seite selbst über die data-nav-Attribute — nav.js kennt
// die konkreten Aktionen absichtlich nicht, damit beide Seiten unabhängig bleiben.
import { LOGO_EMOJI, SITE_NAME } from './config.js';

// active: 'search' | 'create' — welcher Menüpunkt als "aktuelle Seite" markiert wird
// (kein Router: index.html und search.html sind zwei getrennte HTML-Dateien).
// user: eingeloggter Benutzername oder null.
export function renderNavHtml({ active, user }) {
  const markActive = (key) => (key === active ? 'active' : '');
  return `
    <nav class="topnav">
      <span class="brand">${LOGO_EMOJI} ${SITE_NAME}</span>
      <button type="button" class="hamburger" id="nav-toggle" aria-label="Menü" aria-expanded="false">☰</button>
      <div class="nav-menu hidden" id="nav-menu">
        ${user ? `<span class="nav-user">👤 ${user}</span>` : ''}
        ${
          user
            ? `<button type="button" class="nav-item" data-nav="logout">Logout</button>`
            : `<button type="button" class="nav-item" data-nav="login">Login</button>`
        }
        <a class="nav-item ${markActive('search')}" href="search.html">🔍 Mitsuchen</a>
        <a class="nav-item ${markActive('create')}" href="index.html" data-nav="create">🍾 Route erstellen</a>
      </div>
    </nav>`;
}

// Generisches Auf-/Zuklappen + Klick-außerhalb-schließt. Muss nach jedem Neu-Rendern
// des Nav-HTML erneut aufgerufen werden (die Elemente sind dann neu im DOM).
export function wireNavToggle() {
  const toggle = document.getElementById('nav-toggle');
  const menu = document.getElementById('nav-menu');
  if (!toggle || !menu) return;

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !willOpen);
    toggle.setAttribute('aria-expanded', String(willOpen));
  });

  document.addEventListener('click', (e) => {
    if (!menu.classList.contains('hidden') && e.target !== toggle && !menu.contains(e.target)) {
      menu.classList.add('hidden');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
}
