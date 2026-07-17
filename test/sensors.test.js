// Sensor-Adapter: reine Teile (toOrientationSample, hasUsableHeading) sowie das
// dual-listen-Verhalten von watchOrientation (Bug-Regression: "Kompass dreht sich nicht").
// Ausführen:  node --test test/sensors.test.js
//
// watchOrientation greift auf `window` zu; hier per globalem EventTarget simuliert
// (Node kennt EventTarget/Event eingebaut, kein Browser nötig).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toOrientationSample, hasUsableHeading, watchOrientation } from '../public/js/sensors.js';

function fakeEvent(type, props) {
  const ev = new Event(type);
  Object.assign(ev, props);
  return ev;
}

test('toOrientationSample: iOS erkannt über webkitCompassHeading', () => {
  const s = toOrientationSample({ webkitCompassHeading: 42 }, () => 't');
  assert.deepEqual(s, { rawHeading: 42, absolute: true, source: 'ios', timestamp: 't' });
});

test('toOrientationSample: Android absolute vs. relative', () => {
  assert.equal(toOrientationSample({ absolute: true, alpha: 90 }, () => 't').source, 'absolute');
  assert.equal(toOrientationSample({ absolute: false, alpha: 90 }, () => 't').source, 'relative');
});

test('hasUsableHeading: iOS-Heading oder numerisches alpha ist nutzbar, null/undefined nicht', () => {
  assert.equal(hasUsableHeading({ webkitCompassHeading: 0 }), true); // 0 ist ein gültiger Heading-Wert
  assert.equal(hasUsableHeading({ alpha: 90 }), true);
  assert.equal(hasUsableHeading({ alpha: null }), false);
  assert.equal(hasUsableHeading({ alpha: undefined }), false);
  assert.equal(hasUsableHeading({}), false);
});

test('watchOrientation: Stub-Event mit alpha=null wird ignoriert (Regression)', () => {
  globalThis.window = new EventTarget();
  try {
    const samples = [];
    const stop = watchOrientation((s) => samples.push(s));

    // Chromium/manche Android-Kombinationen feuern genau EIN degeneriertes
    // "deviceorientationabsolute"-Event mit alpha=null, um nur die API-Existenz zu
    // signalisieren — real liefert nie ein Sensor. Das darf die relative Quelle NICHT
    // dauerhaft sperren (das war der eigentliche Bug: Kompass friert für immer ein).
    window.dispatchEvent(fakeEvent('deviceorientationabsolute', { alpha: null, absolute: true }));
    assert.equal(samples.length, 0, 'Stub-Event erzeugt kein Sample');

    window.dispatchEvent(fakeEvent('deviceorientation', { alpha: 123, absolute: false }));
    assert.equal(samples.length, 1, 'echtes relatives Event kommt durch, obwohl absolute-Event zuerst kam');
    assert.equal(samples[0].source, 'relative');

    stop();
  } finally {
    delete globalThis.window;
  }
});

test('watchOrientation: sobald absolute ECHTE Daten liefert, hat es Vorrang vor relative', () => {
  globalThis.window = new EventTarget();
  try {
    const samples = [];
    const stop = watchOrientation((s) => samples.push(s));

    window.dispatchEvent(fakeEvent('deviceorientationabsolute', { alpha: 10, absolute: true }));
    window.dispatchEvent(fakeEvent('deviceorientation', { alpha: 999, absolute: false }));

    assert.equal(samples.length, 1, 'relative Quelle wird nach echtem absolute-Sample ignoriert');
    assert.equal(samples[0].source, 'absolute');
    assert.equal(samples[0].rawHeading, 10);

    stop();
  } finally {
    delete globalThis.window;
  }
});
