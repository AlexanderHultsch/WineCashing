// Reine Backend-Bausteine: Domänenlogik, Passwort-Hashing, Routen-Code.
// Ausführen:  node --test test/domain.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  WAYPOINT_STATUS,
  isTerminal,
  resolveStatusTransition,
  allTerminal,
  toRouteSummary,
  buildRouteState,
} from '../lib/domain.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import {
  CODE_ALPHABET,
  generateRouteCode,
  formatRouteCode,
  isValidRouteCodeFormat,
} from '../lib/routeCode.js';

// --- Status-Übergänge (idempotent & monoton) ---
test('resolveStatusTransition: offen -> terminal, terminal = No-Op', () => {
  assert.deepEqual(resolveStatusTransition('offen', 'found'), { status: 'gefunden', changed: true });
  assert.deepEqual(resolveStatusTransition('offen', 'skip'), { status: 'übersprungen', changed: true });
  assert.deepEqual(resolveStatusTransition('gefunden', 'found'), { status: 'gefunden', changed: false });
  assert.deepEqual(resolveStatusTransition('übersprungen', 'skip'), { status: 'übersprungen', changed: false });
  // auch Kreuz-Aktion auf terminal ist No-Op
  assert.deepEqual(resolveStatusTransition('gefunden', 'skip'), { status: 'gefunden', changed: false });
});

test('isTerminal & allTerminal', () => {
  assert.equal(isTerminal('offen'), false);
  assert.equal(isTerminal('gefunden'), true);
  assert.equal(allTerminal([{ status: 'gefunden' }, { status: 'übersprungen' }]), true);
  assert.equal(allTerminal([{ status: 'gefunden' }, { status: 'offen' }]), false);
  assert.equal(allTerminal([]), false); // leere Route nicht abgeschlossen
});

// --- Shaping ---
test('toRouteSummary: 0/1 -> bool, fehlender Code -> null', () => {
  const s = toRouteSummary({ id: 'r', name: 'N', status: 'erstellung', route_code: null, route_code_active: 0, created_at: 't' });
  assert.equal(s.route_code, null);
  assert.equal(s.route_code_active, false);
});

test('buildRouteState: erwartete Form (Vertrag A.6)', () => {
  const state = buildRouteState({
    route: { id: 'r', name: 'N', status: 'such_modus' },
    waypoints: [{ id: 'w', route_id: 'r', order_index: 0, lat: 1, lng: 2, hint_text: 'h' }],
    statuses: [{ waypoint_id: 'w', status: WAYPOINT_STATUS.OFFEN, updated_at: 't' }],
    progress: { started_at: 't', completed_at: null },
    serverTime: 'now',
  });
  assert.deepEqual(Object.keys(state), ['route', 'waypoints', 'progress', 'waypoint_status', 'server_time']);
  assert.equal(state.server_time, 'now');
  assert.equal(state.waypoint_status[0].status, 'offen');
});

// --- Passwort ---
test('Passwort: hash/verify Roundtrip, falsche/verfälschte schlagen fehl', () => {
  const stored = hashPassword('correct horse');
  assert.ok(stored.startsWith('scrypt$'));
  assert.equal(verifyPassword('correct horse', stored), true);
  assert.equal(verifyPassword('wrong', stored), false);
  assert.equal(verifyPassword('correct horse', stored.slice(0, -2) + '00'), false);
});

// --- Routen-Code ---
test('Alphabet ist GROSS und schließt verwechselbare Zeichen aus (0 1 I L O)', () => {
  assert.equal(CODE_ALPHABET, CODE_ALPHABET.toUpperCase());
  for (const ch of ['0', '1', 'I', 'L', 'O']) {
    assert.ok(!CODE_ALPHABET.includes(ch), `Alphabet enthält ${ch}`);
  }
});

test('generateRouteCode: gültiges Format mit Bindestrich nach Position 4', () => {
  const code = generateRouteCode();
  assert.equal(code.length, 9);
  assert.equal(code[4], '-');
  assert.equal(code, code.toUpperCase());
  assert.ok(isValidRouteCodeFormat(code));
});

test('formatRouteCode: normalisiert auf GROSS, egal welche Eingabe-Schreibweise', () => {
  assert.equal(formatRouteCode('Wc7fK2pq'), 'WC7F-K2PQ');
  assert.equal(formatRouteCode('wc7f-k2pq'), 'WC7F-K2PQ');
  assert.equal(formatRouteCode('WC7F-K2PQ'), 'WC7F-K2PQ');
});

test('isValidRouteCodeFormat: case-insensitiv, lehnt verbotene Zeichen ab', () => {
  assert.equal(isValidRouteCodeFormat('Wc7f-K2pq'), true);
  assert.equal(isValidRouteCodeFormat('WC7F-K2PQ'), true);
  assert.equal(isValidRouteCodeFormat('Wc7f-K2p0'), false); // 0 nicht im Alphabet
  assert.equal(isValidRouteCodeFormat('short'), false);
});
