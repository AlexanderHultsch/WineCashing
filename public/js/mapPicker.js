// Karten-Auswahl (Owner-UI): Leaflet-Karte, Punkt antippen/Marker verschieben, per
// "Bestätigen" übernehmen — ersetzt manuelle Koordinaten-Eingabe (fehleranfällig).
// Leaflet (globales `L`) wird per <script> in index.html geladen (public/vendor/leaflet/,
// selbst gehostet); dieses Modul kapselt nur die Bedienung, nicht das Laden der Bibliothek.
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from './config.js';

let map = null;
let marker = null;

function ensureMap(containerId) {
  if (map) return map;
  map = L.map(containerId).setView([DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng], DEFAULT_MAP_ZOOM);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);
  marker = L.marker([DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng], { draggable: true }).addTo(map);
  return map;
}

// Öffnet/zentriert die Karte im gegebenen Container auf startLat/startLng (z. B. aktueller
// Standort oder zuletzt gewählter Punkt) und ruft onMove(lat, lng) bei jeder Änderung auf
// (Klick auf die Karte oder Marker-Drag).
export function openMapPicker(containerId, { startLat, startLng, onMove }) {
  const m = ensureMap(containerId);
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
    m.setView([startLat, startLng], 16);
  }, 0);
}

export function getMapPickerPosition() {
  const { lat, lng } = marker.getLatLng();
  return { lat, lng };
}
