// Karten-Auswahl (Owner-UI): Leaflet-Karte, Punkt antippen/Marker verschieben, per
// "Bestätigen" übernehmen — ersetzt manuelle Koordinaten-Eingabe (fehleranfällig).
// Leaflet (globales `L`) wird per <script> in index.html geladen (public/vendor/leaflet/,
// selbst gehostet); dieses Modul kapselt nur die Bedienung, nicht das Laden der Bibliothek.
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from './config.js';

// Zoomstufe, wenn die Karte auf einen bekannten Punkt zentriert wird (zuletzt gewählte
// Position oder eigener Standort) — näher dran als der grobe Deutschland-Überblick.
const LOCATED_MAP_ZOOM = 16;

let map = null;
let marker = null;
let currentOnMove = null;
let locateHandler = null; // vom Aufrufer gesetzt (index.html), kapselt die Geolocation-Anfrage

function ensureMap(containerId) {
  if (typeof L === 'undefined') {
    // Leaflet-Script nicht geladen (Datei fehlt/Netzwerkproblem) -> verständliche Meldung
    // statt eines nackten "L is not defined" in der Fehleranzeige.
    throw new Error('Karte konnte nicht geladen werden — bitte Seite neu laden.');
  }
  if (map) return map;
  map = L.map(containerId).setView([DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng], DEFAULT_MAP_ZOOM);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);
  marker = L.marker([DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng], { draggable: true }).addTo(map);

  // "Mich lokalisieren"-Steuerelement (Frage 2): ohne diesen Button landet man beim Öffnen
  // ohne vorherigen Standort-Klick "im Nirgendwo" (Deutschland-Mitte) und hatte bisher nur
  // einen Hinweistext als Ausweg. Nutzt Leaflets eigene .leaflet-bar-Optik, kein eigenes CSS
  // nötig. Der eigentliche Geolocation-Aufruf bleibt beim Aufrufer (locateHandler) — dieses
  // Modul kennt bewusst nur die Kartenbedienung, nicht die Sensor-Schicht.
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
        locateHandler?.();
      });
      return container;
    },
  });
  new LocateControl().addTo(map);

  return map;
}

// Öffnet/zentriert die Karte im gegebenen Container auf startLat/startLng (z. B. aktueller
// Standort oder zuletzt gewählter Punkt) und ruft onMove(lat, lng) bei jeder Änderung auf
// (Klick auf die Karte, Marker-Drag oder Klick auf "Mich lokalisieren").
// onLocateRequest (optional): wird beim Klick auf den Locate-Button aufgerufen — der
// Aufrufer fragt darin selbst die Geolocation an und ruft anschließend moveMapPickerTo(...).
export function openMapPicker(containerId, { startLat, startLng, onMove, onLocateRequest } = {}) {
  const m = ensureMap(containerId);
  currentOnMove = onMove;
  locateHandler = onLocateRequest ?? null;
  marker.setLatLng([startLat, startLng]);
  onMove(startLat, startLng);

  marker.off('dragend').on('dragend', () => {
    const { lat, lng } = marker.getLatLng();
    onMove(lat, lng);
  });
  m.off('click').on('click', (e) => {
    marker.setLatLng(e.latlng);
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
}

// Zentriert die bereits offene Karte nachträglich neu (z. B. wenn eine asynchron
// angefragte Geolocation-Position eintrifft, oder nach Klick auf "Mich lokalisieren").
export function moveMapPickerTo(lat, lng, zoom = LOCATED_MAP_ZOOM) {
  if (!map || !marker) return;
  marker.setLatLng([lat, lng]);
  map.setView([lat, lng], zoom);
  currentOnMove?.(lat, lng);
}

export function getMapPickerPosition() {
  const { lat, lng } = marker.getLatLng();
  return { lat, lng };
}
