// Routen-, Wegpunkt- & Code-Verwaltung (Vertrag A.4). Nur Owner der eigenen Route.
import { Router } from 'express';
import { apiError } from '../middleware/errorEnvelope.js';
import { ROUTE_STATUS, WAYPOINT_STATUS, toRouteSummary, toRoute, toWaypoint, toProgress } from '../lib/domain.js';

function asNumber(value, field, min, max) {
  if (typeof value !== 'number' || Number.isNaN(value) || value < min || value > max) {
    throw apiError('VALIDATION', `Feld "${field}" muss eine Zahl in [${min}, ${max}] sein.`);
  }
  return value;
}

function asNonEmptyString(value, field, max = 500) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    throw apiError('VALIDATION', `Feld "${field}" ist ungültig.`);
  }
  return value;
}

// Optionales Textfeld: String oder null (undefined nur, wo der Aufrufer es vorher ausschließt).
function asOptionalString(value, field, max = 120) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > max) {
    throw apiError('VALIDATION', `Feld "${field}" muss ein String sein.`);
  }
  return value;
}

function generateUniqueCode(repo, generateCode) {
  for (let i = 0; i < 10; i++) {
    const code = generateCode();
    if (!repo.getRouteByCode(code)) return code;
  }
  throw new Error('Konnte keinen eindeutigen Routen-Code erzeugen.');
}

// Wegpunkt laden und Zugehörigkeit zur Route prüfen.
function loadWaypoint(repo, route, wpId) {
  const wp = repo.getWaypoint(wpId);
  if (!wp || wp.route_id !== route.id) throw apiError('NOT_FOUND', 'Wegpunkt nicht gefunden.');
  return wp;
}

export function createRoutesRouter({ repo, auth, newId, now, generateCode }) {
  const router = Router();
  const owner = auth.requireRouteOwner;

  // --- Routen ---
  router.get('/', auth.requireOwner, (req, res) => {
    res.json(repo.listRoutesByOwner(req.user.id).map(toRouteSummary));
  });

  router.post('/', auth.requireOwner, (req, res) => {
    const name = asNonEmptyString(req.body?.name, 'name', 120);
    // Code direkt bei Anlage erzeugen (aktiv): Teilen ist ohnehin ein manueller Schritt
    // des Owners, und "Code erzeugen" als Extra-Klick bringt keinen Sicherheitsgewinn —
    // wer noch nicht teilen will, nutzt einfach "Deaktivieren".
    const code = generateUniqueCode(repo, generateCode);
    const route = repo.createRoute({
      id: newId(),
      owner_user_id: req.user.id,
      name,
      status: ROUTE_STATUS.ERSTELLUNG,
      route_code: code,
      route_code_active: true,
      created_at: now(),
    });
    res.status(201).json(toRoute(route, []));
  });

  router.get('/:routeId', owner, (req, res) => {
    res.json(toRoute(req.route, repo.listWaypoints(req.route.id)));
  });

  router.patch('/:routeId', owner, (req, res) => {
    const name = asNonEmptyString(req.body?.name, 'name', 120);
    const route = repo.updateRouteName(req.route.id, name);
    res.json(toRoute(route, repo.listWaypoints(route.id)));
  });

  router.delete('/:routeId', owner, (req, res) => {
    repo.deleteRoute(req.route.id);
    res.status(204).end();
  });

  router.post('/:routeId/start', owner, (req, res) => {
    if (repo.listWaypoints(req.route.id).length === 0) {
      throw apiError('NO_WAYPOINTS', 'Route hat keine Wegpunkte.');
    }
    const route = repo.setRouteStatus(req.route.id, ROUTE_STATUS.SUCH_MODUS);
    const progress = repo.upsertProgress(route.id, { started_at: now(), completed_at: null });
    res.json({ route: toRoute(route, repo.listWaypoints(route.id)), progress: toProgress(route.id, progress) });
  });

  // Zurücksetzen darf auch ein Mitsucher mit gültigem Routen-Code auslösen (nicht nur
  // der Owner): kontolose Mitsucher haben sonst keine Möglichkeit, ein versehentliches
  // "alles übersprungen" rückgängig zu machen. Wirkt global für die ganze Route (kein
  // Konzept von "nur mein Fortschritt") — der Client zeigt vorher eine Warnung an.
  router.post('/:routeId/reset', auth.requireRouteAccess, (req, res) => {
    repo.resetStatuses(req.route.id, WAYPOINT_STATUS.OFFEN, now());
    const progress = repo.upsertProgress(req.route.id, { started_at: now(), completed_at: null });
    res.json({ progress: toProgress(req.route.id, progress) });
  });

  // --- Wegpunkte (auch während laufender Suche; aktiver Wegpunkt leitet sich neu ab) ---
  router.post('/:routeId/waypoints', owner, (req, res) => {
    const { lat, lng, hint_text, name, order_index } = req.body ?? {};
    asNumber(lat, 'lat', -90, 90);
    asNumber(lng, 'lng', -180, 180);
    asNonEmptyString(hint_text, 'hint_text');
    const orderIndex = order_index === undefined ? repo.maxOrderIndex(req.route.id) + 1 : asNumber(order_index, 'order_index', 0, 1e6);
    const wp = repo.createWaypoint({
      id: newId(),
      route_id: req.route.id,
      order_index: orderIndex,
      lat,
      lng,
      hint_text,
      name: asOptionalString(name, 'name'),
      updated_at: now(),
    });
    res.status(201).json(toWaypoint(wp));
  });

  router.patch('/:routeId/waypoints/:wpId', owner, (req, res) => {
    loadWaypoint(repo, req.route, req.params.wpId);
    const patch = {};
    if (req.body?.lat !== undefined) patch.lat = asNumber(req.body.lat, 'lat', -90, 90);
    if (req.body?.lng !== undefined) patch.lng = asNumber(req.body.lng, 'lng', -180, 180);
    if (req.body?.hint_text !== undefined) patch.hint_text = asNonEmptyString(req.body.hint_text, 'hint_text');
    if (req.body?.order_index !== undefined) patch.order_index = asNumber(req.body.order_index, 'order_index', 0, 1e6);
    if (req.body?.name !== undefined) patch.name = asOptionalString(req.body.name, 'name');
    res.json(toWaypoint(repo.updateWaypoint(req.params.wpId, patch)));
  });

  router.delete('/:routeId/waypoints/:wpId', owner, (req, res) => {
    loadWaypoint(repo, req.route, req.params.wpId);
    repo.deleteWaypoint(req.params.wpId);
    res.status(204).end();
  });

  router.put('/:routeId/waypoints/order', owner, (req, res) => {
    const orderedIds = req.body?.ordered_ids;
    if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== 'string')) {
      throw apiError('VALIDATION', 'ordered_ids muss ein Array von IDs sein.');
    }
    const current = repo.listWaypoints(req.route.id).map((w) => w.id);
    const sameSet = orderedIds.length === current.length && new Set(orderedIds).size === current.length && current.every((id) => orderedIds.includes(id));
    if (!sameSet) throw apiError('VALIDATION', 'ordered_ids muss genau die Wegpunkte der Route enthalten.');
    res.json(repo.reorderWaypoints(req.route.id, orderedIds).map(toWaypoint));
  });

  // --- Routen-Code (Vertrag A.4) ---
  router.post('/:routeId/code', owner, (req, res) => {
    if (req.route.route_code) {
      res.json({ route_code: req.route.route_code, active: !!req.route.route_code_active });
      return;
    }
    const code = generateUniqueCode(repo, generateCode);
    const route = repo.setRouteCode(req.route.id, code, true);
    res.json({ route_code: route.route_code, active: true });
  });

  router.post('/:routeId/code/renew', owner, (req, res) => {
    const code = generateUniqueCode(repo, generateCode);
    const route = repo.setRouteCode(req.route.id, code, true);
    res.json({ route_code: route.route_code, active: true });
  });

  router.post('/:routeId/code/deactivate', owner, (req, res) => {
    repo.setRouteCodeActive(req.route.id, false);
    res.json({ active: false });
  });

  return router;
}
