// DB-Verbindung & Schema-Migration.
// SQLite (better-sqlite3). Pfad via WINE_DB_PATH, sonst ./data/wine.sqlite.
//
// TODO: better-sqlite3 öffnen, schema.sql einspielen, konfigurierte Instanz exportieren.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const DB_PATH = process.env.WINE_DB_PATH || join(__dirname, '..', 'data', 'wine.sqlite');
export const SCHEMA_SQL = () => readFileSync(join(__dirname, 'schema.sql'), 'utf8');

// export function getDb() { /* TODO: Singleton-Verbindung */ }
// export function migrate(db) { db.exec(SCHEMA_SQL()); }
