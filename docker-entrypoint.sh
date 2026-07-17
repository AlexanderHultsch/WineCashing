#!/bin/sh
# Läuft als root, damit das gemountete Datenverzeichnis dem "node"-Nutzer
# gehört (ein Bind-Mount gehört anfangs root -> sonst SQLITE_CANTOPEN),
# und lässt den eigentlichen Prozess dann unprivilegiert weiterlaufen.
set -e

DB_DIR="$(dirname "${DB_PATH:-/data/winecashing.db}")"
mkdir -p "$DB_DIR"
chown -R node:node "$DB_DIR"

exec su-exec node "$@"
