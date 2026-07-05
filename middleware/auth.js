// Zugriffskontrolle — zwei getrennte Mechanismen (Vertrag A.1).

// Owner-Session (httpOnly-Cookie). Setzt req.user; sonst 401 UNAUTHENTICATED.
// TODO: Session prüfen, Nutzer laden.
export function requireOwner(req, res, next) {
  next(new Error('requireOwner: TODO'));
}

// Owner der konkreten :routeId (nur eigene Route). TODO.
export function requireRouteOwner(req, res, next) {
  next(new Error('requireRouteOwner: TODO'));
}

// Zugriff per Owner-Session ODER gültigem X-Route-Code auf :routeId.
// Validiert bei JEDEM Zugriff: Code existiert, gehört zur Route, route_code_active = true.
// Sonst 403 ROUTE_ACCESS_REVOKED. Für /state, /found, /skip. TODO.
export function requireRouteAccess(req, res, next) {
  next(new Error('requireRouteAccess: TODO'));
}

// Nur is_admin (Passwort-Reset). TODO.
export function requireAdmin(req, res, next) {
  next(new Error('requireAdmin: TODO'));
}
