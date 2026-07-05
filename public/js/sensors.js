// Geräte-Orientierung (Kompass) & Wake-Lock (Seiteneffekte, Vertrag 7.3).
// Liefert OrientationSample = { rawHeading, absolute, source, timestamp } an den Controller.

// Fordert Sensor-Freigabe an (iOS: per Nutzer-Geste, DeviceOrientationEvent.requestPermission). TODO.
export function requestOrientationPermission() {
  throw new Error('requestOrientationPermission: TODO');
}

// deviceorientation(absolute)-Abo; onSample(OrientationSample). Gibt Stop-Funktion zurück. TODO.
export function watchOrientation(onSample) {
  throw new Error('watchOrientation: TODO');
}

// Bildschirm wachhalten während der Suche (Screen Wake Lock API). TODO.
export function requestWakeLock() {
  throw new Error('requestWakeLock: TODO');
}
