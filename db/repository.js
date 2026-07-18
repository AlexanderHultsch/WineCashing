// Repository — kapselt allen SQL-Zugriff hinter einer schlanken Schnittstelle.
// Router/Middleware hängen nur von dieser Schnittstelle ab (injiziert), daher gegen
// eine In-Memory- oder :memory:-SQLite-DB testbar. Erwartet ein node:sqlite-Handle.
import { formatRouteCode } from '../lib/routeCode.js';

export function createRepository(db) {
  const q = (sql) => db.prepare(sql);

  // Wegpunkte inkl. Status-Initialisierung in einer Transaktion.
  const tx = (fn) => {
    db.exec('BEGIN');
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };

  return {
    // --- Users ---
    createUser(u) {
      q('INSERT INTO users(id, username, password_hash, is_admin, created_at) VALUES(?,?,?,?,?)').run(
        u.id,
        u.username,
        u.password_hash,
        u.is_admin ? 1 : 0,
        u.created_at,
      );
      return this.getUserById(u.id);
    },
    getUserById(id) {
      return q('SELECT * FROM users WHERE id = ?').get(id) ?? null;
    },
    getUserByUsername(username) {
      return q('SELECT * FROM users WHERE username = ?').get(username) ?? null;
    },
    setUserPassword(id, passwordHash) {
      q('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
    },
    setUserAdmin(id, isAdmin) {
      q('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin ? 1 : 0, id);
    },
    // Admin-Übersicht (Frage 6): alle Nutzer inkl. Routen-Anzahl.
    listAllUsers() {
      return q(
        `SELECT u.id, u.username, u.is_admin, u.created_at,
                (SELECT COUNT(*) FROM routes r WHERE r.owner_user_id = u.id) AS route_count
         FROM users u ORDER BY u.created_at`,
      ).all();
    },
    // Löscht Nutzer + all seine Routen/Wegpunkte/Status/Fortschritt (ON DELETE CASCADE, schema.sql).
    deleteUser(id) {
      q('DELETE FROM users WHERE id = ?').run(id);
    },

    // --- Routes ---
    createRoute(r) {
      q(
        'INSERT INTO routes(id, owner_user_id, name, status, route_code, route_code_active, created_at) VALUES(?,?,?,?,?,?,?)',
      ).run(r.id, r.owner_user_id, r.name, r.status, r.route_code ?? null, r.route_code_active ? 1 : 0, r.created_at);
      return this.getRoute(r.id);
    },
    getRoute(id) {
      return q('SELECT * FROM routes WHERE id = ?').get(id) ?? null;
    },
    getRouteByCode(code) {
      return q('SELECT * FROM routes WHERE route_code = ?').get(formatRouteCode(code)) ?? null;
    },
    listRoutesByOwner(ownerUserId) {
      return q('SELECT * FROM routes WHERE owner_user_id = ? ORDER BY created_at').all(ownerUserId);
    },
    updateRouteName(id, name) {
      q('UPDATE routes SET name = ? WHERE id = ?').run(name, id);
      return this.getRoute(id);
    },
    setRouteStatus(id, status) {
      q('UPDATE routes SET status = ? WHERE id = ?').run(status, id);
      return this.getRoute(id);
    },
    setRouteCode(id, code, active) {
      q('UPDATE routes SET route_code = ?, route_code_active = ? WHERE id = ?').run(code, active ? 1 : 0, id);
      return this.getRoute(id);
    },
    setRouteCodeActive(id, active) {
      q('UPDATE routes SET route_code_active = ? WHERE id = ?').run(active ? 1 : 0, id);
      return this.getRoute(id);
    },
    deleteRoute(id) {
      q('DELETE FROM routes WHERE id = ?').run(id); // ON DELETE CASCADE räumt den Rest
    },
    // Admin-Übersicht (Frage 6): alle Routen aller Nutzer inkl. Ersteller-Name.
    listAllRoutes() {
      return q(
        `SELECT r.*, u.username AS owner_username
         FROM routes r JOIN users u ON u.id = r.owner_user_id
         ORDER BY r.created_at DESC`,
      ).all();
    },

    // --- Waypoints ---
    createWaypoint(w) {
      return tx(() => {
        q('INSERT INTO waypoints(id, route_id, order_index, lat, lng, hint_text, name) VALUES(?,?,?,?,?,?,?)').run(
          w.id,
          w.route_id,
          w.order_index,
          w.lat,
          w.lng,
          w.hint_text,
          w.name ?? null,
        );
        q('INSERT INTO waypoint_status(waypoint_id, status, updated_at) VALUES(?, ?, ?)').run(
          w.id,
          'offen',
          w.updated_at,
        );
        return this.getWaypoint(w.id);
      });
    },
    getWaypoint(id) {
      return q('SELECT * FROM waypoints WHERE id = ?').get(id) ?? null;
    },
    listWaypoints(routeId) {
      return q('SELECT * FROM waypoints WHERE route_id = ? ORDER BY order_index').all(routeId);
    },
    maxOrderIndex(routeId) {
      const row = q('SELECT MAX(order_index) AS m FROM waypoints WHERE route_id = ?').get(routeId);
      return row?.m ?? -1;
    },
    updateWaypoint(id, patch) {
      const fields = [];
      const values = [];
      for (const key of ['order_index', 'lat', 'lng', 'hint_text', 'name']) {
        if (patch[key] !== undefined) {
          fields.push(`${key} = ?`);
          values.push(patch[key]);
        }
      }
      if (fields.length > 0) {
        q(`UPDATE waypoints SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);
      }
      return this.getWaypoint(id);
    },
    deleteWaypoint(id) {
      q('DELETE FROM waypoints WHERE id = ?').run(id);
    },
    reorderWaypoints(routeId, orderedIds) {
      tx(() => {
        orderedIds.forEach((id, index) => {
          q('UPDATE waypoints SET order_index = ? WHERE id = ? AND route_id = ?').run(index, id, routeId);
        });
      });
      return this.listWaypoints(routeId);
    },

    // --- Waypoint status ---
    getStatus(waypointId) {
      return q('SELECT * FROM waypoint_status WHERE waypoint_id = ?').get(waypointId) ?? null;
    },
    setStatus(waypointId, status, updatedAt) {
      q('UPDATE waypoint_status SET status = ?, updated_at = ? WHERE waypoint_id = ?').run(status, updatedAt, waypointId);
      return this.getStatus(waypointId);
    },
    listStatuses(routeId) {
      return q(
        `SELECT ws.waypoint_id, ws.status, ws.updated_at
         FROM waypoint_status ws JOIN waypoints w ON w.id = ws.waypoint_id
         WHERE w.route_id = ? ORDER BY w.order_index`,
      ).all(routeId);
    },
    resetStatuses(routeId, status, updatedAt) {
      q(
        `UPDATE waypoint_status SET status = ?, updated_at = ?
         WHERE waypoint_id IN (SELECT id FROM waypoints WHERE route_id = ?)`,
      ).run(status, updatedAt, routeId);
    },

    // --- Route progress ---
    getProgress(routeId) {
      return q('SELECT * FROM route_progress WHERE route_id = ?').get(routeId) ?? null;
    },
    upsertProgress(routeId, { started_at, completed_at }) {
      q(
        `INSERT INTO route_progress(route_id, started_at, completed_at) VALUES(?, ?, ?)
         ON CONFLICT(route_id) DO UPDATE SET started_at = excluded.started_at, completed_at = excluded.completed_at`,
      ).run(routeId, started_at ?? null, completed_at ?? null);
      return this.getProgress(routeId);
    },
    setCompletedAt(routeId, completedAt) {
      q('UPDATE route_progress SET completed_at = ? WHERE route_id = ?').run(completedAt, routeId);
      return this.getProgress(routeId);
    },
  };
}
