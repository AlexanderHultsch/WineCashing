# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projekt

**Wine Caching** — eine Geocaching-artige Web-App für den privaten Freundeskreis. Ein *Ersteller (Owner)* legt eine **Route** aus **Wegpunkten** (versteckte Weinflaschen) mit GPS-Koordinaten und Hinweistext an. *Mitsucher* treten **kontolos** über einen **Routen-Code** bei und werden im **Such-Modus** per Kompass + Distanz (gemessen in „Flaschenlängen") zum jeweils aktiven Wegpunkt geführt.

Die verbindliche Schnittstellen-Definition steht in **`docs/technischer-vertrag.md`** — API-Vertrag (Teil A), Client-State-Machine (Teil B), Sensor-Fusion-Algorithmen (Teil C). Dieses Dokument friert die Schnittstellen **vor** dem Feature-Code ein; die dort festgelegten Signaturen, Endpunkte und Verträge sind maßgeblich. Alle drei Schichten (Backend-API, Client-Such-Modus, Sensor-Fusion) **und** die Web-UI (`public/index.html` Owner + Admin-Panel, `public/search.html` Mitsucher, `public/datenschutz.html` Info/Datenschutz) sind implementiert und getestet; ein End-to-End-Browsertest (`e2e/browser.mjs`, benötigt separat installiertes Playwright) fährt den kompletten Flow durch (Owner + Mitsucher + Admin).

## Befehle

- `npm install` — Abhängigkeiten installieren
- `npm start` — Server starten (`server.js`)
- `npm run dev` — Server mit Auto-Reload (`node --watch server.js`)
- `npm test` — alle Tests (`node --test`, Node-eingebaut)
- Einzelner Test: `node --test test/sensorFusion.test.js`
- `npm run lint` / `npm run format` — ESLint (flat config) / Prettier
- `npm run seed:admin` — ersten `is_admin`-Nutzer aus `ADMIN_USERNAME`/`ADMIN_PASSWORD` anlegen (`.env`)

Konfiguration über `.env` (Vorlage: `.env.example`). IDs im Datenmodell sind UUIDs (`TEXT`).

## Architektur

Drei Schichten entlang des technischen Vertrags:

### 1. Backend-API (`app.js`, `server.js`, `routes/`, `middleware/`, `lib/`, `db/`)
Node + Express, JSON unter Basis-Pfad `/api`. `app.js` ist eine **Factory** (`createApp({ repo, ... })`) mit injizierten Abhängigkeiten — dadurch gegen eine `:memory:`-DB testbar; `server.js` verdrahtet nur die echte DB und lauscht. Router sind ebenfalls Factories (`createXRouter({ repo, auth, ... })`):
- `routes/auth.js` — Registrierung/Login/Logout/`me`, Admin-Passwort-Reset (Vertrag A.3)
- `routes/routes.js` — Routen- & Wegpunkt-CRUD, Start, Reset, Routen-Code inkl. `code/activate` (A.4)
- `routes/progress.js` — Beitritt (`/api/join`), Zustand lesen (`/state`, Polling-Quelle), Fund/Skip melden (A.5)
- `routes/admin.js` — Admin-Verwaltung (`/api/admin/*`, nur `is_admin`): alle Routen/Nutzer listen & löschen, fremde Codes (re)aktivieren/neu erzeugen (A.4)

Aller SQL-Zugriff liegt hinter dem **Repository** (`db/repository.js`, Schnittstelle injiziert). Reine Bausteine in `lib/`: `domain.js` (Status-Übergänge, Shaping A.6), `routeCode.js` (Format/Erzeugen **und** die Code-Vergabe-Logik `generateUniqueRouteCode`/`renewRouteCode`/`activateRouteCode`, geteilt zwischen `routes/routes.js` und `routes/admin.js` — Review-Fix gegen Duplikat-Drift), `password.js`, `ids.js`, `time.js`.

**Keine nativen Abhängigkeiten:** Persistenz über Node-eingebautes **`node:sqlite`** (`db/index.js`, Schema `db/schema.sql`), Passwort-Hashing über **`node:crypto` scrypt** (`lib/password.js`) statt bcrypt/argon2 — beides erfüllt den Vertrag und läuft ohne `npm`-Build offline.

### 2. Client-Such-Modus (`public/search.html`, `public/js/searchMode.js`)
Explizite **State-Machine** (Vertrag Teil B): `PERMISSION_REQUIRED → LOADING → SEARCHING → COMPLETED`, plus `ROUTE_UNAVAILABLE`. `searchMode.js` orchestriert Polling (~7 s), Sensor-Pipeline und Zustandsübergänge — es ist **nicht** rein und hält den Verlaufspuffer.

### 3. Sensor-Fusion (`public/js/sensorFusion.js` + Sensor-Adapter)
`sensorFusion.js` ist eine **Sammlung reiner Funktionen** (keine Seiteneffekte, kein DOM-/Sensor-Zugriff) für Distanz, Bearing, Heading-Normalisierung, Ausreißer-Glättung und Plausibilitätsprüfung (Vertrag Teil C). Sensor-Auslesen/Berechtigungen/Wake-Lock liegen getrennt in `public/js/geolocation.js` und `public/js/sensors.js`. Weil die Kernfunktionen rein sind, wird der Algorithmus offline gegen aufgezeichnete Traces getestet: Fixtures in `test/fixtures/` (Format dort im README), Replay-Harness in `test/helpers/replay.js`, Tests in `test/traceReplay.test.js` und `test/sensorFusion.test.js`. Die Algorithmus-Tests sind `skip`, bis `sensorFusion.js` implementiert ist.

## Zwingende Invarianten (nicht verletzen)

- **Aktiver Wegpunkt wird abgeleitet, nie gespeichert.** `deriveActiveWaypoint(...)` liefert den ersten Wegpunkt mit Status `offen` nach `order_index`; ist keiner offen → `COMPLETED`. Nach *jedem* State-Update / Poll neu aufrufen. Dadurch zeigt der Client nie auf einen gelöschten/verschobenen Wegpunkt (Vertrag B.4).
- **Routen-Anzeigestatus wird abgeleitet, nie gespeichert.** `deriveRouteDisplayStatus(route)` (`public/js/routeStatus.js`) faltet die zwei orthogonalen DB-Felder `status` + `route_code_active` in einen Tri-State **Erstellung / Aktiv / Deaktiviert**. Die Owner-UI zeigt/steuert Aktivierung darüber (ein Umschalter in der Routen-Steuerung), damit „Route aktiv" nie im Widerspruch zu einem deaktivierten Code steht. **Ausnahme (Review-Fix):** Während `status === 'erstellung'` bleibt `route_code_active` weiterhin unabhängig sperr-/entsperrbar (eigener Toggle neben dem Tri-State-Badge) — sonst hätte der Owner keine Möglichkeit, den ab Anlage automatisch aktiven Code schon vor dem Start zu sperren.
- **Statuswechsel sind idempotent & monoton.** Erlaubt: `offen → gefunden`, `offen → übersprungen`. Beide Zielzustände sind **terminal** — erneutes `found`/`skip` ist ein No-Op mit `200`. `POST /reset` setzt `terminal → offen` zurück (Owner **oder** gültiger Routen-Code — Amendment: kontolose Mitsucher können so ein versehentliches "alles übersprungen" selbst beheben; wirkt global für die ganze Route, kein Konzept von individuellem Fortschritt). Nach jedem Wechsel prüfen: alle terminal → `completed_at` setzen (Vertrag A.5).
- **Einheitlicher Fehler-Umschlag:** `{ "error": { "code": "...", "message": "..." } }` (Vertrag A.2).
- **Server verlässt sich nie auf Client-Zeit** für Zustandslogik (`client_ts` nur fürs Logging).
- **Hint-Freischaltung** vergleicht die **geglättete**, nicht die rohe Distanz (Vertrag B.3, C.3).

## Auth-Modell (zwei getrennte Mechanismen)

- **Owner:** serverseitige Session über **httpOnly-Cookie**. Nur eigene Routen.
- **Mitsucher (kontolos):** Header `X-Route-Code: <code>`; bei *jedem* Zugriff prüfen: Code existiert, gehört zur Route, `route_code_active = true` — sonst `403 ROUTE_ACCESS_REVOKED`. Kein serverseitiger Teilnehmer-Datensatz.

Lese-Zustand (`/state`) und Fund/Skip akzeptieren **beide** Mechanismen; alle Verwaltungs-Endpunkte nur Owner. Zugriffsmatrix: Vertrag A.1.

## Domänen-Vokabular (Datenvertrag — exakte Werte)

- Routen-`status`: `"erstellung"` | `"such_modus"`
- Wegpunkt-`status`: `"offen"` | `"gefunden"` | `"übersprungen"` (mit Umlaut — UTF-8)
- Routen-Code-Format: 8 GROSSBUCHSTABEN/Ziffern aus `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (ohne `0 1 I L O`), Bindestrich nach Position 4 (z. B. `WC7F-K2PQ`). Wird bei Anlage der Route automatisch erzeugt und aktiviert. Eingabe (Header, `/join`-Body) ist case-insensitiv — `lib/routeCode.js#formatRouteCode` normalisiert immer vor dem Vergleich.

## Antwort-Shapes (Vertrag A.6)

```
RouteSummary  = { id, name, status, route_code?, route_code_active, created_at }
Route         = RouteSummary & { owner_user_id, waypoints: Waypoint[] }
Waypoint      = { id, route_id, order_index, lat, lng, hint_text, name? }
RouteProgress = { route_id, started_at, completed_at|null }
WaypointStatus= { waypoint_id, status, updated_at }
RouteState    = { route, waypoints, progress, waypoint_status, server_time }
```

## Koordinaten-Eingabe (Owner-UI)

`lat`/`lng` sind auf dem Wire immer Dezimalgrad (Waypoint-Shape, s. o.) — DMS (Grad/Minuten/Sekunden) ist reine Client-Anzeige-/Eingabehilfe in `public/index.html`, weil Google Maps Koordinaten so anzeigt (`48°59'58.0"N 8°29'17.4"E`). Reine Konvertier-/Parse-Funktionen in `public/js/coordinates.js` (`dmsToDecimal`, `decimalToDms`, `formatDms`, `parseCoordinateString`), getestet in `test/coordinates.test.js`. `parseCoordinateString` erkennt sowohl eingefügte Google-Maps-DMS-Paare als auch einfache Dezimalpaare.

## Feinjustierung

Filtergewichte, Deklinations-Näherung und Plausibilitäts-Schwellen (`CONFIG` in `sensorFusion.js`) werden im Feldtest kalibriert, **ohne** die Funktions-Signaturen/Verträge zu ändern (Vertrag C.6). Kalibrierung läuft über den Trace-Replay-Test, nicht über erneute Feldtests.
