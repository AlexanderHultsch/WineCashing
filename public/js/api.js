// Client-API-Wrapper. Sendet Owner-Cookie automatisch (credentials) und X-Route-Code, wenn gesetzt.
// Fehler-Umschlag der Antwort: { error: { code, message } } (Vertrag A.2).

const API_BASE = '/api';
let routeCode = null; // lokal gespeicherter Routen-Code des Mitsuchers (Vertrag A.5).

export function setRouteCode(code) { routeCode = code; }
export function getRouteCode() { return routeCode; }

// Zentraler fetch-Wrapper. Wirft { code, message, status } bei Fehler. TODO: Umsetzung.
export async function apiFetch(path, options = {}) {
  throw new Error('apiFetch: TODO');
}

// Bequemlichkeits-Aufrufe (Vertrag A.3–A.5) — TODO.
export const api = {
  // Auth
  register: (username, password) => apiFetch('/auth/register', { method: 'POST', body: { username, password } }),
  login:    (username, password) => apiFetch('/auth/login', { method: 'POST', body: { username, password } }),
  me:       () => apiFetch('/auth/me'),
  // Beitritt & Zustand
  join:     (code) => apiFetch('/join', { method: 'POST', body: { route_code: code } }),
  state:    (routeId) => apiFetch(`/routes/${routeId}/state`),
  found:    (routeId, wpId) => apiFetch(`/routes/${routeId}/waypoints/${wpId}/found`, { method: 'POST' }),
  skip:     (routeId, wpId) => apiFetch(`/routes/${routeId}/waypoints/${wpId}/skip`, { method: 'POST' }),
};
