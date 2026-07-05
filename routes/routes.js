// Routen- & Wegpunkt-Verwaltung, Start/Reset, Routen-Code (Vertrag A.4). Nur Owner der eigenen Route.
import { Router } from 'express';
import { requireOwner, requireRouteOwner } from '../middleware/auth.js';

const router = Router();

// --- Routen ---
// GET  /api/routes                 -> 200 [RouteSummary]   (nur eigene)
router.get('/', requireOwner, (req, res, next) => next(new Error('TODO')));
// POST /api/routes {name}          -> 201 {Route}          (status = "erstellung")
router.post('/', requireOwner, (req, res, next) => next(new Error('TODO')));
// GET  /api/routes/:routeId        -> 200 {Route + waypoints}
router.get('/:routeId', requireRouteOwner, (req, res, next) => next(new Error('TODO')));
// PATCH /api/routes/:routeId {name?}-> 200 {Route}
router.patch('/:routeId', requireRouteOwner, (req, res, next) => next(new Error('TODO')));
// DELETE /api/routes/:routeId      -> 204
router.delete('/:routeId', requireRouteOwner, (req, res, next) => next(new Error('TODO')));
// POST /api/routes/:routeId/start  -> 200 {Route, RouteProgress} | 409 NO_WAYPOINTS
router.post('/:routeId/start', requireRouteOwner, (req, res, next) => next(new Error('TODO')));
// POST /api/routes/:routeId/reset  -> 200 {RouteProgress}  (alle Wegpunkte -> "offen")
router.post('/:routeId/reset', requireRouteOwner, (req, res, next) => next(new Error('TODO')));

// --- Wegpunkte (auch während laufender Suche erlaubt; aktiver Wegpunkt leitet sich neu ab) ---
// POST   /api/routes/:routeId/waypoints {lat,lng,hint_text,name?,order_index?} -> 201 {Waypoint}
router.post('/:routeId/waypoints', requireRouteOwner, (req, res, next) => next(new Error('TODO')));
// PATCH  /api/routes/:routeId/waypoints/:wpId (Teilfelder) -> 200 {Waypoint}
router.patch('/:routeId/waypoints/:wpId', requireRouteOwner, (req, res, next) => next(new Error('TODO')));
// DELETE /api/routes/:routeId/waypoints/:wpId -> 204
router.delete('/:routeId/waypoints/:wpId', requireRouteOwner, (req, res, next) => next(new Error('TODO')));
// PUT    /api/routes/:routeId/waypoints/order {ordered_ids:[...]} -> 200 [Waypoint]
router.put('/:routeId/waypoints/order', requireRouteOwner, (req, res, next) => next(new Error('TODO')));

// --- Routen-Code (Vertrag A.4) ---
// POST /api/routes/:routeId/code            -> 200 {route_code, active:true}  (erzeugen/aktuellen)
router.post('/:routeId/code', requireRouteOwner, (req, res, next) => next(new Error('TODO')));
// POST /api/routes/:routeId/code/renew      -> 200 {route_code, active:true}  (alter ungültig)
router.post('/:routeId/code/renew', requireRouteOwner, (req, res, next) => next(new Error('TODO')));
// POST /api/routes/:routeId/code/deactivate -> 200 {active:false}             (alle ausgesperrt)
router.post('/:routeId/code/deactivate', requireRouteOwner, (req, res, next) => next(new Error('TODO')));

export default router;
