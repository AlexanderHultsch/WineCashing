// Beitritt, Zustand lesen (Polling-Quelle), Fund/Skip melden (Vertrag A.5).
// Zugriff: Owner-Session ODER gültiger X-Route-Code.
import { Router } from 'express';
import { requireRouteAccess } from '../middleware/auth.js';

const router = Router();

// POST /api/join {route_code} -> 200 {RouteState} | 404 CODE_NOT_FOUND | 403 ROUTE_ACCESS_REVOKED
// (anonym; Code im Body — Client speichert ihn und schickt danach X-Route-Code)
router.post('/join', (req, res, next) => next(new Error('TODO')));

// GET /api/routes/:routeId/state -> 200 {RouteState}
// EINZIGE Quelle für Such-Modus & ~7-s-Polling. Enthält server_time.
// Code ungültig/deaktiviert -> 403 ROUTE_ACCESS_REVOKED; Route gelöscht -> 404.
router.get('/:routeId/state', requireRouteAccess, (req, res, next) => next(new Error('TODO')));

// POST /api/routes/:routeId/waypoints/:wpId/found -> 200 {waypoint_status, progress}
// POST /api/routes/:routeId/waypoints/:wpId/skip  -> 200 {waypoint_status, progress}
// Idempotent & monoton: offen->gefunden / offen->übersprungen; terminal = No-Op (200).
// Nach Erfolg: alle terminal? -> completed_at setzen. client_ts (optional) nur fürs Logging.
router.post('/:routeId/waypoints/:wpId/found', requireRouteAccess, (req, res, next) => next(new Error('TODO')));
router.post('/:routeId/waypoints/:wpId/skip', requireRouteAccess, (req, res, next) => next(new Error('TODO')));

export default router;
