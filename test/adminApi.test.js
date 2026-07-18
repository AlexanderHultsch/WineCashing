// Admin-Endpunkte (Frage 6): volle Verwaltung fremder Routen/Nutzer, streng auf is_admin
// gegated. Ausführen:  node --test test/adminApi.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootBackend, createClient } from './helpers/backend.js';

async function withOwner(be, username = 'owner', password = 'secret1') {
  const c = createClient(be.url);
  const r = await c.post('/api/auth/register', { username, password });
  assert.equal(r.status, 201, r.text);
  return c;
}

async function makeAdmin(be, username = 'root', password = 'rootpass') {
  const c = await withOwner(be, username, password);
  const me = await c.get('/api/auth/me');
  be.repo.setUserAdmin(me.body.user.id, true);
  return { client: c, userId: me.body.user.id };
}

test('Admin: Nicht-Admin bekommt 403 NOT_ADMIN auf jedem /api/admin/*-Endpunkt', async () => {
  const be = await bootBackend();
  try {
    const bob = await withOwner(be, 'bob');
    for (const call of [
      () => bob.get('/api/admin/routes'),
      () => bob.get('/api/admin/users'),
      () => bob.del('/api/admin/routes/does-not-matter'),
      () => bob.del('/api/admin/users/does-not-matter'),
      () => bob.post('/api/admin/routes/x/code/renew'),
      () => bob.post('/api/admin/routes/x/code/activate'),
      () => bob.post('/api/admin/routes/x/code/deactivate'),
    ]) {
      const r = await call();
      assert.equal(r.status, 403, JSON.stringify(r.body));
      assert.equal(r.body.error.code, 'NOT_ADMIN');
    }
  } finally {
    await be.close();
  }
});

test('Admin: sieht ALLE Routen/Nutzer, nicht nur eigene', async () => {
  const be = await bootBackend();
  try {
    const { client: root } = await makeAdmin(be);
    const alice = await withOwner(be, 'alice');
    await alice.post('/api/routes', { name: 'Alices Route' });
    await root.post('/api/routes', { name: 'Roots Route' });

    let r = await root.get('/api/admin/routes');
    assert.equal(r.status, 200);
    assert.equal(r.body.length, 2);
    const names = r.body.map((x) => x.name).sort();
    assert.deepEqual(names, ['Alices Route', 'Roots Route']);
    const aliceRoute = r.body.find((x) => x.name === 'Alices Route');
    assert.equal(aliceRoute.owner_username, 'alice');
    assert.ok(typeof aliceRoute.route_code === 'string');

    r = await root.get('/api/admin/users');
    assert.equal(r.status, 200);
    const usernames = r.body.map((u) => u.username).sort();
    assert.deepEqual(usernames, ['alice', 'root']);
    const aliceUser = r.body.find((u) => u.username === 'alice');
    assert.equal(aliceUser.route_count, 1);
  } finally {
    await be.close();
  }
});

test('Admin: kann fremde Route löschen, Code neu erzeugen/(de)aktivieren', async () => {
  const be = await bootBackend();
  try {
    const { client: root } = await makeAdmin(be);
    const alice = await withOwner(be, 'alice');
    const created = await alice.post('/api/routes', { name: 'R' });
    const routeId = created.body.id;
    const originalCode = created.body.route_code;

    let r = await root.post(`/api/routes/${routeId}/waypoints`, { lat: 1, lng: 1, hint_text: 'h' });
    // Admin ist nicht Owner -> normaler Owner-Endpunkt bleibt fremd -> 404 (Isolation unangetastet)
    assert.equal(r.status, 404);

    r = await root.post(`/api/admin/routes/${routeId}/code/deactivate`);
    assert.equal(r.status, 200);
    assert.equal(r.body.active, false);

    r = await root.post(`/api/admin/routes/${routeId}/code/activate`);
    assert.equal(r.status, 200);
    assert.equal(r.body.active, true);
    assert.equal(r.body.route_code, originalCode);

    r = await root.post(`/api/admin/routes/${routeId}/code/renew`);
    assert.equal(r.status, 200);
    assert.notEqual(r.body.route_code, originalCode);

    r = await root.del(`/api/admin/routes/${routeId}`);
    assert.equal(r.status, 204);

    r = await alice.get(`/api/routes/${routeId}`);
    assert.equal(r.status, 404);
  } finally {
    await be.close();
  }
});

test('Admin: Nutzer löschen räumt dessen Routen kaskadierend mit auf; eigener Account nicht löschbar', async () => {
  const be = await bootBackend();
  try {
    const { client: root, userId: rootId } = await makeAdmin(be);
    const alice = await withOwner(be, 'alice');
    await alice.post('/api/routes', { name: 'R' });
    const aliceMe = await alice.get('/api/auth/me');

    let r = await root.del(`/api/admin/users/${rootId}`);
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, 'SELF_DELETE_FORBIDDEN');

    r = await root.del(`/api/admin/users/${aliceMe.body.user.id}`);
    assert.equal(r.status, 204);

    r = await root.get('/api/admin/routes');
    assert.deepEqual(r.body, []);

    r = await root.del('/api/admin/users/unknown-id');
    assert.equal(r.status, 404);
  } finally {
    await be.close();
  }
});
