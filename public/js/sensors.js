// Geräte-Orientierung (Kompass) & Wake-Lock (Seiteneffekte, Vertrag 7.3).
// Liefert OrientationSample = { rawHeading, absolute, source, timestamp } an den Controller.

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
export function watchOrientation(onSample) {
  if (typeof window === 'undefined') return () => {};
  const eventName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  const handler = (event) => onSample(toOrientationSample(event));
  window.addEventListener(eventName, handler, true);
  return () => window.removeEventListener(eventName, handler, true);
}

// Bildschirm während der Suche wachhalten (Screen Wake Lock API). Gibt { supported, release } zurück.
export async function requestWakeLock() {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
    return { supported: false, release: () => {} };
  }
  try {
    const sentinel = await navigator.wakeLock.request('screen');
    return { supported: true, sentinel, release: () => sentinel.release?.() };
  } catch (err) {
    return { supported: false, release: () => {}, error: err };
  }
}
