// Koordinaten-Anzeige-Hilfsfunktionen — reine Funktionen, kein DOM-Zugriff.
// Dezimalgrad ist das alleinige Eingabe- und Übertragungsformat (Vertrag A.6,
// Waypoint.lat/lng) — die Owner-UI ermittelt Koordinaten per Karten-Klick oder
// "aktuellen Standort verwenden" (beides liefert direkt Dezimalgrad). DMS
// (Grad/Minuten/Sekunden) dient hier nur noch der men­schenlesbaren Anzeige,
// weil Google Maps Koordinaten so darstellt, z. B. 48°59'58.0"N 8°29'17.4"E.

// Dezimalgrad -> { deg, min, sec } (immer positiv; Vorzeichen steckt in der Himmelsrichtung).
export function decimalToDms(decimal) {
  const abs = Math.abs(decimal);
  let deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  let min = Math.floor(minFloat);
  // Rundung auf 1 Nachkommastelle bei den Sekunden kann sec auf 60 hochrunden -> in min tragen,
  // und das kann seinerseits min auf 60 hochtragen -> in deg tragen (beobachteter Fall, z. B.
  // bei 1°59'59.96": rundet zu 1°60'0.0" ohne diese Korrektur).
  let sec = Math.round((minFloat - min) * 60 * 10) / 10;
  if (sec >= 60) {
    sec -= 60;
    min += 1;
  }
  if (min >= 60) {
    min -= 60;
    deg += 1;
  }
  return { deg, min, sec };
}

// Anzeige im Google-Maps-Stil, z. B. 48°59'58.0"N.
export function formatDms(decimal, isLatitude) {
  const { deg, min, sec } = decimalToDms(decimal);
  const hemisphere = isLatitude ? (decimal < 0 ? 'S' : 'N') : decimal < 0 ? 'W' : 'E';
  return `${deg}°${String(min).padStart(2, '0')}'${sec.toFixed(1)}"${hemisphere}`;
}
