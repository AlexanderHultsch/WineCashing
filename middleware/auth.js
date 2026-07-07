// Zugriffskontrolle — zwei getrennte Mechanismen (Vertrag A.1). Als Factory über das Repo.
import { apiError } from './errorEnvelope.js';
import { formatRouteCode } from '../lib/routeCode.js';

export function createAuth(repo) {
  function currentUser(req) {
    const userId = req.session?.userId;
    if (!userId) return null;
    return repo.getUserById(userId) ?? null;
  }

  // Eingeloggter Owner (Session). Setzt req.user.
  function requireOwner(req, _res, next) {
    const user = currentUser(req);
    if (!user) return next(apiError('UNAUTHENTICATED', 'Nicht eingeloggt.'));
    req.user = user;
    return next();
  }

  // Owner der konkreten :routeId (nur eigene Route). Setzt req.user, req.route.
  function requireRouteOwner(req, _res, next) {
    const user = currentUser(req);
    if (!user) return next(apiError('UNAUTHENTICATED', 'Nicht eingeloggt.'));
    const route = repo.getRoute(req.params.routeId);
    // Fremde/fehlende Routen sehen für den Nutzer gleich aus (kein Enumerieren).
    if (!route || route.owner_user_id !== user.id) {
      return next(apiError('NOT_FOUND', 'Route nicht gefunden.'));
    }
    req.user = user;
    req.route = route;
    return next();
  }

  // Nur is_admin. Setzt req.user.
  function requireAdmin(req, _res, next) {
    const user = currentUser(req);
    if (!user) return next(apiError('UNAUTHENTICATED', 'Nicht eingeloggt.'));
    if (!user.is_admin) return next(apiError('NOT_ADMIN', 'Adminrechte erforderlich.'));
    req.user = user;
    return next();
  }

  // Owner-Session (eigene Route) ODER gültiger X-Route-Code. Für /state, /found, /skip.
  // Prüft bei JEDEM Zugriff: Route existiert; Code gehört zur Route und route_code_active.
  function requireRouteAccess(req, _res, next) {
    const route = repo.getRoute(req.params.routeId);
    if (!route) return next(apiError('NOT_FOUND', 'Route nicht gefunden.'));

    const user = currentUser(req);
    if (user && route.owner_user_id === user.id) {
      req.user = user;
      req.route = route;
      req.accessMode = 'owner';
      return next();
    }

    const code = req.get('X-Route-Code');
    if (code) {
      const matches = route.route_code && route.route_code === formatRouteCode(code);
      if (matches && route.route_code_active) {
        req.route = route;
        req.accessMode = 'code';
        return next();
      }
      return next(apiError('ROUTE_ACCESS_REVOKED', 'Der Routen-Code ist nicht mehr gültig.'));
    }

    return next(apiError('UNAUTHENTICATED', 'Login oder Routen-Code erforderlich.'));
  }

  return { requireOwner, requireRouteOwner, requireAdmin, requireRouteAccess };
}
