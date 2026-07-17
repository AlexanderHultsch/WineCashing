# Wine Caching

Geocaching-artige Web-App für den privaten Freundeskreis: Ein Ersteller versteckt Weinflaschen
und legt eine Route aus Wegpunkten (GPS + Hinweis) an; Mitsucher treten kontolos per Routen-Code
bei und werden im Such-Modus per Kompass und Distanz ("Flaschenlängen") geführt.

## Status

Vollständig implementiert und getestet (Backend-API, Such-Modus-State-Machine, Sensor-Fusion,
Owner- und Mitsucher-UI). Die verbindliche Schnittstellen-Definition steht in
[`docs/technischer-vertrag.md`](docs/technischer-vertrag.md).

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

## Deployment als Container (Pi-Server)

Die App ist als **dynamische App** für das
[PiMultiServiceServer-Konstrukt](https://github.com/AlexanderHultsch/PiMultiServiceServer)
paketiert: eigener Container hinter Caddy, erreichbar als `winecashing.<DOMAIN>`.

**Umgebungsvariablen (Vertrag):** `PORT` (Default 3000), `DB_PATH` (SQLite-Datei,
Default `./data/winecashing.db`, im Container `/data/winecashing.db`),
`SESSION_SECRET` (Pflicht in Produktion), `ADMIN_USERNAME`/`ADMIN_PASSWORD`
(einmaliger Seed). Vorlage: `.env.example` — echte `.env` niemals committen.

**Standalone bauen und starten:**

```bash
docker build -t winecashing .
docker run -d --name winecashing \
  -p 3000:3000 \
  -v "$PWD/data:/data" \
  --env-file .env \
  winecashing

# Einmalig den ersten Admin anlegen (liest ADMIN_USERNAME/ADMIN_PASSWORD):
docker exec -u node winecashing npm run seed:admin
```

Hinweis: Der Container startet kurz als root, übereignet das gemountete
`/data`-Verzeichnis dem `node`-Nutzer (sonst scheitert SQLite am root-eigenen
Bind-Mount) und wechselt dann per `su-exec` zu `node` — der App-Prozess läuft
unprivilegiert. Deshalb beim `exec` `-u node` verwenden, damit die DB-Dateien
`node` gehören bleiben.

Im Pi-Server-Konstrukt übernimmt `docker compose` Build/Start (Service
`winecashing`, Routing über Caddy); Updates dort per
`bash scripts/deploy-site.sh winecashing`.

## Struktur

```
server.js                  Einstiegspunkt: DB öffnen, Repo + App verdrahten, lauschen
app.js                     Express-App-Factory (Static, Router, Session, Fehler-Umschlag)
Dockerfile                 Container-Build (node:24-alpine, npm ci --omit=dev)
docker-entrypoint.sh       chown /data an node, dann Privilegien abgeben (su-exec)
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
