// Reine Domänenlogik & Antwort-Shaping (Vertrag A.5, A.6). Keine DB, keine Seiteneffekte.

export const ROUTE_STATUS = { ERSTELLUNG: 'erstellung', SUCH_MODUS: 'such_modus' };
export const WAYPOINT_STATUS = { OFFEN: 'offen', GEFUNDEN: 'gefunden', UEBERSPRUNGEN: 'übersprungen' };

const TERMINAL = new Set([WAYPOINT_STATUS.GEFUNDEN, WAYPOINT_STATUS.UEBERSPRUNGEN]);
const ACTION_TARGET = { found: WAYPOINT_STATUS.GEFUNDEN, skip: WAYPOINT_STATUS.UEBERSPRUNGEN };

export function isTerminal(status) {
  return TERMINAL.has(status);
}

// Idempotent & monoton (Vertrag A.5): offen -> terminal; terminal -> No-Op.
// -> { status, changed }. Nur `changed === true` schreibt einen neuen Status.
export function resolveStatusTransition(current, action) {
  const target = ACTION_TARGET[action];
  if (!target) throw new Error(`unbekannte Aktion: ${action}`);
  if (current === WAYPOINT_STATUS.OFFEN) return { status: target, changed: true };
  return { status: current, changed: false };
}

// Alle Wegpunkte terminal? (leere Route zählt nicht als abgeschlossen)
export function allTerminal(statuses) {
  return statuses.length > 0 && statuses.every((s) => isTerminal(s.status));
}

// --- Antwort-Shapes (Vertrag A.6). Wandeln DB-Zeilen (0/1) in JSON-Typen (bool). ---
export function toRouteSummary(route) {
  return {
    id: route.id,
    name: route.name,
    status: route.status,
    route_code: route.route_code ?? null,
    route_code_active: !!route.route_code_active,
    created_at: route.created_at,
  };
}

export function toWaypoint(w) {
  return {
    id: w.id,
    route_id: w.route_id,
    order_index: w.order_index,
    lat: w.lat,
    lng: w.lng,
    hint_text: w.hint_text,
    name: w.name ?? null,
  };
}

export function toRoute(route, waypoints) {
  return { ...toRouteSummary(route), owner_user_id: route.owner_user_id, waypoints: waypoints.map(toWaypoint) };
}

export function toProgress(routeId, progress) {
  return {
    route_id: routeId,
    started_at: progress?.started_at ?? null,
    completed_at: progress?.completed_at ?? null,
  };
}

export function toWaypointStatus(row) {
  return { waypoint_id: row.waypoint_id, status: row.status, updated_at: row.updated_at };
}

// RouteState — einzige Quelle fürs Polling (Vertrag A.5).
export function buildRouteState({ route, waypoints, statuses, progress, serverTime }) {
  return {
    route: { id: route.id, name: route.name, status: route.status },
    waypoints: waypoints.map(toWaypoint),
    progress: toProgress(route.id, progress),
    waypoint_status: statuses.map(toWaypointStatus),
    server_time: serverTime,
  };
}

export function publicUser(user) {
  return { id: user.id, username: user.username, is_admin: !!user.is_admin };
}

// --- Admin-Übersicht (Frage 6) ---
export function toAdminRouteSummary(route) {
  return { ...toRouteSummary(route), owner_username: route.owner_username };
}

export function toAdminUserSummary(user) {
  return { id: user.id, username: user.username, is_admin: !!user.is_admin, created_at: user.created_at, route_count: user.route_count };
}
