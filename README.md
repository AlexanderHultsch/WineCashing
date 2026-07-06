# Wine Caching

Geocaching-artige Web-App für den privaten Freundeskreis: Ein Ersteller versteckt Weinflaschen
und legt eine Route aus Wegpunkten (GPS + Hinweis) an; Mitsucher treten kontolos per Routen-Code
bei und werden im Such-Modus per Kompass und Distanz ("Flaschenlängen") geführt.

## Status

Gerüst. Datei- und Schnittstellenstruktur stehen (siehe unten); Implementierungen sind `TODO`.
Die verbindliche Schnittstellen-Definition steht in [`docs/technischer-vertrag.md`](docs/technischer-vertrag.md).

## Entwicklung

```bash
cp .env.example .env   # Werte anpassen
npm install
npm run dev            # Server mit Auto-Reload
npm test               # node --test
npm run lint           # ESLint
npm run seed:admin     # ersten Admin anlegen (ADMIN_USERNAME/ADMIN_PASSWORD aus .env)
```

## Struktur

```
server.js                  Express-App (Wiring: Static, Router, Session, Fehler-Umschlag)
routes/
  auth.js                  Register/Login/Logout/me, Admin-Reset          (Vertrag A.3)
  routes.js                Routen- & Wegpunkt-CRUD, Start/Reset, Code       (Vertrag A.4)
  progress.js              Beitritt, Zustand lesen (Polling), Fund/Skip      (Vertrag A.5)
middleware/
  auth.js                  requireOwner / requireRouteAccess (X-Route-Code)
  errorEnvelope.js         Einheitlicher Fehler-Umschlag                     (Vertrag A.2)
lib/
  routeCode.js             Routen-Code erzeugen/validieren                   (Vertrag A.4)
db/
  schema.sql               Datenmodell
  index.js                 DB-Verbindung / Migration
public/
  index.html               Owner-Oberfläche (Routen/Wegpunkte verwalten)
  search.html              Such-Modus (Mitsucher)
  css/styles.css
  js/
    api.js                 Client-API-Wrapper (Cookie + X-Route-Code)
    searchMode.js          State-Machine + Pipeline-Orchestrierung           (Vertrag B, C.4)
    sensorFusion.js        Reine Funktionen: Distanz/Bearing/Glättung/Fusion (Vertrag C.3)
    geolocation.js         GPS-Auslesen & Berechtigungen
    sensors.js             Orientierung/Kompass & Wake-Lock
scripts/
  seedAdmin.js             Admin-Bootstrap (npm run seed:admin)              (Vertrag A.3)
test/
  sensorFusion.test.js     Unit-Tests (deriveActiveWaypoint u. a.)
  traceReplay.test.js      Trace-Replay-Regressionstests                     (Vertrag C.5)
  fixtures/                Trace-Format (README) + synthetische Traces
  helpers/replay.js        Replay-Harness (fährt die C.4-Pipeline offline)
```
