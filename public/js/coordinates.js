// Koordinaten-Hilfsfunktionen — reine Funktionen, kein DOM-Zugriff.
// Dezimalgrad ist das Übertragungsformat (Vertrag A.6, Waypoint.lat/lng); DMS
// (Grad/Minuten/Sekunden) ist nur eine Eingabe-/Anzeigehilfe fürs Owner-UI,
// weil Google Maps Koordinaten standardmäßig so anzeigt/kopiert, z. B.
// 48°59'58.0"N 8°29'17.4"E.

// Grad/Minuten/Sekunden + Himmelsrichtung -> Dezimalgrad (vorzeichenbehaftet).
export function dmsToDecimal(deg, min, sec, hemisphere) {
  const magnitude = Math.abs(deg) + Math.abs(min) / 60 + Math.abs(sec) / 3600;
  const sign = hemisphere === 'S' || hemisphere === 'W' ? -1 : 1;
  return sign * magnitude;
}

// Dezimalgrad -> { deg, min, sec } (immer positiv; Vorzeichen steckt in der Himmelsrichtung).
export function decimalToDms(decimal) {
  const abs = Math.abs(decimal);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  // Rundung auf 1 Nachkommastelle bei den Sekunden kann min auf 60 hochrunden -> korrigieren.
  let sec = Math.round((minFloat - min) * 60 * 10) / 10;
  let carriedMin = min;
  if (sec >= 60) {
    sec -= 60;
    carriedMin += 1;
  }
  return { deg, min: carriedMin, sec };
}

// Anzeige im Google-Maps-Stil, z. B. 48°59'58.0"N.
export function formatDms(decimal, isLatitude) {
  const { deg, min, sec } = decimalToDms(decimal);
  const hemisphere = isLatitude ? (decimal < 0 ? 'S' : 'N') : decimal < 0 ? 'W' : 'E';
  return `${deg}°${String(min).padStart(2, '0')}'${sec.toFixed(1)}"${hemisphere}`;
}

// Ein DMS-Token wie 48°59'58.0"N — Minuten-/Sekundenzeichen tolerant (' ′, " ″).
const DMS_TOKEN = /(-?\d+(?:[.,]\d+)?)\s*°\s*(\d+(?:[.,]\d+)?)\s*['′]\s*(\d+(?:[.,]\d+)?)\s*(?:"|″)?\s*([NSEWnsew])/g;

// Erkennt Koordinaten aus eingefügtem Text: Google-Maps-DMS-Paar (in beliebiger
// Reihenfolge, Himmelsrichtung entscheidet lat/lng) oder ein einfaches Dezimalpaar
// wie "48.9994, 8.4881". Gibt { lat, lng } zurück oder null, wenn nichts erkannt wurde.
export function parseCoordinateString(input) {
  const str = String(input ?? '').trim();
  if (!str) return null;

  const tokens = [...str.matchAll(DMS_TOKEN)];
  if (tokens.length >= 2) {
    let lat = null;
    let lng = null;
    for (const [, deg, min, sec, hemiRaw] of tokens) {
      const hemi = hemiRaw.toUpperCase();
      const value = dmsToDecimal(Number(deg.replace(',', '.')), Number(min.replace(',', '.')), Number(sec.replace(',', '.')), hemi);
      if (hemi === 'N' || hemi === 'S') lat = value;
      else lng = value;
    }
    if (lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  }

  const decimalPair = str.match(/(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (decimalPair) {
    const lat = Number(decimalPair[1]);
    const lng = Number(decimalPair[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  }

  return null;
}
