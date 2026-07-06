// Reine State-Machine des Such-Modus (Vertrag Teil B).
// Ausführen:  node --test test/searchState.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { State, Event, nextState, classifyLoadedState } from '../public/js/searchMode.js';

const SEARCHING = { routeAvailable: true, allTerminal: false };
const COMPLETED = { routeAvailable: true, allTerminal: true };
const UNAVAILABLE = { routeAvailable: false, allTerminal: false };

test('classifyLoadedState: routeAvailable/allTerminal -> Zustand', () => {
  assert.equal(classifyLoadedState(SEARCHING), State.SEARCHING);
  assert.equal(classifyLoadedState(COMPLETED), State.COMPLETED);
  assert.equal(classifyLoadedState(UNAVAILABLE), State.ROUTE_UNAVAILABLE);
});

test('Berechtigung: erteilt -> LOADING, verweigert -> bleibt blockiert', () => {
  assert.equal(nextState(State.PERMISSION_REQUIRED, Event.PERMISSION_GRANTED), State.LOADING);
  assert.equal(nextState(State.PERMISSION_REQUIRED, Event.PERMISSION_DENIED), State.PERMISSION_REQUIRED);
});

test('LOADING: geladener Zustand klassifiziert', () => {
  assert.equal(nextState(State.LOADING, Event.STATE_LOADED, SEARCHING), State.SEARCHING);
  assert.equal(nextState(State.LOADING, Event.STATE_LOADED, COMPLETED), State.COMPLETED);
  assert.equal(nextState(State.LOADING, Event.STATE_LOADED, UNAVAILABLE), State.ROUTE_UNAVAILABLE);
});

test('LOADING: Fehler mit Cache -> SEARCHING (offline), ohne Cache -> ROUTE_UNAVAILABLE', () => {
  assert.equal(nextState(State.LOADING, Event.LOAD_FAILED, { hasCache: true }), State.SEARCHING);
  assert.equal(nextState(State.LOADING, Event.LOAD_FAILED, { hasCache: false }), State.ROUTE_UNAVAILABLE);
});

test('SEARCHING: Poll-Übergänge', () => {
  assert.equal(nextState(State.SEARCHING, Event.POLL_UPDATE, SEARCHING), State.SEARCHING);
  assert.equal(nextState(State.SEARCHING, Event.POLL_UPDATE, COMPLETED), State.COMPLETED);
  assert.equal(nextState(State.SEARCHING, Event.ROUTE_GONE), State.ROUTE_UNAVAILABLE);
});

test('SEARCHING: found/skip aufgelöst', () => {
  assert.equal(nextState(State.SEARCHING, Event.ACTION_RESOLVED, SEARCHING), State.SEARCHING);
  assert.equal(nextState(State.SEARCHING, Event.ACTION_RESOLVED, COMPLETED), State.COMPLETED);
});

test('Wiederbelebung läuft über LOADING (Vertrag B.2)', () => {
  // COMPLETED + Reset durch anderen erkannt
  assert.equal(nextState(State.COMPLETED, Event.POLL_UPDATE, SEARCHING), State.LOADING);
  // ROUTE_UNAVAILABLE + Route wieder gültig
  assert.equal(nextState(State.ROUTE_UNAVAILABLE, Event.POLL_UPDATE, SEARCHING), State.LOADING);
  // aber COMPLETED bleibt COMPLETED, solange terminal
  assert.equal(nextState(State.COMPLETED, Event.POLL_UPDATE, COMPLETED), State.COMPLETED);
});

test('Owner-Reset -> LOADING', () => {
  assert.equal(nextState(State.COMPLETED, Event.OWNER_RESET), State.LOADING);
});

test('offline-Flag ist orthogonal: kein Zustandswechsel', () => {
  assert.equal(nextState(State.SEARCHING, Event.CONNECTION_LOST), State.SEARCHING);
  assert.equal(nextState(State.SEARCHING, Event.CONNECTION_RESTORED), State.SEARCHING);
});
