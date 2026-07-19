// Karten-Auswahl (Owner-UI): Leaflet-Karte, Punkt antippen/Marker verschieben, per
// "Bestätigen" übernehmen — ersetzt manuelle Koordinaten-Eingabe (fehleranfällig).
// Leaflet (globales `L`) wird per <script> in index.html geladen (public/vendor/leaflet/,
// selbst gehostet); dieses Modul kapselt nur die Bedienung, nicht das Laden der Bibliothek.
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from './config.js';

// Zoomstufe, wenn die Karte auf einen bekannten Punkt zentriert wird (zuletzt gewählte
// Position oder eigener Standort) — näher dran als der grobe Deutschland-Überblick.
const LOCATED_MAP_ZOOM = 16;

// Gebündelter Modul-Zustand (Review-Fix: vorher vier lose globale Variablen) — macht die
// gesamte veränderliche Oberfläche an einer Stelle sichtbar. `token` markiert eine
// "Sitzung" (ein openMapPicker()-Aufruf); `userMoved` merkt sich, ob der Nutzer die
// Position in DIESER Sitzung schon selbst gesetzt hat (Klick/Drag).
const state = {
  map: null,
  marker: null,
  currentOnMove: null,
  locateHandler: null, // vom Aufrufer gesetzt (index.html), kapselt die Geolocation-Anfrage
  token: 0,
  userMoved: false,
};

function ensureMap(containerId) {
  if (typeof L === 'undefined') {
    // Leaflet-Script nicht geladen (Datei fehlt/Netzwerkproblem) -> verständliche Meldung
    // statt eines nackten "L is not defined" in der Fehleranzeige.
    throw new Error('Karte konnte nicht geladen werden — bitte Seite neu laden.');
  }
  if (state.map) return state.map;
  state.map = L.map(containerId).setView([DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng], DEFAULT_MAP_ZOOM);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(state.map);
  state.marker = L.marker([DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng], { draggable: true }).addTo(state.map);

  // "Mich lokalisieren"-Steuerelement (Frage 2): ohne diesen Button landet man beim Öffnen
  // ohne vorherigen Standort-Klick "im Nirgendwo" (Deutschland-Mitte) und hatte bisher nur
  // einen Hinweistext als Ausweg. Nutzt Leaflets eigene .leaflet-bar-Optik, kein eigenes CSS
  // nötig. Der eigentliche Geolocation-Aufruf bleibt beim Aufrufer (state.locateHandler) —
  // dieses Modul kennt bewusst nur die Kartenbedienung, nicht die Sensor-Schicht.
  const LocateControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
      const link = L.DomUtil.create('a', '', container);
      link.href = '#';
      link.title = 'Meinen Standort verwenden';
      link.setAttribute('role', 'button');
      link.setAttribute('aria-label', 'Meinen Standort verwenden');
      link.style.fontSize = '16px';
      link.textContent = '📍';
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(link, 'click', (e) => {
        L.DomEvent.preventDefault(e);
        state.locateHandler?.();
      });
      return container;
    },
  });
  new LocateControl().addTo(state.map);

  return state.map;
}

// Öffnet/zentriert die Karte im gegebenen Container auf startLat/startLng (z. B. aktueller
// Standort oder zuletzt gewählter Punkt) und ruft onMove(lat, lng) bei jeder Änderung auf
// (Klick auf die Karte, Marker-Drag oder Klick auf "Mich lokalisieren").
// onLocateRequest (optional): wird beim Klick auf den Locate-Button aufgerufen — der
// Aufrufer fragt darin selbst die Geolocation an und ruft anschließend moveMapPickerTo(...).
//
// Rückgabewert: ein Sitzungs-Token. Der Aufrufer muss es an moveMapPickerTo(...) durchreichen,
// wenn eine asynchrone Geolocation-Anfrage (Review-Fix) erst NACH einem erneuten Öffnen
// (ggf. für einen anderen Wegpunkt) auflöst — moveMapPickerTo verwirft dann still den
// veralteten Aufruf, statt die Position eines längst anderen Kontexts zu überschreiben.
export function openMapPicker(containerId, { startLat, startLng, onMove, onLocateRequest } = {}) {
  const m = ensureMap(containerId);
  state.token += 1;
  state.userMoved = false;
  state.currentOnMove = onMove;
  state.locateHandler = onLocateRequest ?? null;
  state.marker.setLatLng([startLat, startLng]);
  onMove(startLat, startLng);

  state.marker.off('dragend').on('dragend', () => {
    state.userMoved = true;
    const { lat, lng } = state.marker.getLatLng();
    onMove(lat, lng);
  });
  m.off('click').on('click', (e) => {
    state.userMoved = true;
    state.marker.setLatLng(e.latlng);
    onMove(e.latlng.lat, e.latlng.lng);
  });

  // War der Container beim Erstellen unsichtbar (display:none), kennt Leaflet dessen
  // Größe erst nach dem Sichtbarmachen zuverlässig (Layout passiert asynchron zum
  // Entfernen von .hidden) — daher invalidateSize() ZUERST in einem Timeout abwarten,
  // dann erst zentrieren/zoomen. Andersherum (setView vor korrekter Größe) berechnet
  // Leaflet die Pixel-zu-Koordinaten-Zuordnung gegen die falsche/alte Größe, wodurch
  // Klicks auf die Karte an der falschen Stelle landen (dort minimal, aber bei
  // Ausgangsgröße 0×0 massiv daneben).
  setTimeout(() => {
    m.invalidateSize();
    m.setView([startLat, startLng], LOCATED_MAP_ZOOM);
  }, 0);

  return state.token;
}

// Zentriert die bereits offene Karte nachträglich neu (z. B. wenn eine asynchron
// angefragte Geolocation-Position eintrifft, oder nach Klick auf "Mich lokalisieren").
//
// token: vom aufrufenden openMapPicker()-Aufruf — wurde die Karte seither erneut geöffnet
// (anderer Token), ist dieser Aufruf veraltet und wird verworfen.
// silent: true für automatische Hintergrund-Anfragen (Review-Fix) — die werden zusätzlich
// verworfen, wenn der Nutzer die Position in dieser Sitzung schon manuell gesetzt hat
// (Klick/Drag). Ein expliziter Klick auf "Mich lokalisieren" (silent bleibt false) hat
// dagegen immer Vorrang, auch über eine vorherige manuelle Auswahl hinweg.
export function moveMapPickerTo(lat, lng, token, { zoom = LOCATED_MAP_ZOOM, silent = false } = {}) {
  if (!state.map || !state.marker) return;
  if (token !== state.token) return; // veraltete Sitzung (Karte wurde zwischenzeitlich neu geöffnet)
  if (silent && state.userMoved) return; // Nutzer hat in dieser Sitzung schon selbst gewählt
  state.marker.setLatLng([lat, lng]);
  state.map.setView([lat, lng], zoom);
  state.currentOnMove?.(lat, lng);
}

export function getMapPickerPosition() {
  const { lat, lng } = state.marker.getLatLng();
  return { lat, lng };
}
