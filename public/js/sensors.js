// Geräte-Orientierung (Kompass) & Wake-Lock (Seiteneffekte, Vertrag 7.3).
// Liefert OrientationSample = { rawHeading, absolute, source, timestamp } an den Controller.

// Manche Browser feuern einmalig ein "Stub"-Event mit alpha=null, nur um zu signalisieren,
// dass die API grundsätzlich existiert — ohne dass je ein echter Sensor liefert (beobachtet
// u. a. bei "deviceorientationabsolute" in Chromium ohne Bewegungssensor). Ein solches Sample
// darf NICHT verarbeitet werden: es würde den Kompass auf einen Fantasiewert (alpha ?? 0)
// einfrieren und nie wieder aktualisieren — genau das Symptom "Flasche dreht sich nicht mehr".
export function hasUsableHeading(event) {
  return typeof event.webkitCompassHeading === 'number' || typeof event.alpha === 'number';
}

// Browser-DeviceOrientationEvent -> OrientationSample (Vertrag C.1). Rein/exportiert für Tests.
//   iOS:      webkitCompassHeading vorhanden -> source "ios"      (gegen Nord, im Uhrzeigersinn)
//   Android:  event.absolute === true        -> source "absolute" (alpha)
//   sonst:                                       source "relative" (alpha, unzuverlässig)
export function toOrientationSample(event, now = Date.now) {
  let source;
  let rawHeading;
  let absolute;
  if (typeof event.webkitCompassHeading === 'number') {
    source = 'ios';
    rawHeading = event.webkitCompassHeading;
    absolute = true;
  } else if (event.absolute === true) {
    source = 'absolute';
    rawHeading = event.alpha ?? 0;
    absolute = true;
  } else {
    source = 'relative';
    rawHeading = event.alpha ?? 0;
    absolute = false;
  }
  return { rawHeading, absolute, source, timestamp: now() };
}

// Aktuelle Bildschirm-Ausrichtung in Grad (0/90/180/270) für die Heading-Korrektur.
export function getScreenAngle() {
  if (typeof screen !== 'undefined' && screen.orientation && typeof screen.orientation.angle === 'number') {
    return screen.orientation.angle;
  }
  if (typeof window !== 'undefined' && typeof window.orientation === 'number') {
    return window.orientation;
  }
  return 0;
}

// Sensor-Freigabe. iOS 13+ verlangt requestPermission() aus einer Nutzer-Geste (Vertrag 7.3, 6.6).
// Resolve: true (freigegeben) | false.
export async function requestOrientationPermission() {
  const DOE = typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : null;
  if (DOE && typeof DOE.requestPermission === 'function') {
    try {
      return (await DOE.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }
  return true; // kein Gate nötig
}

// deviceorientation(absolute)-Abo. onSample(OrientationSample). Gibt eine stop()-Funktion zurück.
//
// Bewusst BEIDE Events abonniert, nicht nur eines per Feature-Detection: `'ondeviceorientationabsolute'
// in window` sagt nur, dass der Browser den Event-NAMEN kennt — nicht, dass das Gerät ihn tatsächlich
// feuert. Auf etlichen Android-Geräten/Browser-Versionen bleibt "deviceorientationabsolute" trotz
// erkannter Unterstützung schlicht stumm, während "deviceorientation" normal feuert (das war die
// Ursache dafür, dass sich der Flaschen-Kompass gar nicht gedreht hat). Sobald einmal ein absolutes
// Sample ankam, hat es Vorrang (genauer); kommt nie eines, bleibt das relative die einzige Quelle.
export function watchOrientation(onSample) {
  if (typeof window === 'undefined') return () => {};
  let sawAbsolute = false;

  const absoluteHandler = (event) => {
    if (!hasUsableHeading(event)) return; // Stub-Event ohne echten Sensor -> ignorieren
    sawAbsolute = true;
    onSample(toOrientationSample(event));
  };
  const relativeHandler = (event) => {
    if (sawAbsolute) return; // absolute Quelle ist genauer und hat echte Daten geliefert
    if (!hasUsableHeading(event)) return;
    onSample(toOrientationSample(event));
  };

  window.addEventListener('deviceorientationabsolute', absoluteHandler, true);
  window.addEventListener('deviceorientation', relativeHandler, true);
  return () => {
    window.removeEventListener('deviceorientationabsolute', absoluteHandler, true);
    window.removeEventListener('deviceorientation', relativeHandler, true);
  };
}

// Bildschirm während der Suche wachhalten (Screen Wake Lock API). Gibt { supported, release } zurück.
// Der Browser gibt den Wake-Lock automatisch frei, sobald der Tab in den Hintergrund geht
// (App-Wechsel, Bildschirm kurz aus) — deshalb wird er hier bei Rückkehr (visibilitychange ->
// visible) automatisch neu angefordert, bis release() aufgerufen wird. Ohne das dimmt der
// Bildschirm nach dem ersten App-Wechsel mitten in der Suche dauerhaft wieder ab.
export async function requestWakeLock() {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
    return { supported: false, release: () => {} };
  }

  let sentinel = null;
  let released = false;
  const acquire = async () => {
    try {
      sentinel = await navigator.wakeLock.request('screen');
    } catch {
      sentinel = null; // z. B. Energiesparmodus — Suche funktioniert trotzdem
    }
  };
  const onVisible = () => {
    if (!released && document.visibilityState === 'visible') acquire();
  };

  await acquire();
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);

  return {
    supported: sentinel != null,
    release: () => {
      released = true;
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      sentinel?.release?.();
    },
  };
}
