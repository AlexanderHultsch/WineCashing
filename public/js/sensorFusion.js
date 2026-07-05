// Sensor-Fusion — SAMMLUNG REINER FUNKTIONEN (Vertrag Teil C).
// Keine Seiteneffekte, kein Sensor-/DOM-Zugriff. Nur Rohdaten rein, Werte raus.
// Dadurch offline gegen aufgezeichnete Traces testbar (test/sensorFusion.test.js, Vertrag C.5).

// Datentypen (Vertrag C.1):
//   GpsSample         = { lat, lng, accuracy, timestamp }
//   OrientationSample = { rawHeading, absolute, source, timestamp }  source: "ios"|"absolute"|"relative"
//   Target            = { lat, lng }
//   SmoothedPosition  = { lat, lng, effectiveAccuracy }
//   Plausibility      = { plausible, impliedSpeed, reasons }

// Startwerte (Vertrag C.2) — im Feldtest kalibriert, ohne Signaturen zu ändern (C.6).
export const CONFIG = {
  SMOOTHING_WINDOW: 5,      // letzte N GPS-Messungen
  ACCURACY_WEIGHT_EXP: 2,   // Gewicht = 1 / accuracy^2
  OUTLIER_ACCURACY_MAX: 30, // m — darüber ignorieren, wenn ...
  OUTLIER_GRACE_SEC: 10,    // ... in den letzten 10 s eine bessere Messung vorlag
  MOVE_SPEED_THRESHOLD: 0.5,// m/s — darüber GPS-Heading, darunter Kompass
  WALK_SPEED_MAX: 2.5,      // m/s — Plausibilitäts-Gate Gehen
  RUN_SPEED_SPIKE: 5.0,     // m/s — kurzzeitige Toleranz
  HINT_THRESHOLD_M: 15,     // m — Hinweis-Freischaltung
  BOTTLE_LENGTH_M: 0.3,
};

// --- Geometrie ---
// Haversine (Luftlinie), Meter (Vertrag 6.3).
export function computeDistanceMeters(fromLat, fromLng, toLat, toLng) {
  throw new Error('computeDistanceMeters: TODO');
}

// Initiales Great-Circle-Bearing gegen GEOGRAFISCH Nord, [0..360).
export function computeBearing(fromLat, fromLng, toLat, toLng) {
  throw new Error('computeBearing: TODO');
}

// meters / BOTTLE_LENGTH_M (Vertrag 6.3).
export function metersToBottles(meters, config = CONFIG) {
  throw new Error('metersToBottles: TODO');
}

// --- Heading / Kompass (Vertrag 7.3) ---
// iOS: webkitCompassHeading; Android: 360 - alpha (absolute===true); + screenAngle-Korrektur.
// Liefert Geräte-Heading gegen MAGNETISCH Nord, [0..360).
export function normalizeHeading(orientation, screenAngle) {
  throw new Error('normalizeHeading: TODO');
}

// Rotation der Flaschen-Grafik. Vereinheitlicht Nordreferenz via declination:
// rotation = normalize((bearingToTargetTrue - declination) - deviceHeadingMagnetic).
export function computeCompassRotation(bearingToTargetTrue, deviceHeadingMagnetic, declination) {
  throw new Error('computeCompassRotation: TODO');
}

// --- Filterung / Fusion (Vertrag 7.1, 7.2) ---
// Geschwindigkeits-Gate + Richtungs-Konsistenz + Ziel-Richtung (weich).
// -> { plausible, impliedSpeed, reasons } (reasons fürs Debug-Log 6.11.1).
export function isPlausibleMovement(prevSmoothed, newSample, dtSeconds, lastHeading, target, config = CONFIG) {
  throw new Error('isPlausibleMovement: TODO');
}

// Gewichteter gleitender Mittelwert über letzte N (Gewicht 1/accuracy^EXP);
// Ausreißer (accuracy > OUTLIER_ACCURACY_MAX innerhalb Grace) und unplausible Samples ausschließen/abwerten.
export function smoothPosition(recentSamples, newSample, config = CONFIG) {
  throw new Error('smoothPosition: TODO');
}

// --- Ableitungen fürs UI ---
// smoothedDistanceMeters < HINT_THRESHOLD_M (Vertrag 6.4) — gegen GEGLÄTTETE Distanz.
export function shouldRevealHint(smoothedDistanceMeters, config = CONFIG) {
  throw new Error('shouldRevealHint: TODO');
}
