// Sensor-Fusion — SAMMLUNG REINER FUNKTIONEN (Vertrag Teil C).
// Keine Seiteneffekte, kein Sensor-/DOM-Zugriff. Nur Rohdaten rein, Werte raus.
// Dadurch offline gegen aufgezeichnete Traces testbar (test/traceReplay.test.js, Vertrag C.5).

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
  ROTATION_SMOOTHING: 0.18,        // 0..1 — Anteil des neuen Werts je Update (Legacy, s. smoothRotation)
  ROTATION_TIME_CONSTANT_MS: 150,  // ms — Zeitkonstante der Rotationsglättung (rate-invariant, s. smoothRotationTimed)
  ROTATION_RENDER_DEADBAND_DEG: 2, // ° — kleinere Änderungen werden nicht ans UI weitergereicht (Zittern)
};

const EARTH_RADIUS_M = 6371000; // mittlerer Erdradius
const MIN_ACCURACY_M = 0.5;     // Divisions-Schutz bei sehr gutem GPS

const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

// Winkel auf [0..360) normalisieren.
export function normalize360(deg) {
  return ((deg % 360) + 360) % 360;
}

// Kleinste Winkeldifferenz zweier Headings, [0..180].
export function angularDifference(a, b) {
  const d = Math.abs(normalize360(a) - normalize360(b));
  return d > 180 ? 360 - d : d;
}

// --- Geometrie ---
// Haversine (Luftlinie), Meter (Vertrag 6.3).
export function computeDistanceMeters(fromLat, fromLng, toLat, toLng) {
  const dLat = toRad(toLat - fromLat);
  const dLng = toRad(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

// Initiales Great-Circle-Bearing gegen GEOGRAFISCH Nord, [0..360).
export function computeBearing(fromLat, fromLng, toLat, toLng) {
  const φ1 = toRad(fromLat);
  const φ2 = toRad(toLat);
  const Δλ = toRad(toLng - fromLng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return normalize360(toDeg(Math.atan2(y, x)));
}

// meters / BOTTLE_LENGTH_M (Vertrag 6.3).
export function metersToBottles(meters, config = CONFIG) {
  return meters / config.BOTTLE_LENGTH_M;
}

// --- Heading / Kompass (Vertrag 7.3) ---
// iOS ("ios"): rawHeading = webkitCompassHeading (bereits gegen Nord, im Uhrzeigersinn),
//   spiegelt die aktuelle Bildschirm-Ausrichtung schon wider -> keine screenAngle-Korrektur.
// Android ("absolute"/"relative"): 360 - alpha, im Geräte-Naturframe -> um screenAngle in den
//   aktuellen Bildschirmframe drehen.
// Liefert Geräte-Heading gegen MAGNETISCH Nord, [0..360).
export function normalizeHeading(orientation, screenAngle = 0) {
  const { rawHeading, source } = orientation;
  if (source === 'ios') {
    return normalize360(rawHeading);
  }
  return normalize360(360 - rawHeading + screenAngle);
}

// Rotation der Flaschen-Grafik. Vereinheitlicht Nordreferenz via declination:
// rotation = normalize((bearingToTargetTrue - declination) - deviceHeadingMagnetic).
export function computeCompassRotation(bearingToTargetTrue, deviceHeadingMagnetic, declination = 0) {
  return normalize360(bearingToTargetTrue - declination - deviceHeadingMagnetic);
}

// --- Filterung / Fusion (Vertrag 7.1, 7.2) ---
// -> { plausible, impliedSpeed, reasons } (reasons fürs Debug-Log 6.11.1).
export function isPlausibleMovement(prevSmoothed, newSample, dtSeconds, lastHeading, target, config = CONFIG) {
  const reasons = [];

  // Ohne Referenz oder ohne Zeitbasis keine Aussage möglich -> plausibel.
  if (!prevSmoothed || !dtSeconds || dtSeconds <= 0) {
    return { plausible: true, impliedSpeed: 0, reasons: ['no_reference'] };
  }

  const moveDist = computeDistanceMeters(prevSmoothed.lat, prevSmoothed.lng, newSample.lat, newSample.lng);
  const impliedSpeed = moveDist / dtSeconds;
  let plausible = true;

  // 1) Geschwindigkeits-Gate (harter Faktor).
  if (impliedSpeed > config.RUN_SPEED_SPIKE) {
    plausible = false;
    reasons.push('speed_exceeds_run_spike');
  } else if (impliedSpeed > config.WALK_SPEED_MAX) {
    reasons.push('speed_spike'); // nur als kurzer Spike toleriert
  }

  // 2) Richtungs-Konsistenz (Indiz). Nur sinnvoll, wenn nennenswert bewegt.
  let directionInconsistent = false;
  if (moveDist > 1 && lastHeading != null) {
    const moveBearing = computeBearing(prevSmoothed.lat, prevSmoothed.lng, newSample.lat, newSample.lng);
    if (angularDifference(moveBearing, lastHeading) > 90) {
      directionInconsistent = true;
      reasons.push('direction_inconsistent');
    }
  }

  // Kombination: moderater Spike + inkonsistente Richtung => wahrscheinlich GPS-Sprung.
  if (plausible && reasons.includes('speed_spike') && directionInconsistent) {
    plausible = false;
    reasons.push('spike_and_wrong_direction');
  }

  // 3) Ziel-Richtung als weiches Signal (schwächster Faktor, kippt nie allein).
  if (target) {
    const prevToTarget = computeDistanceMeters(prevSmoothed.lat, prevSmoothed.lng, target.lat, target.lng);
    const newToTarget = computeDistanceMeters(newSample.lat, newSample.lng, target.lat, target.lng);
    if (newToTarget > prevToTarget + moveDist * 0.5) {
      reasons.push('diverging_from_target');
    }
  }

  return { plausible, impliedSpeed, reasons };
}

// Gewichteter gleitender Mittelwert über die letzten N (Gewicht 1/accuracy^EXP).
// Ausreißer (accuracy > OUTLIER_ACCURACY_MAX, wenn innerhalb OUTLIER_GRACE_SEC eine bessere
// Messung vorlag) sowie explizit als unplausibel markierte Samples (sample.plausible === false)
// werden ausgeschlossen. Ergebnis nie leer (Fallback: newSample).
export function smoothPosition(recentSamples, newSample, config = CONFIG) {
  // Arbeitsmenge: recentSamples inkl. newSample (Aufrufer legen es i. d. R. bereits ab).
  const samples = recentSamples.includes(newSample) ? recentSamples : [...recentSamples, newSample];

  const graceMs = config.OUTLIER_GRACE_SEC * 1000;
  const kept = samples.filter((s) => {
    if (s.plausible === false) return false;
    if (s.accuracy <= config.OUTLIER_ACCURACY_MAX) return true;
    // Schlechte Messung: nur behalten, wenn keine bessere in Reichweite lag.
    const betterNearby = samples.some(
      (o) => o !== s && o.accuracy <= config.OUTLIER_ACCURACY_MAX && Math.abs(o.timestamp - s.timestamp) <= graceMs,
    );
    return !betterNearby;
  });

  const used = kept.length > 0 ? kept : [newSample];

  let sumW = 0;
  let sumLat = 0;
  let sumLng = 0;
  let sumAcc = 0;
  for (const s of used) {
    const w = 1 / Math.pow(Math.max(s.accuracy, MIN_ACCURACY_M), config.ACCURACY_WEIGHT_EXP);
    sumW += w;
    sumLat += w * s.lat;
    sumLng += w * s.lng;
    sumAcc += w * s.accuracy;
  }

  return {
    lat: sumLat / sumW,
    lng: sumLng / sumW,
    effectiveAccuracy: sumAcc / sumW,
  };
}

// Glättet die Nadel-Rotation über die Zeit (exponentiell gleitender Mittelwert, kreisbewusst:
// nimmt immer den kürzeren Weg um den Kreis, damit die Nadel nie "die lange Runde" dreht).
// Ohne das würde die Nadel bei jedem einzelnen (ggf. verrauschten) Kompass-/Positions-Update
// hart auf den neuen Rohwert springen — sichtbar als Zittern bzw. bei knappem GPS-Signal als
// schnelles Rotieren/"um die eigene Achse drehen" (kleine Positions-Jitter verursachen bei
// kurzer Distanz zum Ziel große Bearing-Sprünge). smoothingFactor=1 -> ungeglättet (Rohwert),
// kleinere Werte -> träger. `null` als vorheriger Wert -> erster Wert wird direkt übernommen
// (kein künstliches "Einschwingen" von 0 beim allerersten Sample).
//
// WICHTIG: Der Rückgabewert ist KONTINUIERLICH (nicht auf [0..360) normalisiert) und muss
// unverändert als prevRotation zurückgereicht werden. Grund: Die Nadel wird per CSS-Transition
// auf `rotate(Xdeg)` animiert — würde der Wert beim 0/360-Übergang normalisiert (z. B. 359.8 ->
// 0.2), animiert CSS den numerischen Weg RÜCKWÄRTS über fast 360°, und die Flasche dreht
// sichtbar eine volle Runde. Mit kontinuierlichen Werten (359.8 -> 360.2) bleibt die Animation
// immer der kurze Weg. `rotate(3600deg)` ist für CSS problemlos gültig.
export function smoothRotation(prevRotation, newRotation, smoothingFactor = CONFIG.ROTATION_SMOOTHING) {
  if (prevRotation == null) return normalize360(newRotation);
  const shortestDiff = ((normalize360(newRotation) - normalize360(prevRotation) + 540) % 360) - 180;
  return prevRotation + shortestDiff * smoothingFactor;
}

// Zeitkonstanten-basierte Rotationsglättung (Bug-Fix: Kompassnadel zittert/ruckelt beim
// Drehen und schwingt nach einer Drehung mehrfach über). smoothRotation() oben glättet mit
// einem FESTEN Anteil PRO SAMPLE — bei deviceorientation-Events, die je nach Gerät mit stark
// schwankender Rate (10..60 Hz) feuern, folgt die Nadel bei hoher Rate praktisch ungefiltert
// dem Sensorrauschen (sichtbares Zittern), bei niedriger Rate ruckelt sie dagegen sprunghaft.
// Hier bestimmt stattdessen eine feste ZEITKONSTANTE (ms) die Trägheit — unabhängig davon, wie
// oft der Sensor pro Sekunde liefert (klassischer exponentieller Filter mit alpha = 1 - e^(-dt/τ)).
// Gleicher Kontinuitäts-Vertrag wie smoothRotation: Rückgabe NICHT normalisieren (s. Kommentar
// oben), kürzester Weg um den Kreis, `null` als prevRotation übernimmt den ersten Wert direkt.
export function smoothRotationTimed(prevRotation, targetRotation, dtMs, timeConstantMs = CONFIG.ROTATION_TIME_CONSTANT_MS) {
  if (prevRotation == null) return normalize360(targetRotation);
  const alpha = timeConstantMs > 0 ? 1 - Math.exp(-Math.max(dtMs, 0) / timeConstantMs) : 1;
  const shortestDiff = ((normalize360(targetRotation) - normalize360(prevRotation) + 540) % 360) - 180;
  return prevRotation + shortestDiff * alpha;
}

// --- Ableitungen fürs UI ---
// smoothedDistanceMeters < HINT_THRESHOLD_M (Vertrag 6.4) — gegen GEGLÄTTETE Distanz.
export function shouldRevealHint(smoothedDistanceMeters, config = CONFIG) {
  return smoothedDistanceMeters < config.HINT_THRESHOLD_M;
}
