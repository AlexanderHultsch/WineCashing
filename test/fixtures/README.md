# Trace-Fixtures (Vertrag C.5)

Aufgezeichnete Sensor-Traces zum **Offline-Replay** der reinen Sensor-Fusion
(`public/js/sensorFusion.js`). Damit wird der Algorithmus ohne Telefon getestet und
`CONFIG` (Vertrag C.2) kalibriert — der Kreislauf *Feld → Log → Testfall → Feinjustierung*
(Vertrag C.6), ohne erneut ins Feld zu müssen.

## Dateiformat

```jsonc
{
  "meta":   { "name": "...", "recorded_at": "ISO-8601", "notes": "..." },
  "target": { "lat": 48.1371, "lng": 11.5754 },        // Ziel-Wegpunkt
  "samples": [                                          // chronologisch, timestamp in ms
    { "kind": "gps",         "lat": 48.1366, "lng": 11.5754, "accuracy": 8, "timestamp": 0 },
    { "kind": "orientation", "rawHeading": 3, "absolute": true, "source": "absolute", "timestamp": 500 }
  ],
  "expect": {                                           // NUR Test-Metadaten (kein Laufzeit-Feld)
    "outlier_timestamps": [6000],                       // Samples, die verworfen werden sollen
    "converges_monotonically": true                     // geglättete Distanz fällt beim Zugehen
  }
}
```

- **`kind`** diskriminiert die beiden Sample-Typen aus Vertrag C.1
  (`GpsSample` | `OrientationSample`). Der Replay-Harness (`test/helpers/replay.js`)
  erkennt den Typ zusätzlich strukturell, falls `kind` fehlt (z. B. bei roh kopierten Log-Zeilen aus Spec 6.11.1).
- **`samples`** enthält exakt die Felder der Datentypen aus C.1 — keine zusätzlichen Laufzeit-Felder.
- **`expect`** ist reine Test-Erwartung und wird von den Replay-Tests gelesen, nicht von der Pipeline.

Neue Feld-Traces einfach als weitere `*.json` hier ablegen und in `test/traceReplay.test.js` referenzieren.
