# Wine Caching

Geocaching-artige Web-App für den privaten Freundeskreis: Ein Ersteller versteckt Weinflaschen
und legt eine Route aus Wegpunkten (GPS + Hinweis) an; Mitsucher treten kontolos per Routen-Code
bei und werden im Such-Modus per Kompass und Distanz ("Flaschenlängen") geführt.

## Status

Vollständig implementiert und getestet (Backend-API, Such-Modus-State-Machine, Sensor-Fusion,
Owner-UI inkl. Admin-Panel, Mitsucher-UI, Info-/Datenschutzseite). Die verbindliche
Schnittstellen-Definition steht in [`docs/technischer-vertrag.md`](docs/technischer-vertrag.md).

Der Routen-Anzeigestatus (**Erstellung / Aktiv / Deaktiviert**) wird clientseitig aus
`status` + `route_code_active` abgeleitet (`public/js/routeStatus.js`), nie separat gespeichert —
ein einziger Umschalter in der Routen-Steuerung führt durch alle drei Zustände.

## Entwicklung

```bash
cp .env.example .env   # Werte anpassen
npm install
npm run dev            # Server mit Auto-Reload
npm test               # node --test (Unit + HTTP-Integration)
npm run lint           # ESLint
npm run seed:admin     # ersten Admin anlegen (ADMIN_USERNAME/ADMIN_PASSWORD aus .env)
```

Owner-Oberfläche unter `/` (`index.html`, inkl. Admin-Panel für `is_admin`-Nutzer),
Mitsucher-Suche unter `/search.html`, Info & Datenschutz unter `/datenschutz.html`.
Persistenz und Passwort-Hashing laufen über Node-Bordmittel (`node:sqlite`, `node:crypto`) —
keine nativen Abhängigkeiten.

**Admin-Panel:** Nutzer mit `is_admin = 1` sehen im Burger-Menü einen zusätzlichen
„⚙️ Admin"-Eintrag (`routes/admin.js`, `/api/admin/*`) — Übersicht über *alle* Routen
(Ersteller, Status, Code) und *alle* Nutzer (Routen-Anzahl), inkl. Löschen, fremder
Code-Verwaltung (aktivieren/deaktivieren/neu erzeugen). Den ersten Admin legt
`npm run seed:admin` an; weitere Admin-Rechte aktuell nur direkt in der DB
(`UPDATE users SET is_admin = 1 WHERE username = '...'`) oder per `repo.setUserAdmin(...)`.

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
  auth.js                  Register/Login/Logout/me, Admin-Passwort-Reset     (Vertrag A.3)
  routes.js                Routen- & Wegpunkt-CRUD, Start/Reset, Code         (Vertrag A.4)
  progress.js              Beitritt, Zustand lesen (Polling), Fund/Skip       (Vertrag A.5)
  admin.js                 Admin-Verwaltung: alle Routen/Nutzer, fremde Codes (Vertrag A.4, /api/admin/*)
middleware/
  auth.js                  requireOwner / requireRouteAccess (X-Route-Code) / requireAdmin
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
  index.html               Owner-Oberfläche (Routen/Wegpunkte verwalten, Admin-Panel)
  search.html              Such-Modus (Mitsucher)
  datenschutz.html         Info & Datenschutz (Cookies, Standort, Admin-Rechte)
  css/styles.css
  js/
    config.js              Sichtbare Texte/Symbole & Karten-Defaults (zentral anpassbar)
    api.js                 Client-API-Wrapper (Cookie + X-Route-Code + Admin-Endpunkte)
    nav.js                 Gemeinsames Hamburger-Menü (index/search/datenschutz)
    routeStatus.js         Abgeleiteter Tri-State Erstellung/Aktiv/Deaktiviert
    coordinates.js         DMS ⇄ Dezimalgrad (Owner-UI Koordinaten-Eingabe)
    mapPicker.js           Leaflet-Kartenauswahl inkl. "Mich lokalisieren"
    clipboard.js           Code-in-Zwischenablage-kopieren mit Fallback
    searchMode.js          State-Machine + Pipeline-Orchestrierung           (Vertrag B, C.4)
    sensorFusion.js        Reine Funktionen: Distanz/Bearing/Glättung/Fusion (Vertrag C.3)
    geolocation.js         GPS-Auslesen & Berechtigungen
    sensors.js             Orientierung/Kompass & Wake-Lock
  vendor/leaflet/          Selbst gehostetes Leaflet (kein CDN)
scripts/
  seedAdmin.js             Admin-Bootstrap (npm run seed:admin)              (Vertrag A.3)
test/
  sensorFusion.test.js     Unit-Tests reine Fusion + deriveActiveWaypoint
  traceReplay.test.js      Trace-Replay-Regressionstests                     (Vertrag C.5)
  searchState.test.js      Reine State-Machine-Übergänge                     (Vertrag B)
  searchController.test.js Orchestrierung mit Fakes                          (Vertrag B/C.4)
  sensors.test.js          Sensor-Adapter (Kompass-Dual-Listen, Wake-Lock)
  coordinates.test.js      DMS ⇄ Dezimalgrad-Konvertierung
  routeStatus.test.js      Abgeleiteter Tri-State (Erstellung/Aktiv/Deaktiviert)
  nav.test.js              Nav-Rendering: Escaping, Admin-Sichtbarkeit, aktive Seite
  domain.test.js           Backend-Domäne, Passwort, Routen-Code
  backendApi.test.js       End-to-End-API gegen :memory:-SQLite über HTTP
  adminApi.test.js         Admin-Endpunkte: Permission-Gating, Kaskaden-Löschung
  fixtures/                Trace-Format (README) + synthetische Traces
  helpers/                 Replay-Harness + Backend-Test-Harness
e2e/
  browser.mjs              End-to-End im echten Browser (Playwright): Owner, Mitsucher, Admin
```
