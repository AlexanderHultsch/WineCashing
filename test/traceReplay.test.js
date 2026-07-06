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

test('replay: geglättete Distanz konvergiert monoton beim Zugehen', () => {
  const rows = replayTrace(trace).filter((r) => !r.drift);
  assert.ok(rows.length >= 3, 'genug nicht-drift-Zeilen für Konvergenzprüfung');
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].dist <= rows[i - 1].dist + 1e-6, `Distanz steigt bei t=${rows[i].timestamp}`);
  }
});

test('replay: bekannte Ausreißer werden als drift markiert/verworfen', () => {
  const rows = replayTrace(trace);
  for (const ts of trace.expect.outlier_timestamps) {
    const row = rows.find((r) => r.timestamp === ts);
    assert.ok(row && row.drift === true, `Ausreißer bei t=${ts} nicht als drift erkannt`);
  }
});

test('replay: gute Samples werden NICHT als drift verworfen', () => {
  const rows = replayTrace(trace);
  const outlierSet = new Set(trace.expect.outlier_timestamps);
  for (const row of rows) {
    if (!outlierSet.has(row.timestamp)) {
      assert.equal(row.drift, false, `gutes Sample bei t=${row.timestamp} fälschlich als drift`);
    }
  }
});

test('replay: Hinweis wird nahe am Ziel freigeschaltet', () => {
  const rows = replayTrace(trace);
  const last = rows[rows.length - 1];
  assert.ok(last.dist < 15, 'letztes Sample sollte innerhalb der Hinweisschwelle liegen');
  assert.equal(last.reveal, true);
});
