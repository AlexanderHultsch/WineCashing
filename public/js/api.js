// Client-API-Wrapper. Sendet Owner-Cookie automatisch (credentials) und X-Route-Code, wenn gesetzt.
// Fehler werfen ein Error mit { status, code, message } aus dem Fehler-Umschlag (Vertrag A.2).

const API_BASE = '/api';
const CODE_KEY = 'wc_route_code';
let routeCode = null;

export function setRouteCode(code) {
  routeCode = code;
  try {
    localStorage.setItem(CODE_KEY, code);
  } catch {
    /* localStorage evtl. blockiert */
  }
}

export function getRouteCode() {
  if (routeCode) return routeCode;
  try {
    routeCode = localStorage.getItem(CODE_KEY);
  } catch {
    routeCode = null;
  }
  return routeCode;
}

export function clearRouteCode() {
  routeCode = null;
  try {
    localStorage.removeItem(CODE_KEY);
  } catch {
    /* ignore */
  }
}

export async function apiFetch(path, { method = 'GET', body, headers = {} } = {}) {
  const opts = { method, headers: { ...headers }, credentials: 'same-origin' };
  if (body !== undefined) {
    opts.headers['content-type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const code = getRouteCode();
  if (code) opts.headers['X-Route-Code'] = code;

  const res = await fetch(API_BASE + path, opts);
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const err = new Error(data?.error?.message || res.statusText || 'Fehler');
    err.status = res.status;
    err.code = data?.error?.code || `HTTP_${res.status}`;
    throw err;
  }
  return data;
}

export const api = {
  // Auth (Vertrag A.3)
  register: (username, password) => apiFetch('/auth/register', { method: 'POST', body: { username, password } }),
  login: (username, password) => apiFetch('/auth/login', { method: 'POST', body: { username, password } }),
  logout: () => apiFetch('/auth/logout', { method: 'POST' }),
  me: () => apiFetch('/auth/me'),

  // Routen & Wegpunkte (Vertrag A.4)
  listRoutes: () => apiFetch('/routes'),
  createRoute: (name) => apiFetch('/routes', { method: 'POST', body: { name } }),
  getRoute: (id) => apiFetch(`/routes/${id}`),
  updateRoute: (id, name) => apiFetch(`/routes/${id}`, { method: 'PATCH', body: { name } }),
  deleteRoute: (id) => apiFetch(`/routes/${id}`, { method: 'DELETE' }),
  startRoute: (id) => apiFetch(`/routes/${id}/start`, { method: 'POST' }),
  resetRoute: (id) => apiFetch(`/routes/${id}/reset`, { method: 'POST' }),
  addWaypoint: (id, wp) => apiFetch(`/routes/${id}/waypoints`, { method: 'POST', body: wp }),
  updateWaypoint: (id, wpId, patch) => apiFetch(`/routes/${id}/waypoints/${wpId}`, { method: 'PATCH', body: patch }),
  deleteWaypoint: (id, wpId) => apiFetch(`/routes/${id}/waypoints/${wpId}`, { method: 'DELETE' }),
  reorderWaypoints: (id, orderedIds) =>
    apiFetch(`/routes/${id}/waypoints/order`, { method: 'PUT', body: { ordered_ids: orderedIds } }),
  createCode: (id) => apiFetch(`/routes/${id}/code`, { method: 'POST' }),
  renewCode: (id) => apiFetch(`/routes/${id}/code/renew`, { method: 'POST' }),
  deactivateCode: (id) => apiFetch(`/routes/${id}/code/deactivate`, { method: 'POST' }),

  // Beitritt & Zustand (Vertrag A.5)
  join: (code) => apiFetch('/join', { method: 'POST', body: { route_code: code } }),
  state: (id) => apiFetch(`/routes/${id}/state`),
  found: (id, wpId) => apiFetch(`/routes/${id}/waypoints/${wpId}/found`, { method: 'POST', body: { client_ts: Date.now() } }),
  skip: (id, wpId) => apiFetch(`/routes/${id}/waypoints/${wpId}/skip`, { method: 'POST', body: { client_ts: Date.now() } }),
};
