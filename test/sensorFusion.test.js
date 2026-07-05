// Trace-Replay-Regressionstests (Vertrag C.5).
// Alle Kernfunktionen sind rein -> der Algorithmus wird offline gegen aufgezeichnete
// Traces geprüft (Log-Format aus Spec 6.11.1). Kalibrierung von CONFIG (C.2) läuft hierüber.
//
// Ausführen:  node --test test/sensorFusion.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveActiveWaypoint } from '../public/js/searchMode.js';
// import * as fusion from '../public/js/sensorFusion.js';

test('deriveActiveWaypoint: erster "offen" nach order_index', () => {
  const waypoints = [
    { id: 'b', order_index: 1 },
    { id: 'a', order_index: 0 },
    { id: 'c', order_index: 2 },
  ];
  const status = [
    { waypoint_id: 'a', status: 'gefunden' },
    { waypoint_id: 'b', status: 'offen' },
    { waypoint_id: 'c', status: 'offen' },
  ];
  assert.equal(deriveActiveWaypoint(waypoints, status).id, 'b');
});

test('deriveActiveWaypoint: alle terminal -> null (COMPLETED)', () => {
  const waypoints = [{ id: 'a', order_index: 0 }];
  const status = [{ waypoint_id: 'a', status: 'übersprungen' }];
  assert.equal(deriveActiveWaypoint(waypoints, status), null);
});

// TODO (nach Implementierung von sensorFusion.js), Vertrag C.5:
//  - kein plausibler realer Schritt wird als Drift verworfen
//  - bekannte Ausreißer-Samples werden verworfen
//  - geglättete Distanz konvergiert monoton beim Zugehen aufs Ziel
// test('trace-replay: feldtest-park-2026.json', () => { ... });
