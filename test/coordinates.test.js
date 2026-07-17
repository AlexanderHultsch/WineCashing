// Koordinaten-Hilfsfunktionen (DMS <-> Dezimal, Google-Maps-Parser).
// Ausführen:  node --test test/coordinates.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dmsToDecimal, decimalToDms, formatDms, parseCoordinateString } from '../public/js/coordinates.js';

const approx = (actual, expected, tol = 1e-4) => assert.ok(Math.abs(actual - expected) <= tol, `${actual} ≉ ${expected}`);

test('dmsToDecimal: Nordhalbkugel/Osten positiv, Süd/West negativ', () => {
  approx(dmsToDecimal(48, 59, 58.0, 'N'), 48.999444);
  approx(dmsToDecimal(8, 29, 17.4, 'E'), 8.488167);
  approx(dmsToDecimal(33, 51, 35.0, 'S'), -33.859722);
  approx(dmsToDecimal(151, 12, 40.0, 'W'), -151.211111);
});

test('decimalToDms: Rundung auf 1 Nachkommastelle bei Sekunden, kein Überlauf', () => {
  assert.deepEqual(decimalToDms(48.999444), { deg: 48, min: 59, sec: 58.0 });
  assert.deepEqual(decimalToDms(8.488167), { deg: 8, min: 29, sec: 17.4 });
});

test('formatDms: Google-Maps-Stil inkl. Himmelsrichtung', () => {
  assert.equal(formatDms(48.999444, true), '48°59\'58.0"N');
  assert.equal(formatDms(8.488167, false), '8°29\'17.4"E');
  assert.equal(formatDms(-33.859722, true), '33°51\'35.0"S');
});

test('parseCoordinateString: Google-Maps-DMS-Paar (Reihenfolge egal)', () => {
  const a = parseCoordinateString('48°59\'58.0"N 8°29\'17.4"E');
  approx(a.lat, 48.999444);
  approx(a.lng, 8.488167);

  // Reihenfolge vertauscht, Komma statt Leerzeichen
  const b = parseCoordinateString('8°29\'17.4"E, 48°59\'58.0"N');
  approx(b.lat, 48.999444);
  approx(b.lng, 8.488167);
});

test('parseCoordinateString: einfaches Dezimalpaar', () => {
  const a = parseCoordinateString('48.9994, 8.4881');
  approx(a.lat, 48.9994);
  approx(a.lng, 8.4881);

  const b = parseCoordinateString('48.9994 8.4881'); // nur Leerzeichen als Trenner
  approx(b.lat, 48.9994);
  approx(b.lng, 8.4881);
});

test('parseCoordinateString: unbrauchbarer Text -> null', () => {
  assert.equal(parseCoordinateString(''), null);
  assert.equal(parseCoordinateString('kein Ort hier'), null);
  assert.equal(parseCoordinateString('200, 300'), null); // außerhalb gültiger Bereiche
});

test('Roundtrip: dezimal -> DMS -> zurück auf wenige Meter genau', () => {
  const original = 48.137123;
  const { deg, min, sec } = decimalToDms(original);
  const back = dmsToDecimal(deg, min, sec, 'N');
  // Sekunden-Rundung auf 0.1" -> max. Abweichung 0.05" ≈ 1.4e-5° (~1.5 m)
  approx(back, original, 3e-5);
});
