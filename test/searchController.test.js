// Orchestrierung des Such-Modus mit injizierten Fakes (Vertrag B & C.4).
// Kein Browser nötig — geolocation/sensors/api werden gefälscht.
// Ausführen:  node --test test/searchController.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { State, createSearchController } from '../public/js/searchMode.js';

const WAYPOINTS = [
  { id: 'w1', route_id: 'r1', order_index: 0, lat: 48.1371, lng: 11.5754, hint_text: 'unter der Bank' },
  { id: 'w2', route_id: 'r1', order_index: 1, lat: 48.1375, lng: 11.5758, hint_text: 'im Busch' },
];

function makeRouteState(status) {
  return {
    route: { id: 'r1', name: 'Test', status: 'such_modus' },
    waypoints: WAYPOINTS,
    progress: { started_at: 't0', completed_at: null },
    waypoint_status: WAYPOINTS.map((w) => ({ waypoint_id: w.id, status: status[w.id] || 'offen', updated_at: 't' })),
    server_time: 't',
  };
}

function setup(overrides = {}) {
  const status = { w1: 'offen', w2: 'offen' };
  const calls = { found: [], skip: [] };
  const api = {
    state: async () => makeRouteState(status),
    found: async (_rid, wid) => {
      calls.found.push(wid);
      status[wid] = 'gefunden';
    },
    skip: async (_rid, wid) => {
      calls.skip.push(wid);
      status[wid] = 'übersprungen';
    },
  };
  let capturedGpsError = null;
  const geolocation = {
    requestLocationPermission: async () => ({ lat: 0, lng: 0, accuracy: 5, timestamp: 0 }),
    watchPosition: (_onSample, onError) => {
      capturedGpsError = onError;
      return () => {};
    },
    ...overrides.geolocation,
  };
  const sensors = {
    getScreenAngle: () => 0,
    requestOrientationPermission: async () => true,
    requestWakeLock: async () => ({ supported: false, release: () => {} }),
    watchOrientation: () => () => {},
    ...overrides.sensors,
  };
  const controller = createSearchController({
    routeId: 'r1',
    api,
    geolocation,
    sensors,
    pollIntervalMs: 1_000_000, // Intervall feuert im Test nicht; stop() räumt auf
  });
  return { controller, api, status, calls, triggerGpsError: (err) => capturedGpsError(err) };
}

test('start: Berechtigung -> Laden -> SEARCHING, aktiver Wegpunkt w1', async () => {
  const { controller } = setup();
  await controller.start();
  assert.equal(controller.getState(), State.SEARCHING);
  assert.equal(controller.getViewModel().activeWaypoint.id, 'w1');
  controller.stop();
});

test('GPS-Pipeline: Distanz sinkt beim Zugehen, Orientation liefert Rotation', async () => {
  const { controller } = setup();
  await controller.start();

  // Gehschritte ~3 m alle 2 s (~1.5 m/s) — plausibel, kein Drift.
  controller.onGpsSample({ lat: 48.136830, lng: 11.5754, accuracy: 6, timestamp: 0 });
  const d1 = controller.getViewModel().distanceMeters;
  controller.onGpsSample({ lat: 48.136857, lng: 11.5754, accuracy: 6, timestamp: 2000 });
  controller.onGpsSample({ lat: 48.136884, lng: 11.5754, accuracy: 5, timestamp: 4000 });
  const d3 = controller.getViewModel().distanceMeters;

  assert.ok(d1 > d3, `Distanz sollte sinken: ${d1} -> ${d3}`);

  controller.onOrientationSample({ rawHeading: 0, absolute: true, source: 'absolute' });
  assert.equal(typeof controller.getViewModel().rotation, 'number');
  controller.stop();
});

test('found: aktiver Wegpunkt rückt auf w2 vor', async () => {
  const { controller, calls } = setup();
  await controller.start();

  await controller.reportFound();
  assert.deepEqual(calls.found, ['w1']);
  assert.equal(controller.getState(), State.SEARCHING);
  assert.equal(controller.getViewModel().activeWaypoint.id, 'w2');
  controller.stop();
});

test('alle terminal -> COMPLETED, kein aktiver Wegpunkt', async () => {
  const { controller } = setup();
  await controller.start();
  await controller.reportFound(); // w1
  await controller.reportSkip(); // w2
  assert.equal(controller.getState(), State.COMPLETED);
  assert.equal(controller.getViewModel().activeWaypoint, null);
  controller.stop();
});

test('offline: Aktionen werden eingereiht und bei Wiederverbindung gesendet (Vertrag 10)', async () => {
  const { controller, calls } = setup();
  await controller.start();

  controller.setOffline(true);
  await controller.reportFound();
  assert.equal(calls.found.length, 0, 'offline: nicht gesendet');
  assert.equal(controller.getViewModel().queuedActions, 1);

  await controller.setOffline(false); // flush + poll
  assert.deepEqual(calls.found, ['w1']);
  assert.equal(controller.getViewModel().queuedActions, 0);
  controller.stop();
});

test('GPS-Fehler (kein Fix/Timeout) markiert nur gpsProblem, NICHT offline', async () => {
  const { controller, triggerGpsError } = setup();
  await controller.start();

  triggerGpsError({ code: 2 }); // POSITION_UNAVAILABLE
  const vm = controller.getViewModel();
  assert.equal(vm.gpsProblem, true, 'GPS-Störung markiert');
  assert.equal(vm.offline, false, 'GPS-Fehler ist NICHT gleichbedeutend mit offline (Bug-Regression)');
  assert.equal(controller.getState(), State.SEARCHING, 'bleibt in SEARCHING, kein Zustandswechsel');

  // Ein gutes Sample danach löscht die Störung wieder.
  controller.onGpsSample({ lat: 48.1371, lng: 11.5754, accuracy: 6, timestamp: 1000 });
  assert.equal(controller.getViewModel().gpsProblem, false, 'gpsProblem wird von gutem Sample gelöscht');
  controller.stop();
});

test('GPS-Fehler code 1 (PERMISSION_DENIED) -> zurück auf PERMISSION_REQUIRED', async () => {
  const { controller, triggerGpsError } = setup();
  await controller.start();
  assert.equal(controller.getState(), State.SEARCHING);

  triggerGpsError({ code: 1 });
  assert.equal(controller.getState(), State.PERMISSION_REQUIRED, 'Standort-Widerruf mitten in der Suche -> Berechtigungs-Screen (nicht "Offline")');
  assert.equal(controller.getViewModel().offline, false);
  controller.stop();
});

test('requestCompass: setzt needsCompassPermission, wenn iOS die Anfrage ablehnt', async () => {
  const { controller } = setup({ sensors: { requestOrientationPermission: async () => false } });
  await controller.start();
  assert.equal(controller.getViewModel().needsCompassPermission, true, 'start() ohne Geste -> iOS lehnt ab -> Button muss sichtbar sein');
  controller.stop();
});

test('requestCompass: erfolgreiche Nachfrage blendet den Hinweis wieder aus', async () => {
  let granted = false;
  const { controller } = setup({ sensors: { requestOrientationPermission: async () => granted } });
  await controller.start();
  assert.equal(controller.getViewModel().needsCompassPermission, true);

  granted = true; // Nutzer klickt "Kompass aktivieren" (echte Geste, diesmal erlaubt der Browser)
  await controller.requestCompass();
  assert.equal(controller.getViewModel().needsCompassPermission, false);
  controller.stop();
});

test('hasCompass: wird erst nach dem ersten Orientation-Sample true', async () => {
  const { controller } = setup();
  await controller.start();
  assert.equal(controller.getViewModel().hasCompass, false);
  controller.onOrientationSample({ rawHeading: 10, absolute: true, source: 'absolute' });
  assert.equal(controller.getViewModel().hasCompass, true);
  controller.stop();
});

test('Route weg (404) -> ROUTE_UNAVAILABLE', async () => {
  const { controller, api } = setup();
  await controller.start();

  api.state = async () => {
    const err = new Error('gone');
    err.status = 404;
    throw err;
  };
  await controller.poll();
  assert.equal(controller.getState(), State.ROUTE_UNAVAILABLE);
  controller.stop();
});
