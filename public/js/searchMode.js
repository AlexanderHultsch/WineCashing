// Such-Modus — State-Machine + Pipeline-Orchestrierung (Vertrag Teil B & C.4).
// nextState/classifyLoadedState/deriveActiveWaypoint sind REIN (offline testbar);
// createSearchController ist NICHT rein: hält Verlaufspuffer, treibt Polling (~7 s), ruft Sensoren.

import * as fusion from './sensorFusion.js';

// Zustände (Vertrag B.1).
export const State = {
  PERMISSION_REQUIRED: 'PERMISSION_REQUIRED',
  LOADING: 'LOADING',
  SEARCHING: 'SEARCHING',
  COMPLETED: 'COMPLETED',
  ROUTE_UNAVAILABLE: 'ROUTE_UNAVAILABLE',
};

// Ereignisse, die Übergänge auslösen (Vertrag B.2).
export const Event = {
  PERMISSION_GRANTED: 'PERMISSION_GRANTED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  STATE_LOADED: 'STATE_LOADED', // erster erfolgreicher Load (aus LOADING)
  LOAD_FAILED: 'LOAD_FAILED',
  POLL_UPDATE: 'POLL_UPDATE', // Folge-Poll
  ACTION_RESOLVED: 'ACTION_RESOLVED', // nach found/skip
  ROUTE_GONE: 'ROUTE_GONE', // 403/404
  OWNER_RESET: 'OWNER_RESET',
  RETRY: 'RETRY',
  CONNECTION_LOST: 'CONNECTION_LOST',
  CONNECTION_RESTORED: 'CONNECTION_RESTORED',
};

export const POLL_INTERVAL_MS = 7000;

// KERNFUNKTION (rein, Vertrag B.4): erster Wegpunkt mit Status "offen" nach order_index; sonst null.
// Nach JEDEM State-Update / Poll aufrufen -> zeigt nie auf gelöschten/verschobenen Wegpunkt.
export function deriveActiveWaypoint(waypoints, waypointStatus) {
  const statusOf = (id) => (waypointStatus.find((s) => s.waypoint_id === id) || {}).status || 'offen';
  const sorted = [...waypoints].sort((a, b) => a.order_index - b.order_index);
  for (const wp of sorted) {
    if (statusOf(wp.id) === 'offen') return wp;
  }
  return null; // -> COMPLETED
}

// Leitet den fachlichen Ziel-Zustand aus den Fakten eines geladenen RouteState ab (Vertrag B.2).
export function classifyLoadedState({ routeAvailable, allTerminal }) {
  if (!routeAvailable) return State.ROUTE_UNAVAILABLE;
  if (allTerminal) return State.COMPLETED;
  return State.SEARCHING;
}

// Reine Übergangsfunktion (Vertrag B.2). ctx trägt die Fakten des Loads/Polls.
export function nextState(state, event, ctx = {}) {
  switch (event) {
    // offline-Flag ist orthogonal — kein Zustandswechsel (Vertrag B.1).
    case Event.CONNECTION_LOST:
    case Event.CONNECTION_RESTORED:
      return state;

    case Event.PERMISSION_DENIED:
      return State.PERMISSION_REQUIRED;
    case Event.PERMISSION_GRANTED:
      return state === State.PERMISSION_REQUIRED ? State.LOADING : state;

    case Event.ROUTE_GONE:
      return State.ROUTE_UNAVAILABLE;

    case Event.LOAD_FAILED:
      return ctx.hasCache ? State.SEARCHING : State.ROUTE_UNAVAILABLE;

    case Event.STATE_LOADED:
    case Event.ACTION_RESOLVED:
      return classifyLoadedState(ctx);

    case Event.POLL_UPDATE: {
      const target = classifyLoadedState(ctx);
      // Wiederbelebung aus terminalem/neutralem Zustand läuft über LOADING (Vertrag B.2).
      if (state === State.COMPLETED && target !== State.COMPLETED) return State.LOADING;
      if (state === State.ROUTE_UNAVAILABLE && target !== State.ROUTE_UNAVAILABLE) return State.LOADING;
      return target;
    }

    case Event.OWNER_RESET:
    case Event.RETRY:
      return State.LOADING;

    default:
      return state;
  }
}

// Orchestrierung (Vertrag B & C.4). Abhängigkeiten werden injiziert -> mit Fakes testbar.
//   deps = { routeId, api, geolocation, sensors, render?, config?, pollIntervalMs? }
export function createSearchController(deps) {
  const {
    routeId,
    api,
    geolocation,
    sensors,
    render = () => {},
    config = fusion.CONFIG,
    pollIntervalMs = POLL_INTERVAL_MS,
  } = deps;

  let state = State.PERMISSION_REQUIRED;
  let offline = false;
  let routeState = null;
  let activeWaypoint = null;

  // Sensor-Fusion-Verlauf (Vertrag C.4).
  const gpsWindow = [];
  let prevSmoothed = null;
  let lastGps = null;
  let lastHeading = null;
  let rotation = null;
  let smoothedDistanceM = null;
  let declination = 0;
  let screenAngle = 0;

  const actionQueue = []; // aufgeschobene found/skip bei offline (Vertrag 10)
  let pollTimer = null;
  let stopGps = null;
  let stopOrient = null;
  let wakeLock = null;

  // --- View-Model & Emit ---
  function viewModel() {
    return {
      state,
      offline,
      route: routeState?.route ?? null,
      activeWaypoint,
      distanceMeters: smoothedDistanceM,
      bottles: smoothedDistanceM != null ? fusion.metersToBottles(smoothedDistanceM, config) : null,
      hintRevealed: smoothedDistanceM != null && fusion.shouldRevealHint(smoothedDistanceM, config),
      rotation,
      queuedActions: actionQueue.length,
    };
  }
  const emit = () => render(viewModel());

  // --- Zustandslogik ---
  function ctxFromRouteState(rs) {
    const waypoints = rs?.waypoints ?? [];
    const status = rs?.waypoint_status ?? [];
    const active = deriveActiveWaypoint(waypoints, status);
    return {
      routeAvailable: waypoints.length > 0,
      allTerminal: waypoints.length > 0 && active == null,
      active,
    };
  }

  function apply(event, ctx = {}) {
    state = nextState(state, event, ctx);
    if (ctx.active !== undefined) {
      const changed = (activeWaypoint?.id ?? null) !== (ctx.active?.id ?? null);
      activeWaypoint = ctx.active;
      if (changed) {
        // Ziel gewechselt (fremder Fund / Ersteller-Edit) -> Fusion für neues Ziel zurücksetzen.
        smoothedDistanceM = null;
        prevSmoothed = null;
      }
    }
    emit();
  }

  // --- Polling: einzige Zustandsquelle (Vertrag A.5, 6.9) ---
  async function poll() {
    try {
      const rs = await api.state(routeId);
      routeState = rs;
      if (offline) {
        offline = false;
        flushQueue();
      }
      apply(state === State.LOADING ? Event.STATE_LOADED : Event.POLL_UPDATE, ctxFromRouteState(rs));
      if (state === State.LOADING) await poll(); // Wiederbelebung sofort auflösen
    } catch (err) {
      if (err && (err.status === 403 || err.status === 404)) {
        apply(Event.ROUTE_GONE);
      } else {
        offline = true;
        apply(Event.LOAD_FAILED, { hasCache: routeState != null });
      }
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(poll, pollIntervalMs);
    pollTimer?.unref?.(); // hält den Node-Prozess (Tests) nicht offen; im Browser No-Op
  }
  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // --- Sensor-Pipeline (Vertrag C.4) ---
  function updateRotation(fromPos, target) {
    if (lastHeading == null) return;
    const bearing = fusion.computeBearing(fromPos.lat, fromPos.lng, target.lat, target.lng);
    const rawRotation = fusion.computeCompassRotation(bearing, lastHeading, declination);
    rotation = fusion.smoothRotation(rotation, rawRotation, config.ROTATION_SMOOTHING);
  }

  function onGpsSample(sample) {
    if (!activeWaypoint) return;
    const target = { lat: activeWaypoint.lat, lng: activeWaypoint.lng };
    const dt = lastGps ? (sample.timestamp - lastGps.timestamp) / 1000 : 0;
    const plaus = fusion.isPlausibleMovement(prevSmoothed, sample, dt, lastHeading, target, config);
    sample.plausible = plaus.plausible; // fließt in die Glättung ein (unplausible ausschließen)

    gpsWindow.push(sample);
    while (gpsWindow.length > config.SMOOTHING_WINDOW) gpsWindow.shift();
    const smoothed = fusion.smoothPosition(gpsWindow, sample, config);

    smoothedDistanceM = fusion.computeDistanceMeters(smoothed.lat, smoothed.lng, target.lat, target.lng);
    prevSmoothed = smoothed;
    lastGps = sample;
    updateRotation(smoothed, target);
    emit();
  }

  function onOrientationSample(sample) {
    lastHeading = fusion.normalizeHeading(sample, screenAngle);
    if (prevSmoothed && activeWaypoint) {
      updateRotation(prevSmoothed, { lat: activeWaypoint.lat, lng: activeWaypoint.lng });
      emit();
    }
  }

  // --- Aktionen (found/skip), offline-fähig & idempotent (Vertrag A.5, 10) ---
  async function report(kind, waypointId = activeWaypoint?.id) {
    if (!waypointId) return;
    if (offline) {
      actionQueue.push({ kind, waypointId });
      emit();
      return;
    }
    try {
      await callAction(kind, waypointId);
      await poll(); // frischer Zustand -> aktiver Wegpunkt leitet sich neu ab
    } catch (err) {
      if (err && (err.status === 403 || err.status === 404)) {
        apply(Event.ROUTE_GONE);
        return;
      }
      offline = true;
      actionQueue.push({ kind, waypointId });
      emit();
    }
  }

  function callAction(kind, waypointId) {
    return (kind === 'found' ? api.found : api.skip)(routeId, waypointId);
  }

  async function flushQueue() {
    while (actionQueue.length > 0 && !offline) {
      const { kind, waypointId } = actionQueue[0];
      try {
        await callAction(kind, waypointId); // Server ist idempotent & monoton
        actionQueue.shift();
      } catch (err) {
        if (err && (err.status === 403 || err.status === 404)) {
          actionQueue.shift();
          continue;
        }
        offline = true;
        break;
      }
    }
    emit();
  }

  // Verbindungsstatus (orthogonal). Bei Wiederverbindung: Queue leeren, dann neu pollen.
  function setOffline(value) {
    const was = offline;
    offline = value;
    emit();
    if (was && !value) return flushQueue().then(poll);
    return Promise.resolve();
  }

  // --- Lebenszyklus ---
  async function start() {
    stop(); // idempotent: alte Abos/Timer beenden, falls start() erneut aufgerufen wird
    screenAngle = sensors.getScreenAngle ? sensors.getScreenAngle() : 0;
    try {
      await geolocation.requestLocationPermission();
    } catch {
      apply(Event.PERMISSION_DENIED);
      return;
    }
    await sensors.requestOrientationPermission?.();
    wakeLock = (await sensors.requestWakeLock?.()) ?? null;
    apply(Event.PERMISSION_GRANTED);

    stopGps = geolocation.watchPosition(onGpsSample, () => setOffline(true));
    stopOrient = sensors.watchOrientation(onOrientationSample);
    await poll();
    startPolling();
  }

  function stop() {
    stopPolling();
    stopGps?.();
    stopOrient?.();
    wakeLock?.release?.();
  }

  // Owner: „Route zurücksetzen" (Vertrag 4.5) — Server-Reset erfolgt außerhalb, dann neu laden.
  function reset() {
    apply(Event.OWNER_RESET);
    return poll();
  }

  return {
    start,
    stop,
    poll,
    reset,
    reportFound: (id) => report('found', id),
    reportSkip: (id) => report('skip', id),
    onGpsSample,
    onOrientationSample,
    setOffline,
    getState: () => state,
    getViewModel: viewModel,
  };
}
