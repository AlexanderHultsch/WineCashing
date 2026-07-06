// Unit-Tests der reinen Funktionen (Vertrag Teil B/C).
// Ausführen:  node --test test/sensorFusion.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveActiveWaypoint } from '../public/js/searchMode.js';
import {
  CONFIG,
  normalize360,
  angularDifference,
  computeDistanceMeters,
  computeBearing,
  metersToBottles,
  normalizeHeading,
  computeCompassRotation,
  isPlausibleMovement,
  smoothPosition,
  shouldRevealHint,
} from '../public/js/sensorFusion.js';

const approx = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg}: ${actual} ≉ ${expected} (±${tol})`);

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

// --- Winkel-Helfer ---
test('normalize360: wickelt in [0..360)', () => {
  assert.equal(normalize360(370), 10);
  assert.equal(normalize360(-10), 350);
  assert.equal(normalize360(0), 0);
});

test('angularDifference: kürzester Weg, [0..180]', () => {
  assert.equal(angularDifference(10, 350), 20);
  assert.equal(angularDifference(0, 180), 180);
  assert.equal(angularDifference(90, 90), 0);
});

// --- Geometrie ---
test('computeDistanceMeters: 1° Breite ≈ 111.2 km; 0 bei Identität', () => {
  approx(computeDistanceMeters(0, 0, 1, 0), 111195, 50, '1° lat');
  assert.equal(computeDistanceMeters(48.1, 11.5, 48.1, 11.5), 0);
});

test('computeBearing: Nord=0, Ost≈90', () => {
  approx(computeBearing(0, 0, 1, 0), 0, 0.5, 'Nord');
  approx(computeBearing(0, 0, 0, 1), 90, 0.5, 'Ost');
});

test('metersToBottles: Meter / Flaschenlänge', () => {
  assert.equal(metersToBottles(3, CONFIG), 10); // 3 m / 0.3 m
});

// --- Heading / Kompass ---
test('normalizeHeading: iOS direkt, Android 360 - alpha', () => {
  assert.equal(normalizeHeading({ rawHeading: 90, source: 'ios' }), 90);
  assert.equal(normalizeHeading({ rawHeading: 90, source: 'absolute' }), 270);
  assert.equal(normalizeHeading({ rawHeading: 90, source: 'absolute' }, 45), 315);
});

test('computeCompassRotation: bearing/heading/declination vereinheitlicht', () => {
  assert.equal(computeCompassRotation(90, 0, 0), 90);
  assert.equal(computeCompassRotation(0, 90, 0), 270);
  assert.equal(computeCompassRotation(90, 0, 10), 80);
});

// --- Plausibilität ---
test('isPlausibleMovement: ohne Referenz plausibel', () => {
  const p = isPlausibleMovement(null, { lat: 0, lng: 0 }, 0, null, null, CONFIG);
  assert.equal(p.plausible, true);
});

test('isPlausibleMovement: Teleport-Sprung ist unplausibel', () => {
  const prev = { lat: 48.1368, lng: 11.5754 };
  const jump = { lat: 48.1700, lng: 11.5754, accuracy: 45 };
  const p = isPlausibleMovement(prev, jump, 2, 0, { lat: 48.1371, lng: 11.5754 }, CONFIG);
  assert.equal(p.plausible, false);
  assert.ok(p.impliedSpeed > CONFIG.RUN_SPEED_SPIKE);
});

test('isPlausibleMovement: ruhiger Gehschritt ist plausibel', () => {
  const prev = { lat: 48.13683, lng: 11.5754 };
  const step = { lat: 48.13686, lng: 11.5754, accuracy: 7 }; // ~3.3 m
  const p = isPlausibleMovement(prev, step, 2, 0, { lat: 48.1371, lng: 11.5754 }, CONFIG);
  assert.equal(p.plausible, true);
});

// --- Glättung ---
test('smoothPosition: gewichtet nach Genauigkeit (bessere accuracy zählt mehr)', () => {
  const samples = [
    { lat: 0, lng: 0, accuracy: 30, timestamp: 0 },
    { lat: 10, lng: 0, accuracy: 5, timestamp: 1000 },
  ];
  const out = smoothPosition(samples, samples[1], CONFIG);
  assert.ok(out.lat > 8, `genaueres Sample dominiert: ${out.lat}`);
});

test('smoothPosition: verwirft Ausreißer, wenn bessere Messung in Reichweite', () => {
  const samples = [
    { lat: 0, lng: 0, accuracy: 6, timestamp: 0 },
    { lat: 1000, lng: 0, accuracy: 45, timestamp: 2000 }, // Ausreißer
  ];
  const out = smoothPosition(samples, samples[1], CONFIG);
  approx(out.lat, 0, 1e-6, 'Ausreißer ausgeschlossen');
});

// --- Hinweis-Freischaltung ---
test('shouldRevealHint: nur unter Schwelle', () => {
  assert.equal(shouldRevealHint(10, CONFIG), true);
  assert.equal(shouldRevealHint(15, CONFIG), false);
  assert.equal(shouldRevealHint(20, CONFIG), false);
});
