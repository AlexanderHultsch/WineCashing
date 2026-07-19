// Gemeinsame Hamburger-Navigation für index.html und search.html.
// Rein visuell + generisches Auf-/Zuklappen; seitenspezifische Klicks (Logout, Route
// erstellen, …) verdrahtet jede Seite selbst über die data-nav-Attribute — nav.js kennt
// die konkreten Aktionen absichtlich nicht, damit beide Seiten unabhängig bleiben.
import { LOGO_EMOJI, SITE_NAME } from './config.js';

// Usernamen sind nur auf Länge geprüft (routes/auth.js), nicht auf Zeichen — ungeschützt
// in innerHTML eingesetzt wäre das Stored-Self-XSS (Review-Fix).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// active: 'search' | 'create' | 'admin' | 'info' — welcher Menüpunkt als "aktuelle Seite"
// markiert wird (kein Router: die Seiten sind getrennte HTML-Dateien).
// user: eingeloggter Benutzername oder null. isAdmin: nur dann erscheint der Admin-Menüpunkt.
export function renderNavHtml({ active, user, isAdmin = false }) {
  const markActive = (key) => (key === active ? 'active' : '');
  return `
    <nav class="topnav">
      <span class="brand">${LOGO_EMOJI} ${SITE_NAME}</span>
      <button type="button" class="hamburger" id="nav-toggle" aria-label="Menü" aria-expanded="false">☰</button>
      <div class="nav-menu hidden" id="nav-menu">
        ${user ? `<span class="nav-user">👤 ${esc(user)}</span>` : ''}
        ${
          user
            ? `<button type="button" class="nav-item" data-nav="logout">Logout</button>`
            : `<button type="button" class="nav-item" data-nav="login">Login</button>`
        }
        <a class="nav-item ${markActive('search')}" href="search.html">🔍 Mitsuchen</a>
        <a class="nav-item ${markActive('create')}" href="index.html" data-nav="create">🍾 Route erstellen</a>
        ${isAdmin ? `<a class="nav-item ${markActive('admin')}" href="index.html" data-nav="admin">⚙️ Admin</a>` : ''}
        <a class="nav-item ${markActive('info')}" href="datenschutz.html">ℹ️ Info &amp; Datenschutz</a>
      </div>
    </nav>`;
}

// Generisches Auf-/Zuklappen + Klick-außerhalb-schließt. Muss nach jedem Neu-Rendern
// des Nav-HTML erneut aufgerufen werden (die Elemente sind dann neu im DOM).
// Der document-Listener wird dabei erst wieder ENTFERNT: index.html rendert bei jeder
// Aktion neu — ohne das Entfernen sammeln sich dort mit jeder Interaktion weitere
// document-Click-Listener an (Leck, das mit der Sitzungsdauer wächst).
let outsideClickHandler = null;

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

  if (outsideClickHandler) document.removeEventListener('click', outsideClickHandler);
  outsideClickHandler = (e) => {
    if (!menu.classList.contains('hidden') && e.target !== toggle && !menu.contains(e.target)) {
      menu.classList.add('hidden');
      toggle.setAttribute('aria-expanded', 'false');
    }
  };
  document.addEventListener('click', outsideClickHandler);
}
