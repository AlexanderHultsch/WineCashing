-- Wine Caching — Datenmodell
-- Antwort-Shapes: siehe docs/technischer-vertrag.md A.6.
-- Der aktive Wegpunkt wird NIE gespeichert, sondern abgeleitet (B.4).

PRAGMA foreign_keys = ON;

-- Ersteller (Owner). Mitsucher sind kontolos und haben KEINEN Datensatz.
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,            -- bcrypt/argon2
  is_admin      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL             -- ISO 8601 UTC
);

CREATE TABLE IF NOT EXISTS routes (
  id                TEXT PRIMARY KEY,
  owner_user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'erstellung',   -- 'erstellung' | 'such_modus'
  route_code        TEXT UNIQUE,                          -- NULL bis erzeugt
  route_code_active INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_routes_owner ON routes(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_routes_code  ON routes(route_code);

CREATE TABLE IF NOT EXISTS waypoints (
  id          TEXT PRIMARY KEY,
  route_id    TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  lat         REAL NOT NULL,
  lng         REAL NOT NULL,
  hint_text   TEXT NOT NULL,
  name        TEXT
);
CREATE INDEX IF NOT EXISTS idx_waypoints_route ON waypoints(route_id, order_index);

-- Ein Status-Datensatz pro Wegpunkt. Übergänge idempotent & monoton (A.5).
CREATE TABLE IF NOT EXISTS waypoint_status (
  waypoint_id TEXT PRIMARY KEY REFERENCES waypoints(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'offen',   -- 'offen' | 'gefunden' | 'übersprungen'
  updated_at  TEXT NOT NULL
);

-- Fortschritt pro Route (1:1). started_at bei Start/Reset, completed_at wenn alle terminal.
CREATE TABLE IF NOT EXISTS route_progress (
  route_id     TEXT PRIMARY KEY REFERENCES routes(id) ON DELETE CASCADE,
  started_at   TEXT,
  completed_at TEXT
);
