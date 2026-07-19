// Reiner Tri-State-Ableiter (Bugs 1/3/5 — konsolidiertes Routen-Zustandsmodell).
// Ausführen:  node --test test/routeStatus.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveRouteDisplayStatus, ROUTE_DISPLAY_STATUS_META } from '../public/js/routeStatus.js';

test('deriveRouteDisplayStatus: erstellung, solange status !== such_modus (route_code_active egal)', () => {
  assert.equal(deriveRouteDisplayStatus({ status: 'erstellung', route_code_active: true }), 'erstellung');
  assert.equal(deriveRouteDisplayStatus({ status: 'erstellung', route_code_active: false }), 'erstellung');
});

test('deriveRouteDisplayStatus: such_modus + route_code_active=true -> aktiv', () => {
  assert.equal(deriveRouteDisplayStatus({ status: 'such_modus', route_code_active: true }), 'aktiv');
});

test('deriveRouteDisplayStatus: such_modus + route_code_active=false -> deaktiviert (Bug 5 Regression)', () => {
  assert.equal(deriveRouteDisplayStatus({ status: 'such_modus', route_code_active: false }), 'deaktiviert');
});

test('ROUTE_DISPLAY_STATUS_META: hat für jeden möglichen deriveRouteDisplayStatus-Wert einen Eintrag mit label+badgeClass (Review-Fix: ein Objekt statt zwei parallelen Maps)', () => {
  for (const status of ['erstellung', 'aktiv', 'deaktiviert']) {
    assert.ok(ROUTE_DISPLAY_STATUS_META[status], `Eintrag für "${status}" fehlt`);
    assert.equal(typeof ROUTE_DISPLAY_STATUS_META[status].label, 'string');
    assert.equal(typeof ROUTE_DISPLAY_STATUS_META[status].badgeClass, 'string');
  }
});
