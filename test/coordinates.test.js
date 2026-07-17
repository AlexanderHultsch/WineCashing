// Koordinaten-Anzeige-Hilfsfunktionen (Dezimal -> DMS, Google-Maps-Anzeigestil).
// Ausführen:  node --test test/coordinates.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decimalToDms, formatDms } from '../public/js/coordinates.js';

test('decimalToDms: bekannte Referenzwerte, Rundung auf 1 Nachkommastelle bei Sekunden', () => {
  assert.deepEqual(decimalToDms(48.999444), { deg: 48, min: 59, sec: 58.0 });
  assert.deepEqual(decimalToDms(8.488167), { deg: 8, min: 29, sec: 17.4 });
});

test('decimalToDms: Rundungs-Überlauf trägt sec->min->deg sauber durch', () => {
  // Regression: 1°59'59.96" rundet die Sekunden auf 60.0 -> muss zu 2°00'0.0" tragen,
  // nicht bei ungültigem "1°60'0.0"" stehen bleiben.
  assert.deepEqual(decimalToDms(1 + 59 / 60 + 59.96 / 3600), { deg: 2, min: 0, sec: 0 });
});

test('formatDms: Google-Maps-Stil inkl. Himmelsrichtung', () => {
  assert.equal(formatDms(48.999444, true), '48°59\'58.0"N');
  assert.equal(formatDms(8.488167, false), '8°29\'17.4"E');
  assert.equal(formatDms(-33.859722, true), '33°51\'35.0"S');
  assert.equal(formatDms(-151.211111, false), '151°12\'40.0"W');
});
