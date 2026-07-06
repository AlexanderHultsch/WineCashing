// Trace-Replay-Regressionstests (Vertrag C.5).
// Ausführen:  node --test test/traceReplay.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isGps, isOrientation, replayTrace } from './helpers/replay.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const trace = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'synthetic-approach.json'), 'utf8'),
);

// Läuft bereits (unabhängig von sensorFusion): Fixture-Format & Sample-Diskriminierung.
test('fixture-plumbing: trace lädt und diskriminiert sample-typen sauber', () => {
  assert.ok(trace.target && typeof trace.target.lat === 'number');
  assert.ok(trace.samples.length > 0);
  const gps = trace.samples.filter(isGps);
  const ori = trace.samples.filter(isOrientation);
  assert.equal(gps.length + ori.length, trace.samples.length, 'jedes Sample ist genau ein Typ');
  assert.ok(gps.length >= 2, 'mindestens zwei GPS-Samples für Konvergenz');
});

// Geskippt bis sensorFusion.js implementiert ist — dann `skip` entfernen (Vertrag C.5/C.6).
const SF_TODO = 'sensorFusion.js noch nicht implementiert';

test('replay: geglättete Distanz konvergiert monoton beim Zugehen', { skip: SF_TODO }, () => {
  const rows = replayTrace(trace).filter((r) => !r.drift);
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].dist <= rows[i - 1].dist + 1e-6, `Distanz steigt bei t=${rows[i].timestamp}`);
  }
});

test('replay: bekannte Ausreißer werden als drift markiert/verworfen', { skip: SF_TODO }, () => {
  const rows = replayTrace(trace);
  for (const ts of trace.expect.outlier_timestamps) {
    const row = rows.find((r) => r.timestamp === ts);
    assert.ok(row && row.drift === true, `Ausreißer bei t=${ts} nicht als drift erkannt`);
  }
});
