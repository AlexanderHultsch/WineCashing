// Beitritt, Zustand lesen (Polling-Quelle), Fund/Skip melden (Vertrag A.5).
import { Router } from 'express';
import { apiError } from '../middleware/errorEnvelope.js';
import { buildRouteState, resolveStatusTransition, allTerminal, toProgress, toWaypointStatus } from '../lib/domain.js';

// Baut das RouteState aus dem aktuellen DB-Zustand (Vertrag A.6).
function routeStateOf(repo, route, now) {
  return buildRouteState({
    route,
    waypoints: repo.listWaypoints(route.id),
    statuses: repo.listStatuses(route.id),
    progress: repo.getProgress(route.id),
    serverTime: now(),
  });
}

export function createProgressRouter({ repo, auth, now }) {
  const router = Router();

  // POST /api/join {route_code} -> 200 {RouteState} | 404 CODE_NOT_FOUND | 403 ROUTE_ACCESS_REVOKED
  router.post('/join', (req, res) => {
    const code = req.body?.route_code;
    if (typeof code !== 'string' || code.trim().length === 0) {
      throw apiError('VALIDATION', 'route_code fehlt.');
    }
    const route = repo.getRouteByCode(code);
    if (!route) throw apiError('CODE_NOT_FOUND', 'Routen-Code unbekannt.');
    if (!route.route_code_active) throw apiError('ROUTE_ACCESS_REVOKED', 'Der Routen-Code ist nicht mehr gültig.');
    res.json(routeStateOf(repo, route, now));
  });

  // GET /api/routes/:routeId/state -> 200 {RouteState}. Einzige Polling-Quelle (Vertrag 6.9).
  router.get('/routes/:routeId/state', auth.requireRouteAccess, (req, res) => {
    res.json(routeStateOf(repo, req.route, now));
  });

  // found/skip: idempotent & monoton (Vertrag A.5). client_ts (optional) nur fürs Logging.
  function handleAction(action) {
    return (req, res) => {
      const wp = repo.getWaypoint(req.params.wpId);
      if (!wp || wp.route_id !== req.route.id) throw apiError('NOT_FOUND', 'Wegpunkt nicht gefunden.');

      const currentStatus = repo.getStatus(wp.id);
      const { status, changed } = resolveStatusTransition(currentStatus.status, action);
      const statusRow = changed ? repo.setStatus(wp.id, status, now()) : currentStatus;

      // Nach jedem Wechsel: alle terminal? -> completed_at setzen (bzw. wieder leeren).
      const statuses = repo.listStatuses(req.route.id);
      const progress = repo.getProgress(req.route.id);
      if (allTerminal(statuses)) {
        if (!progress?.completed_at) repo.setCompletedAt(req.route.id, now());
      } else if (progress?.completed_at) {
        repo.setCompletedAt(req.route.id, null);
      }

      res.json({
        waypoint_status: toWaypointStatus(statusRow),
        progress: toProgress(req.route.id, repo.getProgress(req.route.id)),
      });
    };
  }

  router.post('/routes/:routeId/waypoints/:wpId/found', auth.requireRouteAccess, handleAction('found'));
  router.post('/routes/:routeId/waypoints/:wpId/skip', auth.requireRouteAccess, handleAction('skip'));

  return router;
}
