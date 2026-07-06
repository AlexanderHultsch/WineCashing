// Trace-Replay-Harness (Vertrag C.5). Fährt die C.4-Pipeline offline über einen Trace.
// Nutzt ausschließlich die REINEN Funktionen aus sensorFusion.js — kein DOM/Sensor.
// Solange diese Funktionen noch TODO sind, werfen replayTrace-Aufrufe; die zugehörigen
// Tests sind bis dahin geskippt (test/traceReplay.test.js). Die Sample-Diskriminierung
// hier ist bereits implementiert und ohne sensorFusion testbar.

import * as fusion from '../../public/js/sensorFusion.js';

export function isGps(s) {
  return s.kind === 'gps' || (s.rawHeading === undefined && s.lat !== undefined && s.accuracy !== undefined);
}

export function isOrientation(s) {
  return s.kind === 'orientation' || s.rawHeading !== undefined;
}

// Führt den Trace aus und liefert pro GPS-Sample eine Zeile:
//   { timestamp, dist, bottles, drift, reveal }
// Orientation-Samples aktualisieren nur das zuletzt bekannte Heading (Fusions-Eingang).
export function replayTrace(trace, { config = fusion.CONFIG, screenAngle = 0 } = {}) {
  const target = trace.target;
  const windowBuf = [];
  let prevSmoothed = null;
  let lastGps = null;
  let lastHeading = null;
  const outputs = [];

  for (const s of trace.samples) {
    if (isOrientation(s)) {
      lastHeading = fusion.normalizeHeading(s, screenAngle);
      continue;
    }
    if (!isGps(s)) continue;

    const dtSeconds = lastGps ? (s.timestamp - lastGps.timestamp) / 1000 : 0;
    const plaus = fusion.isPlausibleMovement(prevSmoothed, s, dtSeconds, lastHeading, target, config);

    windowBuf.push(s);
    if (windowBuf.length > config.SMOOTHING_WINDOW) windowBuf.shift();
    const smoothed = fusion.smoothPosition(windowBuf, s, config);

    const dist = fusion.computeDistanceMeters(smoothed.lat, smoothed.lng, target.lat, target.lng);
    outputs.push({
      timestamp: s.timestamp,
      dist,
      bottles: fusion.metersToBottles(dist, config),
      drift: !plaus.plausible,
      reveal: fusion.shouldRevealHint(dist, config),
    });

    prevSmoothed = smoothed;
    lastGps = s;
  }
  return outputs;
}
