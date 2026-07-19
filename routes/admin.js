// Admin-Übersicht & -Verwaltung (Frage 6 aus dem Nutzer-Feedback): nur `is_admin`-Nutzer.
// Sieht/verwaltet ALLE Routen und Nutzer, nicht nur die eigenen — bewusst als eigene,
// gespiegelte Endpunkte statt die Owner-Middleware aufzuweichen (klare Rechtetrennung).
import { Router } from 'express';
import { apiError } from '../middleware/errorEnvelope.js';
import { toAdminRouteSummary, toAdminUserSummary } from '../lib/domain.js';
import { renewRouteCode, activateRouteCode } from '../lib/routeCode.js';

function loadAnyRoute(repo, routeId) {
  const route = repo.getRoute(routeId);
  if (!route) throw apiError('NOT_FOUND', 'Route nicht gefunden.');
  return route;
}

export function createAdminRouter({ repo, auth, generateCode }) {
  const router = Router();
  const admin = auth.requireAdmin;

  router.get('/routes', admin, (_req, res) => {
    res.json(repo.listAllRoutes().map(toAdminRouteSummary));
  });

  router.get('/users', admin, (_req, res) => {
    res.json(repo.listAllUsers().map(toAdminUserSummary));
  });

  router.delete('/routes/:routeId', admin, (req, res) => {
    loadAnyRoute(repo, req.params.routeId);
    repo.deleteRoute(req.params.routeId);
    res.status(204).end();
  });

  router.delete('/users/:userId', admin, (req, res) => {
    if (req.params.userId === req.user.id) {
      throw apiError('SELF_DELETE_FORBIDDEN', 'Der eigene Admin-Account kann nicht gelöscht werden.');
    }
    const target = repo.getUserById(req.params.userId);
    if (!target) throw apiError('NOT_FOUND', 'Nutzer nicht gefunden.');
    repo.deleteUser(req.params.userId);
    res.status(204).end();
  });

  router.post('/routes/:routeId/code/renew', admin, (req, res) => {
    loadAnyRoute(repo, req.params.routeId);
    const route = renewRouteCode(repo, req.params.routeId, generateCode);
    res.json({ route_code: route.route_code, active: true });
  });

  router.post('/routes/:routeId/code/activate', admin, (req, res) => {
    const route = loadAnyRoute(repo, req.params.routeId);
    const updated = activateRouteCode(repo, route, generateCode);
    res.json({ route_code: updated.route_code, active: true });
  });

  router.post('/routes/:routeId/code/deactivate', admin, (req, res) => {
    loadAnyRoute(repo, req.params.routeId);
    repo.setRouteCodeActive(req.params.routeId, false);
    res.json({ active: false });
  });

  return router;
}
