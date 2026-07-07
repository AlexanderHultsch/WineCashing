// Einheitlicher Fehler-Umschlag (Vertrag A.2):
//   { "error": { "code": "ROUTE_ACCESS_REVOKED", "message": "..." } }

// Wirf diesen Fehler in Handlern; der zentrale Error-Handler formatiert ihn.
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Bekannte Fehlercodes (Vertrag A.2–A.5).
export const ERR = {
  USERNAME_TAKEN:        [409, 'USERNAME_TAKEN'],
  INVALID_CREDENTIALS:   [401, 'INVALID_CREDENTIALS'],
  NOT_ADMIN:             [403, 'NOT_ADMIN'],
  USER_NOT_FOUND:        [404, 'USER_NOT_FOUND'],
  NO_WAYPOINTS:          [409, 'NO_WAYPOINTS'],
  CODE_NOT_FOUND:        [404, 'CODE_NOT_FOUND'],
  ROUTE_ACCESS_REVOKED:  [403, 'ROUTE_ACCESS_REVOKED'],
  NOT_FOUND:             [404, 'NOT_FOUND'],
  UNAUTHENTICATED:       [401, 'UNAUTHENTICATED'],
  VALIDATION:            [400, 'VALIDATION'],
  RATE_LIMITED:          [429, 'RATE_LIMITED'],
};

export function apiError(key, message) {
  const [status, code] = ERR[key];
  return new ApiError(status, code, message);
}

// Zentraler Express-Error-Handler.
export function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;
  const code = err.code || 'INTERNAL';
  res.status(status).json({ error: { code, message: err.message || 'Interner Fehler' } });
}
