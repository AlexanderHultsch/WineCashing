# Wine Caching — Technischer Vertrag

Begleitdokument zur Spezifikation (`spezifikation-wine-caching.md`). Es friert die **Schnittstellen** ein, bevor Feature-Code entsteht: API-Vertrag (Teil A), State-Machine des Such-Modus (Teil B), Algorithmus-Design (Teil C). Abschnittsnummern verweisen auf die Spezifikation.

Grundsätze:
- **Datenmodell** ist maßgeblich in Spezifikation Abschnitt 9.
- **Aktiver Wegpunkt wird abgeleitet**, nie gespeichert (Spec 6.5).
- **Statuswechsel sind idempotent & monoton** (Spec 6.5, 10).
- Alle Fehlerantworten nutzen einen einheitlichen Umschlag (A.2).

---

# Teil A — API-Vertrag

## A.1 Authentifizierung & Zugriffsmodell

Zwei getrennte Mechanismen:

- **Ersteller (Owner):** serverseitige Session über **httpOnly-Cookie**, gesetzt bei Login/Registrierung. (Alternative: Bearer-JWT im `Authorization`-Header — nicht empfohlen, da Token-Ablage in JS unnötig ist.)
- **Mitsucher (kontolos):** Zugriff über den **Routen-Code**, mitgeschickt als Header `X-Route-Code: <code>`. Kein serverseitiger Teilnehmer-Datensatz (Spec 9). Der Server validiert bei **jedem** Zugriff: Code existiert, gehört zur Route, `route_code_active = true`. Schlägt das fehl → `403 ROUTE_ACCESS_REVOKED` (Client zeigt „Zugang abgelaufen", Spec 5).

**Zugriffsmatrix**

| Endpoint-Gruppe | Owner-Session | Gültiger `X-Route-Code` | Anonym |
|---|---|---|---|
| Auth (Register/Login) | — | — | ✅ |
| Route-Verwaltung, Wegpunkt-CRUD, Start, Code-Verwaltung | ✅ (nur eigene Route) | ❌ | ❌ |
| Beitritt (`/join`) | — | — | ✅ (mit Code im Body) |
| Routen-/Fortschritts-Zustand lesen (Polling) | ✅ (eigene Route) | ✅ | ❌ |
| Fund/Skip melden | ✅ (eigene Route) | ✅ | ❌ |
| Reset (Wegpunkte → `offen`) | ✅ (eigene Route) | ✅ | ❌ |
| Admin-Passwort-Reset, Admin-Verwaltung (`/api/admin/*`) | ✅ (nur `is_admin`, **alle** Routen/Nutzer) | ❌ | ❌ |

**Wichtige Design-Entscheidung — Hinweistexte:** `hint_text` wird im Routen-Payload **an den Client ausgeliefert** (nötig für die Offline-Hinweis-Freischaltung, Spec 10). Das „verborgen bis Annäherung" (Spec 6.4) ist eine **UI-Regel auf dem Client**, keine Server-Geheimhaltung. Für den privaten Freundeskreis ist das akzeptabel und ausdrücklich so gewollt.

## A.2 Konventionen

- Basis-Pfad: `/api`. Datenformat: JSON. Zeiten: ISO 8601 UTC.
- **Erfolg:** passender 2xx-Status + Ressourcen-JSON.
- **Fehler-Umschlag** (einheitlich):
  ```json
  { "error": { "code": "ROUTE_ACCESS_REVOKED", "message": "Der Routen-Code ist nicht mehr gültig." } }
  ```
- Standard-Statuscodes: `400` Validierung, `401` nicht eingeloggt, `403` keine Berechtigung / Code ungültig, `404` nicht gefunden, `409` Konflikt (z. B. Start ohne Wegpunkte, Username vergeben), `204` kein Inhalt.

## A.3 Auth-Endpoints (`routes/auth.js`, Spec 3)

| Methode | Pfad | Body | Erfolg | Fehler |
|---|---|---|---|---|
| POST | `/api/auth/register` | `{username, password}` | `201 {user:{id,username}}` + Session-Cookie | `409 USERNAME_TAKEN`, `400` |
| POST | `/api/auth/login` | `{username, password}` | `200 {user}` + Session-Cookie | `401 INVALID_CREDENTIALS` |
| POST | `/api/auth/logout` | — | `204` | — |
| GET | `/api/auth/me` | — | `200 {user}` | `401` |
| POST | `/api/auth/admin/reset-password` | `{username, new_password}` | `200` | `403 NOT_ADMIN`, `404 USER_NOT_FOUND` |

Passwörter serverseitig mit bcrypt/argon2 hashen. Login/Register rate-limitiert (Spec 3).

## A.4 Routen & Wegpunkte (`routes/routes.js`, Spec 4, 5)

### Routen
| Methode | Pfad | Body | Erfolg | Anmerkung |
|---|---|---|---|---|
| GET | `/api/routes` | — | `200 [RouteSummary]` | nur eigene |
| POST | `/api/routes` | `{name}` | `201 {Route}` | `status = "erstellung"` |
| GET | `/api/routes/:routeId` | — | `200 {Route + waypoints + progress}` | Owner-Vollansicht |
| PATCH | `/api/routes/:routeId` | `{name?}` | `200 {Route}` | |
| DELETE | `/api/routes/:routeId` | — | `204` | |
| POST | `/api/routes/:routeId/start` | — | `200 {Route, RouteProgress}` | Guard: ≥ 1 Wegpunkt, sonst `409 NO_WAYPOINTS`. Setzt `status="such_modus"`, `started_at` (Spec 4.3) |
| POST | `/api/routes/:routeId/reset` | Owner **oder** `X-Route-Code` | `200 {RouteProgress}` | Alle Wegpunkt-Status → `offen`, neues `started_at`, `completed_at=null` (Spec 4.5) |

### Wegpunkte
| Methode | Pfad | Body | Erfolg |
|---|---|---|---|
| POST | `/api/routes/:routeId/waypoints` | `{lat, lng, hint_text, name?, order_index?}` | `201 {Waypoint}` |
| PATCH | `/api/routes/:routeId/waypoints/:wpId` | teilweise Felder | `200 {Waypoint}` |
| DELETE | `/api/routes/:routeId/waypoints/:wpId` | — | `204` |
| PUT | `/api/routes/:routeId/waypoints/order` | `{ordered_ids:[...]}` | `200 [Waypoint]` |

`PUT .../order` setzt die Reihenfolge in einem Rutsch neu (robuster als einzelne `order_index`, deckt Spec 4.4 „Neu-Sortieren" sauber ab). Alle Wegpunkt-Änderungen sind auch **während laufender Suche** erlaubt (Spec 4.4); der aktive Wegpunkt ergibt sich danach automatisch neu (Ableitung, B.4).

**Amendment (Review-Fix):** `GET /:routeId` liefert `progress` jetzt direkt mit (statt dass die Owner-UI dafür zusätzlich `GET .../state` aufrufen musste). Zwei getrennte, unsynchronisierte Requests für dieselbe Ansicht konnten sich bei überlappenden Aufrufen (schnelles Doppel-Öffnen zweier Routen) zeitlich verschränken und Route-Daten der einen mit Progress-Daten der anderen Route mischen.

### Routen-Code (Spec 5)
| Methode | Pfad | Erfolg | Wirkung |
|---|---|---|---|
| POST | `/api/routes/:routeId/code` | `200 {route_code, active}` | Erzeugt Code, falls keiner existiert (Legacy-Routen); sonst gibt aktuellen Zustand zurück (verändert `route_code_active` **nicht**) |
| POST | `/api/routes/:routeId/code/renew` | `200 {route_code, active:true}` | Neuer Code; **alter wird ungültig → alle Mitsucher ausgesperrt** |
| POST | `/api/routes/:routeId/code/activate` | `200 {route_code, active:true}` | `route_code_active=true` (reaktiviert bestehenden Code; erzeugt einen, falls die Alt-Route keinen hat) |
| POST | `/api/routes/:routeId/code/deactivate` | `200 {active:false}` | `route_code_active=false`; **alle Mitsucher ausgesperrt** |

**Amendment (Nutzer-Feedback):** `POST /api/routes` erzeugt den Code jetzt **direkt bei Anlage** (aktiv) — der manuelle Zusatzklick brachte keinen Sicherheitsgewinn, da Teilen ohnehin ein bewusster Owner-Schritt bleibt. Wer noch nicht teilen will, nutzt `code/deactivate`. `POST .../code` bleibt als idempotenter Endpunkt für Alt-Routen ohne Code erhalten.

**Amendment (Nutzer-Feedback, Bugs 1/3/5):** Reaktivieren geht über den neuen `code/activate` — der alte `POST .../code` gab bei bestehendem Code nur den Zustand zurück, ohne `route_code_active` zu setzen (der „Reaktivieren"-Button blieb wirkungslos). Die Owner-UI führt Aktivierung/Deaktivierung jetzt **gebündelt** über *einen* Umschalter in der Routen-Steuerung (Start = `code/activate`/`start`, Deaktivieren = `code/deactivate`), abgeleitet aus einem Tri-State **Erstellung / Aktiv / Deaktiviert** = f(`status`, `route_code_active`); siehe `public/js/routeStatus.js`.

### Admin-Verwaltung (`routes/admin.js`, Frage 6 — nur `is_admin`)

Alle Endpunkte unter `/api/admin/*`, gegated durch `requireAdmin`. Sicht/Zugriff auf **alle** Routen und Nutzer (nicht nur eigene). Bewusst als eigene, gespiegelte Endpunkte statt Aufweichung der Owner-Isolation.

| Methode | Pfad | Erfolg | Wirkung |
|---|---|---|---|
| GET | `/api/admin/routes` | `200 [RouteSummary & {owner_username}]` | Alle Routen inkl. Ersteller-Name |
| GET | `/api/admin/users` | `200 [{id, username, is_admin, created_at, route_count}]` | Alle Nutzer inkl. Routen-Anzahl |
| DELETE | `/api/admin/routes/:routeId` | `204` | Route löschen (CASCADE) |
| DELETE | `/api/admin/users/:userId` | `204` | Nutzer + all seine Routen löschen. Eigener Account → `400 SELF_DELETE_FORBIDDEN`; unbekannt → `404` |
| POST | `/api/admin/routes/:routeId/code/renew` | `200 {route_code, active:true}` | Neuer Code für fremde Route |
| POST | `/api/admin/routes/:routeId/code/activate` | `200 {route_code, active:true}` | Fremden Code (re)aktivieren |
| POST | `/api/admin/routes/:routeId/code/deactivate` | `200 {active:false}` | Fremden Code deaktivieren |

Code-Format: 8 Zeichen aus dem GROSSBUCHSTABEN-Alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (ohne verwechselbare Zeichen `0 1 I L O`), Bindestrich nach Position 4 (z. B. `WC7F-K2PQ`). Anzeige immer in Großschreibung; die Eingabe (`X-Route-Code`, `/join`-Body) ist **case-insensitiv** — der Server normalisiert vor jedem Vergleich.

## A.5 Beitritt & Zustand (`routes/progress.js`, Spec 6.5, 6.9)

### Beitritt (Mitsucher)
| Methode | Pfad | Body | Erfolg | Fehler |
|---|---|---|---|---|
| POST | `/api/join` | `{route_code}` | `200 {RouteState}` | `404 CODE_NOT_FOUND`, `403 ROUTE_ACCESS_REVOKED` |

Der Client speichert den Code lokal (Spec 5) und schickt ihn danach als `X-Route-Code` mit.

### Zustand lesen — der Polling-Endpoint
| Methode | Pfad | Auth | Erfolg |
|---|---|---|---|
| GET | `/api/routes/:routeId/state` | Owner-Session **oder** `X-Route-Code` | `200 {RouteState}` |

Dies ist die **einzige** Quelle für den Such-Modus und das ~7-Sekunden-Polling (Spec 6.9). Antwort enthält alles, was der Client braucht:
```json
{
  "route":   { "id": "...", "name": "...", "status": "such_modus" },
  "waypoints": [
    { "id": "...", "order_index": 0, "lat": 48.1, "lng": 11.5, "hint_text": "...", "name": "..." }
  ],
  "progress": { "started_at": "...", "completed_at": null },
  "waypoint_status": [
    { "waypoint_id": "...", "status": "offen", "updated_at": "..." }
  ],
  "server_time": "2026-01-01T12:00:00Z"
}
```
Ist der Code ungültig/deaktiviert → `403 ROUTE_ACCESS_REVOKED`. Ist die Route gelöscht → `404`. Der Client leitet daraus die Zustände `ROUTE_UNAVAILABLE` bzw. Zugang-abgelaufen ab (Teil B).

### Fund / Skip melden (Spec 4.2, 6.5)
| Methode | Pfad | Auth | Erfolg |
|---|---|---|---|
| POST | `/api/routes/:routeId/waypoints/:wpId/found` | Owner **oder** `X-Route-Code` | `200 {waypoint_status, progress}` |
| POST | `/api/routes/:routeId/waypoints/:wpId/skip` | Owner **oder** `X-Route-Code` | `200 {waypoint_status, progress}` |

**Server-Regel (verbindlich, idempotent & monoton):**
- Erlaubte Übergänge: `offen → gefunden`, `offen → übersprungen`.
- `gefunden` und `übersprungen` sind **terminal**: ein erneutes `found`/`skip` auf einen bereits terminalen Wegpunkt ist ein **No-Op** und liefert `200` mit dem aktuellen Status zurück (kein Fehler). Damit sind verspätete Offline-Aktionen unschädlich (Spec 10).
- `POST /reset` darf `terminal → offen` zurücksetzen — Owner **oder** gültiger `X-Route-Code` (Amendment, Nutzer-Feedback: kontolose Mitsucher brauchen einen Weg, ein versehentliches „alles übersprungen" selbst zu beheben). Wirkt **global für die ganze Route**, nicht pro Nutzer — es gibt kein Konzept von individuellem Fortschritt. Der Client zeigt vor dem Aufruf eine Warnung.
- Nach jedem erfolgreichen Statuswechsel prüft der Server: Sind **alle** Wegpunkte terminal → `completed_at` setzen (falls noch null). Reset leert es wieder.

Optionaler Body `{client_ts}` nur fürs Logging; der Server verlässt sich nie auf Client-Zeit für die Zustandslogik.

## A.6 Datentypen (Antwort-Shapes)

```
RouteSummary  = { id, name, status, route_code?, route_code_active, created_at }
Route         = RouteSummary & { owner_user_id, waypoints: Waypoint[], progress: RouteProgress }
Waypoint      = { id, route_id, order_index, lat, lng, hint_text, name? }
RouteProgress = { route_id, started_at, completed_at|null }
WaypointStatus= { waypoint_id, status: "offen"|"gefunden"|"übersprungen", updated_at }
RouteState    = { route, waypoints, progress, waypoint_status, server_time }
```

---

# Teil B — State-Machine des Such-Modus

Client-seitige Zustandsmaschine für `search.html` / `js/searchMode.js`. Ziel (Spec 4.4): **nie** ein undefinierter Zustand — jeder Pfad fällt auf einen gültigen offenen Wegpunkt oder in den Abschluss/Neutral-Zustand zurück.

## B.1 Zustände

| Zustand | Bedeutung |
|---|---|
| `PERMISSION_REQUIRED` | Standort (blockierend) und/oder Sensor-Freigabe fehlen (Spec 6.6, 7.3) |
| `LOADING` | Routen-/Fortschrittszustand wird geladen |
| `SEARCHING` | Aktive Führung zum abgeleiteten aktiven Wegpunkt (Kompass + Distanz) |
| `COMPLETED` | Alle Wegpunkte terminal → Abschluss-Screen (Spec 6.8) |
| `ROUTE_UNAVAILABLE` | Route/alle Wegpunkte gelöscht **oder** Code ungültig/deaktiviert → neutraler Hinweis (Spec 4.4, 5) |

`SEARCHING` hat zwei **Unterzustände** (rein UI, kein eigener Lebenszyklus):
- `HINT_HIDDEN` — geglättete Distanz ≥ Schwelle → Hinweis verborgen.
- `HINT_REVEALED` — geglättete Distanz < Schwelle → Hinweis sichtbar, „Gefunden" aktiv (Spec 6.4).

**Orthogonaler Flag `offline`** (kein eigener Zustand): bei Verbindungsverlust bleibt der aktuelle Zustand aktiv, Aktionen wandern in die Warteschlange (Spec 10), Statuszeile zeigt offline (Spec 6.10). Bei Wiederverbindung: Queue leeren, Polling fortsetzen.

## B.2 Übergänge

| Von | Ereignis / Guard | Nach |
|---|---|---|
| `PERMISSION_REQUIRED` | Standort erteilt (+ Sensor per Nutzer-Geste angefragt) | `LOADING` |
| `PERMISSION_REQUIRED` | Standort verweigert | `PERMISSION_REQUIRED` (blockierender Screen, erneut anfragen) |
| `LOADING` | State geladen ∧ ≥ 1 Wegpunkt `offen` | `SEARCHING` |
| `LOADING` | State geladen ∧ alle Wegpunkte terminal | `COMPLETED` |
| `LOADING` | Route leer/gelöscht ∨ `403`/`404` | `ROUTE_UNAVAILABLE` |
| `LOADING` | Laden schlägt fehl ∧ lokaler Cache vorhanden | `SEARCHING` (aus Cache, `offline=true`) |
| `LOADING` | Laden schlägt fehl ∧ kein Cache | `ROUTE_UNAVAILABLE` (mit Wiederholen-Option) |
| `SEARCHING` | „Gefunden" → `found` erfolgreich ∧ weiterer `offen` existiert | `SEARCHING` (neuer aktiver Wegpunkt) |
| `SEARCHING` | „Gefunden"/„Skip" ∧ kein `offen` mehr | `COMPLETED` |
| `SEARCHING` | „Skip" → `skip` erfolgreich ∧ weiterer `offen` existiert | `SEARCHING` (neuer aktiver Wegpunkt) |
| `SEARCHING` | Poll: aktiver Wegpunkt änderte sich (fremder Fund / Ersteller-Edit) | `SEARCHING` (neu rendern) |
| `SEARCHING` | Poll: alle terminal | `COMPLETED` |
| `SEARCHING` | Poll: Route weg / `403`/`404` | `ROUTE_UNAVAILABLE` |
| `SEARCHING` | Verbindung verloren / wiederhergestellt | `SEARCHING` (`offline`-Flag toggelt, Queue) |
| `COMPLETED` | Owner: „Route zurücksetzen" | `LOADING` |
| `COMPLETED` | Poll: Reset durch anderen erkannt | `LOADING` |
| `ROUTE_UNAVAILABLE` | Poll: Route wieder gültig (Wegpunkte/Code zurück) | `LOADING` |

## B.3 Guards (Kurzform)

- **G-start:** `start` nur bei ≥ 1 Wegpunkt (Server erzwingt `409`, Spec 4.3).
- **G-found/G-skip:** nur auf den **aktuell abgeleiteten aktiven** Wegpunkt anwendbar (der Button bezieht sich immer auf ihn). Server bleibt trotzdem idempotent/monoton, falls der Client veraltet ist.
- **G-hint:** `HINT_REVEALED` genau dann, wenn `smoothedDistanceMeters < HINT_THRESHOLD` (Vergleich gegen **geglättete**, nicht rohe Distanz — Spec 6.4, 7.1).

## B.4 Ableitung des aktiven Wegpunkts (Kernfunktion, rein)

```
deriveActiveWaypoint(waypoints, waypointStatus):
    sort waypoints by order_index
    for wp in waypoints:
        if statusOf(wp) == "offen": return wp
    return null            # → COMPLETED
```
Diese Funktion wird nach **jedem** State-Update aufgerufen (nach found/skip, nach jedem Poll). Dadurch ist es unmöglich, auf einen gelöschten/verschobenen Wegpunkt zu zeigen (Spec 4.4). Sie ist rein und damit direkt unit-testbar.

---

# Teil C — Algorithmus-Design (Lokalisierung)

Umsetzung von Spec 7 in `js/sensorFusion.js` als **Sammlung reiner Funktionen** (keine Seiteneffekte, kein Zugriff auf Sensoren/DOM). Sensor-Auslesen, Berechtigungen und Wake-Lock leben getrennt in `js/geolocation.js` und `js/sensors.js`; die reine Pipeline bekommt nur Rohdaten herein und gibt Werte heraus. Das macht sie mit aufgezeichneten Traces (Spec 6.11.1) ohne Telefon testbar (C.5).

## C.1 Datentypen

```
GpsSample         = { lat, lng, accuracy, timestamp }        # accuracy in m
OrientationSample = { rawHeading, absolute, source, timestamp }
                     # source: "ios" (webkitCompassHeading) | "absolute" | "relative"
Target            = { lat, lng }
SmoothedPosition  = { lat, lng, effectiveAccuracy }
Plausibility      = { plausible: bool, impliedSpeed, reasons: string[] }
```

## C.2 Konfiguration (Startwerte, Spec 7.1)

```
CONFIG = {
  SMOOTHING_WINDOW:      5,      # letzte N GPS-Messungen
  ACCURACY_WEIGHT_EXP:   2,      # Gewicht = 1 / accuracy^2
  OUTLIER_ACCURACY_MAX:  30,     # m — darüber ignorieren, wenn ...
  OUTLIER_GRACE_SEC:     10,     # ... in den letzten 10 s eine bessere Messung vorlag
  MOVE_SPEED_THRESHOLD:  0.5,    # m/s — darüber GPS-Heading, darunter Kompass
  WALK_SPEED_MAX:        2.5,    # m/s — Plausibilitäts-Gate Gehen
  RUN_SPEED_SPIKE:       5.0,    # m/s — kurzzeitige Toleranz
  HINT_THRESHOLD_M:      15,     # m — Hinweis-Freischaltung
  BOTTLE_LENGTH_M:       0.3
}
```

## C.3 Reine Funktionen (Signaturen & Aufgabe)

```
# --- Geometrie ---
computeDistanceMeters(fromLat, fromLng, toLat, toLng) -> meters
    # Haversine (Luftlinie), Spec 6.3

computeBearing(fromLat, fromLng, toLat, toLng) -> degrees[0..360)
    # Initiales Great-Circle-Bearing, bezogen auf GEOGRAFISCH Nord

metersToBottles(meters) -> number
    # meters / BOTTLE_LENGTH_M, Spec 6.3

# --- Heading / Kompass (Spec 7.3) ---
normalizeHeading(orientation, screenAngle) -> degrees[0..360)
    # iOS: webkitCompassHeading (bereits gegen Nord, im Uhrzeigersinn)
    # Android: 360 - alpha (bei absolute===true)
    # + Korrektur um screenAngle (Hoch-/Querformat)
    # liefert Geräte-Heading gegen MAGNETISCH Nord

computeCompassRotation(bearingToTargetTrue, deviceHeadingMagnetic, declination) -> degrees
    # Rotation der Flaschen-Grafik.
    # Vereinheitlicht die Nordreferenz: bearingTrue -> magnetisch via declination
    # rotation = normalize( (bearingToTargetTrue - declination) - deviceHeadingMagnetic )
    # declination ortsabhängig; einfache dokumentierte Näherung genügt (Spec 7.3, 13)

# --- Filterung / Fusion (Spec 7.1, 7.2) ---
isPlausibleMovement(prevSmoothed, newSample, dtSeconds, lastHeading, target, config) -> Plausibility
    # 1) Geschwindigkeits-Gate: impliedSpeed = dist(prev,new)/dt
    #    > RUN_SPEED_SPIKE  -> unplausibel
    #    > WALK_SPEED_MAX   -> nur als kurzer Spike toleriert
    # 2) Richtungs-Konsistenz: Winkel(Bewegungsrichtung, lastHeading) groß + großer Sprung -> Indiz Fehler
    # 3) Ziel-Richtung als weiches Signal: Sprung seitlich am Ziel vorbei trotz vorheriger
    #    Annäherung -> abwerten (schwächster Faktor)
    # Rückgabe: plausible + impliedSpeed + reasons (für Debug-Log 6.11.1)

smoothPosition(recentSamples, newSample, config) -> SmoothedPosition
    # gewichteter gleitender Mittelwert über letzte N,
    # Gewicht 1/accuracy^ACCURACY_WEIGHT_EXP
    # Ausreißer (accuracy > OUTLIER_ACCURACY_MAX innerhalb OUTLIER_GRACE_SEC) ausschließen
    # als unplausibel markierte Samples nicht (oder stark abgewertet) einbeziehen

# --- Ableitungen fürs UI ---
shouldRevealHint(smoothedDistanceMeters, config) -> bool
    # smoothedDistanceMeters < HINT_THRESHOLD_M  (Spec 6.4)
```

## C.4 Pipeline (Datenfluss)

Die orchestrierende Schleife (in `searchMode.js`, **nicht** rein) hält den Verlaufspuffer und ruft die reinen Funktionen:

```
Bei jedem GPS-Event (newSample):
  dt        = newSample.timestamp - lastSample.timestamp
  plaus     = isPlausibleMovement(prevSmoothed, newSample, dt, lastHeading, target, CONFIG)
  → Debug-Log: bei !plaus.plausible "WARN drift erkannt" (Spec 6.11.1) + Statuszeile "Drift" (6.10)
  smoothed  = smoothPosition(window.push(newSample), newSample, CONFIG)   # plaus fließt als Gewicht ein
  distM     = computeDistanceMeters(smoothed.lat, smoothed.lng, target.lat, target.lng)
  bottles   = metersToBottles(distM)
  reveal    = shouldRevealHint(distM, CONFIG)
  → UI: Distanz/Flaschen aktualisieren; Nahbereich-Darstellung + Hinweis gemäß reveal (6.3/6.4)

Bei jedem Orientation-Event (orientation):
  heading      = normalizeHeading(orientation, screenAngle)
  bearingT     = computeBearing(smoothed.lat, smoothed.lng, target.lat, target.lng)
  rawRotation  = computeCompassRotation(bearingT, heading, declination)
  dtMs         = orientation.timestamp - lastRotationTs   # Zeit seit dem letzten Rotations-Update
  rotation     = smoothRotationTimed(rotation, rawRotation, dtMs, ROTATION_TIME_CONSTANT_MS)
  → Render-Totband: nur wenn angularDifference(renderedRotation, rotation) >= ROTATION_RENDER_DEADBAND_DEG
    (oder renderedRotation noch unbekannt): renderedRotation = rotation, UI rendert
    → UI: Flaschen-Grafik auf renderedRotation drehen

Heading-Quelle (7.1):
  wenn impliedSpeed > MOVE_SPEED_THRESHOLD: GPS-Bewegungsvektor als Referenz
  sonst: normalizeHeading() (Kompass)
```

**Amendment (Bug-Fix „Kompassnadel zittert/ruckelt"):** `smoothRotationTimed(prevRotation, targetRotation, dtMs, timeConstantMs)` ersetzt in der Pipeline die ältere, sample-raten-abhängige `smoothRotation(prev, next, smoothingFactor)` — Glättung über eine feste **Zeitkonstante** (`ROTATION_TIME_CONSTANT_MS`, Default 150 ms) statt eines festen Anteils pro `deviceorientation`-Sample, dessen Rate je nach Gerät stark schwankt (10–60 Hz). Zusätzlich unterdrückt ein **Render-Totband** (`ROTATION_RENDER_DEADBAND_DEG`, Default 2°) Sensorrauschen unterhalb der Schwelle, statt es sichtbar zu machen. `smoothRotation`/`ROTATION_SMOOTHING` bleiben unverändert im Code (Legacy, weiterhin getestet), werden von der Pipeline aber nicht mehr aufgerufen. Gleicher Kontinuitäts-Vertrag wie bisher (C.3): Rückgabe nicht normalisieren, kürzester Weg um den Kreis.

**Genauigkeits-Rahmen (Spec 6.1) im Code sichtbar machen:** Unterschreitet `distM` die Hinweisschwelle, wird die exakte Flaschen-Zahl zugunsten der Nah-Darstellung zurückgenommen — die Zahl soll dort keine Scheinpräzision vorgaukeln.

## C.5 Testbarkeit — Trace-Replay

Weil alle Kernfunktionen rein sind, lässt sich der komplette Algorithmus offline mit **aufgezeichneten Traces** prüfen (die Log-Zeilen aus Spec 6.11.1 sind bereits genau dieses Format):

```
# Regressionstest-Skizze
trace   = ladeAufgezeichneteSamples("feldtest-park-2026.json")   # [GpsSample|OrientationSample]
state   = leererVerlauf()
outputs = []
für sample in trace:
    if istGps(sample):
        plaus    = isPlausibleMovement(...)
        smoothed = smoothPosition(...)
        outputs.push({ dist: computeDistanceMeters(smoothed, target), drift: !plaus.plausible })
# Assertions, z. B.:
#  - kein plausibler realer Schritt wird als Drift verworfen
#  - bekannte Ausreißer-Samples werden verworfen
#  - geglättete Distanz konvergiert monoton beim Zugehen aufs Ziel
```

Das schließt den Kreislauf Feld → Log kopieren (6.11.1) → als Testfall ablegen → Parameter (C.2) justieren, ohne erneut ins Feld zu müssen (Spec 7, 12 Phase 5).

## C.6 Offene Feinjustierung (bewusst iterativ, Spec 13)

Filtergewichte, Deklinations-Näherung, exakte Schwellen der Plausibilitäts-Faktoren und die Nahbereich-Umschaltung werden im Feldtest kalibriert — ohne die hier festgelegten Signaturen und Verträge zu ändern.

---

# Teil D — Deployment-Vertrag (Pi-Konstrukt)

Verbindlicher Standard der zentralen Installations-Automatisierung des
PiMultiServiceServer-Konstrukts, damit sie alle darin laufenden Seiten einheitlich
behandeln kann. Gilt zusätzlich zu, nicht anstelle von, Teil A–C. Bei Abweichung: dieses
Repo anpassen, nicht den Vertrag.

| # | Anforderung | Umsetzung in diesem Repo |
|---|---|---|
| D.1 | `Dockerfile` im Repo-Root, App läuft als Container | `Dockerfile` |
| D.2 | Lauscht auf `process.env.PORT` (Default `3000`) | `server.js` |
| D.3 | Start ohne Argumente: `node server.js` | `package.json#scripts.start`, Dockerfile `CMD` |
| D.4 | SQLite-Datei unter `process.env.DB_PATH` (Default `./data/winecashing.db`); Host mountet `/data` als Volume | `db/index.js` |
| D.5 | Secrets nur aus Env-Variablen, nie committen: `SESSION_SECRET`; bei Admin-Funktion zusätzlich `ADMIN_USER` + `ADMIN_PASSWORD` | `.env.example`, `app.js`, `scripts/seedAdmin.js` |
| D.6 | Admin-Seed `npm run seed:admin` liest `ADMIN_USER`/`ADMIN_PASSWORD`; Admin-Account ist zentral einmal gesetzt und über alle Seiten identisch | `scripts/seedAdmin.js` |
| D.7 | `.env.example` mit allen Variablen als Platzhalter; echte `.env` in `.gitignore` | `.env.example`, `.gitignore` |

**Wichtig:** Die Variable heißt exakt `ADMIN_USER` (nicht `ADMIN_USERNAME`) — das ist der
zentrale Vertrag über alle Seiten des Konstrukts hinweg, unabhängig vom internen
Domänen-Feldnamen `username` in diesem Repo (`users.username` in `db/schema.sql`).
