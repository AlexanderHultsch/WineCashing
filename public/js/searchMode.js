// Such-Modus — State-Machine + Pipeline-Orchestrierung (Vertrag Teil B & C.4).
// NICHT rein: hält Verlaufspuffer, treibt Polling (~7 s) und ruft die reinen Funktionen.

import * as fusion from './sensorFusion.js';

// Zustände (Vertrag B.1).
export const State = {
  PERMISSION_REQUIRED: 'PERMISSION_REQUIRED',
  LOADING: 'LOADING',
  SEARCHING: 'SEARCHING',
  COMPLETED: 'COMPLETED',
  ROUTE_UNAVAILABLE: 'ROUTE_UNAVAILABLE',
};

// SEARCHING-Unterzustände (rein UI).
export const HintSubState = { HIDDEN: 'HINT_HIDDEN', REVEALED: 'HINT_REVEALED' };

export const POLL_INTERVAL_MS = 7000;

// KERNFUNKTION (rein, Vertrag B.4): erster Wegpunkt mit Status "offen" nach order_index; sonst null.
// Nach JEDEM State-Update / Poll aufrufen -> zeigt nie auf gelöschten/verschobenen Wegpunkt.
export function deriveActiveWaypoint(waypoints, waypointStatus) {
  const statusOf = (id) =>
    (waypointStatus.find((s) => s.waypoint_id === id) || {}).status || 'offen';
  const sorted = [...waypoints].sort((a, b) => a.order_index - b.order_index);
  for (const wp of sorted) {
    if (statusOf(wp.id) === 'offen') return wp;
  }
  return null; // -> COMPLETED
}

// Orchestrierung (Skeleton). TODO:
//  - Berechtigungen (geolocation.js/sensors.js) -> PERMISSION_REQUIRED bis erteilt
//  - Polling /state, Übergänge gemäß B.2, offline-Flag + Aktions-Queue (Vertrag 10)
//  - GPS-Event-Pipeline (C.4): isPlausibleMovement -> smoothPosition -> Distanz/Flaschen -> shouldRevealHint
//  - Orientation-Event-Pipeline (C.4): normalizeHeading -> computeBearing -> computeCompassRotation
export function createSearchController(/* deps */) {
  throw new Error('createSearchController: TODO');
}
