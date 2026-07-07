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
npm test               # node --test (Unit + HTTP-Integration)
npm run lint           # ESLint
npm run seed:admin     # ersten Admin anlegen (ADMIN_USERNAME/ADMIN_PASSWORD aus .env)
```

Owner-Oberfläche unter `/` (`index.html`), Mitsucher-Suche unter `/search.html`.
Persistenz und Passwort-Hashing laufen über Node-Bordmittel (`node:sqlite`, `node:crypto`) —
keine nativen Abhängigkeiten.

**End-to-End-Browsertest** (optional, Playwright separat):

```bash
npm i -D playwright && npx playwright install chromium
npm run test:e2e
```

## Struktur

```
server.js                  Einstiegspunkt: DB öffnen, Repo + App verdrahten, lauschen
app.js                     Express-App-Factory (Static, Router, Session, Fehler-Umschlag)
routes/
  auth.js                  Register/Login/Logout/me, Admin-Reset          (Vertrag A.3)
  routes.js                Routen- & Wegpunkt-CRUD, Start/Reset, Code       (Vertrag A.4)
  progress.js              Beitritt, Zustand lesen (Polling), Fund/Skip      (Vertrag A.5)
middleware/
  auth.js                  requireOwner / requireRouteAccess (X-Route-Code)
  errorEnvelope.js         Einheitlicher Fehler-Umschlag                     (Vertrag A.2)
  rateLimit.js             In-Memory-Rate-Limiter (Login/Register)
lib/
  domain.js                Reine Status-Übergänge & Antwort-Shapes           (Vertrag A.5/A.6)
  routeCode.js             Routen-Code erzeugen/validieren                   (Vertrag A.4)
  password.js              scrypt-Hashing (node:crypto)                      (Vertrag A.3)
  ids.js / time.js         UUIDs / ISO-Zeit
db/
  schema.sql               Datenmodell
  index.js                 DB-Verbindung / Migration (node:sqlite)
  repository.js            SQL-Zugriff hinter injizierbarer Schnittstelle
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
  sensorFusion.test.js     Unit-Tests reine Fusion + deriveActiveWaypoint
  traceReplay.test.js      Trace-Replay-Regressionstests                     (Vertrag C.5)
  searchState.test.js      Reine State-Machine-Übergänge                     (Vertrag B)
  searchController.test.js Orchestrierung mit Fakes                          (Vertrag B/C.4)
  domain.test.js           Backend-Domäne, Passwort, Routen-Code
  backendApi.test.js       End-to-End-API gegen :memory:-SQLite über HTTP
  fixtures/                Trace-Format (README) + synthetische Traces
  helpers/                 Replay-Harness + Backend-Test-Harness
e2e/
  browser.mjs              End-to-End im echten Browser (Playwright)
```
