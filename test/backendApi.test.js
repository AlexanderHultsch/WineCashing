// End-to-End-Backend-Tests: echte Express-App gegen :memory:-SQLite über HTTP.
// Ausführen:  node --test test/backendApi.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootBackend, createClient } from './helpers/backend.js';

// Registriert einen Owner und gibt einen eingeloggten Client zurück.
async function withOwner(be, username = 'owner', password = 'secret1') {
  const c = createClient(be.url);
  const r = await c.post('/api/auth/register', { username, password });
  assert.equal(r.status, 201, r.text);
  return c;
}

test('Auth: register -> me; doppelter Name -> 409; me ohne Login -> 401', async () => {
  const be = await bootBackend();
  try {
    const c = await withOwner(be, 'alice');
    let r = await c.get('/api/auth/me');
    assert.equal(r.status, 200);
    assert.equal(r.body.user.username, 'alice');

    r = await c.post('/api/auth/register', { username: 'alice', password: 'secret1' });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'USERNAME_TAKEN');

    const anon = createClient(be.url);
    r = await anon.get('/api/auth/me');
    assert.equal(r.status, 401);
    assert.equal(r.body.error.code, 'UNAUTHENTICATED');
  } finally {
    await be.close();
  }
});

test('Auth: logout, falsches Passwort -> 401', async () => {
  const be = await bootBackend();
  try {
    const c = await withOwner(be, 'bob', 'goodpass');
    await c.post('/api/auth/logout');
    let r = await c.get('/api/auth/me');
    assert.equal(r.status, 401);

    r = await c.post('/api/auth/login', { username: 'bob', password: 'nope' });
    assert.equal(r.status, 401);
    assert.equal(r.body.error.code, 'INVALID_CREDENTIALS');

    r = await c.post('/api/auth/login', { username: 'bob', password: 'goodpass' });
    assert.equal(r.status, 200);
  } finally {
    await be.close();
  }
});

test('Route: anlegen (erstellung), Start-Guard ohne Wegpunkte -> 409, dann such_modus', async () => {
  const be = await bootBackend();
  try {
    const c = await withOwner(be);
    let r = await c.post('/api/routes', { name: 'Parkrunde' });
    assert.equal(r.status, 201);
    assert.equal(r.body.status, 'erstellung');
    assert.deepEqual(r.body.waypoints, []);
    const routeId = r.body.id;

    r = await c.post(`/api/routes/${routeId}/start`);
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'NO_WAYPOINTS');

    r = await c.post(`/api/routes/${routeId}/waypoints`, { lat: 48.1371, lng: 11.5754, hint_text: 'unter der Bank' });
    assert.equal(r.status, 201);

    r = await c.get(`/api/routes/${routeId}`);
    assert.equal(r.body.waypoints.length, 1);

    r = await c.post(`/api/routes/${routeId}/start`);
    assert.equal(r.status, 200);
    assert.equal(r.body.route.status, 'such_modus');
    assert.ok(r.body.progress.started_at);
  } finally {
    await be.close();
  }
});

test('Wegpunkte: Neu-Sortieren per ordered_ids', async () => {
  const be = await bootBackend();
  try {
    const c = await withOwner(be);
    const routeId = (await c.post('/api/routes', { name: 'R' })).body.id;
    const ids = [];
    for (const h of ['a', 'b', 'c']) {
      const r = await c.post(`/api/routes/${routeId}/waypoints`, { lat: 48, lng: 11, hint_text: h });
      ids.push(r.body.id);
    }
    const reordered = [ids[2], ids[0], ids[1]];
    const r = await c.put(`/api/routes/${routeId}/waypoints/order`, { ordered_ids: reordered });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.map((w) => w.id), reordered);
    assert.deepEqual(r.body.map((w) => w.order_index), [0, 1, 2]);
  } finally {
    await be.close();
  }
});

test('Mitsucher: join -> state -> found (idempotent) -> completed; deactivate sperrt aus', async () => {
  const be = await bootBackend();
  try {
    const c = await withOwner(be);
    const routeId = (await c.post('/api/routes', { name: 'R' })).body.id;
    const w1 = (await c.post(`/api/routes/${routeId}/waypoints`, { lat: 48.1, lng: 11.5, hint_text: 'h1' })).body.id;
    const w2 = (await c.post(`/api/routes/${routeId}/waypoints`, { lat: 48.2, lng: 11.6, hint_text: 'h2' })).body.id;
    await c.post(`/api/routes/${routeId}/start`);

    const codeRes = await c.post(`/api/routes/${routeId}/code`);
    assert.equal(codeRes.status, 200);
    assert.equal(codeRes.body.active, true);
    const code = codeRes.body.route_code;

    // Mitsucher (kontolos)
    const searcher = createClient(be.url);
    let r = await searcher.post('/api/join', { route_code: code });
    assert.equal(r.status, 200);
    assert.equal(r.body.waypoints.length, 2);
    assert.ok(r.body.waypoint_status.every((s) => s.status === 'offen'));

    const codeHeader = { 'X-Route-Code': code };
    r = await searcher.get(`/api/routes/${routeId}/state`, codeHeader);
    assert.equal(r.status, 200);

    // found w1 zweimal -> idempotent
    r = await searcher.post(`/api/routes/${routeId}/waypoints/${w1}/found`, {}, codeHeader);
    assert.equal(r.status, 200);
    assert.equal(r.body.waypoint_status.status, 'gefunden');
    assert.equal(r.body.progress.completed_at, null);
    r = await searcher.post(`/api/routes/${routeId}/waypoints/${w1}/found`, {}, codeHeader);
    assert.equal(r.status, 200);
    assert.equal(r.body.waypoint_status.status, 'gefunden');

    // skip w2 -> alle terminal -> completed_at gesetzt
    r = await searcher.post(`/api/routes/${routeId}/waypoints/${w2}/skip`, {}, codeHeader);
    assert.equal(r.status, 200);
    assert.ok(r.body.progress.completed_at);

    // Code deaktivieren (Owner) -> Mitsucher ausgesperrt
    r = await c.post(`/api/routes/${routeId}/code/deactivate`);
    assert.deepEqual(r.body, { active: false });

    r = await searcher.get(`/api/routes/${routeId}/state`, codeHeader);
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, 'ROUTE_ACCESS_REVOKED');

    r = await searcher.post('/api/join', { route_code: code });
    assert.equal(r.status, 403);
  } finally {
    await be.close();
  }
});

test('join: unbekannter Code -> 404 CODE_NOT_FOUND', async () => {
  const be = await bootBackend();
  try {
    const anon = createClient(be.url);
    const r = await anon.post('/api/join', { route_code: 'Zzzz-9999' });
    assert.equal(r.status, 404);
    assert.equal(r.body.error.code, 'CODE_NOT_FOUND');
  } finally {
    await be.close();
  }
});

test('reset: setzt Wegpunkte zurück auf offen', async () => {
  const be = await bootBackend();
  try {
    const c = await withOwner(be);
    const routeId = (await c.post('/api/routes', { name: 'R' })).body.id;
    const w1 = (await c.post(`/api/routes/${routeId}/waypoints`, { lat: 48, lng: 11, hint_text: 'h' })).body.id;
    await c.post(`/api/routes/${routeId}/start`);
    await c.post(`/api/routes/${routeId}/waypoints/${w1}/found`);

    let r = await c.get(`/api/routes/${routeId}/state`);
    assert.equal(r.body.waypoint_status[0].status, 'gefunden');

    r = await c.post(`/api/routes/${routeId}/reset`);
    assert.equal(r.status, 200);
    assert.equal(r.body.progress.completed_at, null);

    r = await c.get(`/api/routes/${routeId}/state`);
    assert.equal(r.body.waypoint_status[0].status, 'offen');
  } finally {
    await be.close();
  }
});

test('reset: auch ein Mitsucher mit gültigem Code darf zurücksetzen (nicht nur Owner)', async () => {
  const be = await bootBackend();
  try {
    const c = await withOwner(be);
    const created = await c.post('/api/routes', { name: 'R' });
    const routeId = created.body.id;
    // Code existiert schon direkt nach Anlage (Auto-Generierung).
    assert.ok(created.body.route_code);
    assert.equal(created.body.route_code_active, true);
    const code = created.body.route_code;

    const w1 = (await c.post(`/api/routes/${routeId}/waypoints`, { lat: 48, lng: 11, hint_text: 'h' })).body.id;
    await c.post(`/api/routes/${routeId}/start`);
    await c.post(`/api/routes/${routeId}/waypoints/${w1}/skip`);

    let r = await c.get(`/api/routes/${routeId}/state`);
    assert.equal(r.body.waypoint_status[0].status, 'übersprungen');
    assert.ok(r.body.progress.completed_at);

    // Mitsucher (kontolos, nur per Code) löst den Reset aus.
    const searcher = createClient(be.url);
    const codeHeader = { 'X-Route-Code': code };
    r = await searcher.post(`/api/routes/${routeId}/reset`, {}, codeHeader);
    assert.equal(r.status, 200);
    assert.equal(r.body.progress.completed_at, null);

    r = await searcher.get(`/api/routes/${routeId}/state`, codeHeader);
    assert.equal(r.body.waypoint_status[0].status, 'offen');
  } finally {
    await be.close();
  }
});

test('reset: ohne Login und ohne Code -> 401', async () => {
  const be = await bootBackend();
  try {
    const c = await withOwner(be);
    const routeId = (await c.post('/api/routes', { name: 'R' })).body.id;
    const anon = createClient(be.url);
    const r = await anon.post(`/api/routes/${routeId}/reset`);
    assert.equal(r.status, 401);
  } finally {
    await be.close();
  }
});

test('Owner-Isolation: fremde Route -> 404', async () => {
  const be = await bootBackend();
  try {
    const alice = await withOwner(be, 'alice');
    const routeId = (await alice.post('/api/routes', { name: 'Geheim' })).body.id;

    const mallory = await withOwner(be, 'mallory');
    const r = await mallory.get(`/api/routes/${routeId}`);
    assert.equal(r.status, 404);
  } finally {
    await be.close();
  }
});

test('Admin: reset-password; Nicht-Admin -> 403 NOT_ADMIN', async () => {
  const be = await bootBackend();
  try {
    const root = await withOwner(be, 'root', 'rootpass');
    const me = await root.get('/api/auth/me');
    be.repo.setUserAdmin(me.body.user.id, true);

    const bob = await withOwner(be, 'bob', 'bobpass1');

    let r = await root.post('/api/auth/admin/reset-password', { username: 'bob', new_password: 'brandnew' });
    assert.equal(r.status, 200);

    const bob2 = createClient(be.url);
    r = await bob2.post('/api/auth/login', { username: 'bob', password: 'brandnew' });
    assert.equal(r.status, 200);

    r = await bob.post('/api/auth/admin/reset-password', { username: 'root', new_password: 'whatever' });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, 'NOT_ADMIN');
  } finally {
    await be.close();
  }
});
