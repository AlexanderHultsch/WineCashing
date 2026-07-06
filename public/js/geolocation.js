// GPS-Auslesen & Berechtigungen (Seiteneffekte — getrennt von der reinen Pipeline, Vertrag C).
// Liefert GpsSample = { lat, lng, accuracy, timestamp } an den Controller.

const DEFAULT_OPTIONS = { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 };

export function isSupported() {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

// Browser-GeolocationPosition -> GpsSample (Vertrag C.1). Rein/exportiert für Tests.
export function toGpsSample(position) {
  const c = position.coords;
  return { lat: c.latitude, lng: c.longitude, accuracy: c.accuracy, timestamp: position.timestamp };
}

// Fragt einmalig die Position ab -> löst die (blockierende) Berechtigungsabfrage aus (Vertrag 6.6).
// Resolve: GpsSample. Reject: GeolocationPositionError | Error.
export function requestLocationPermission(options = DEFAULT_OPTIONS) {
  return new Promise((resolve, reject) => {
    if (!isSupported()) {
      reject(new Error('geolocation_unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(toGpsSample(pos)),
      (err) => reject(err),
      options,
    );
  });
}

// Kontinuierliches Abo. onSample(GpsSample); onError(err). Gibt eine stop()-Funktion zurück.
export function watchPosition(onSample, onError, options = DEFAULT_OPTIONS) {
  if (!isSupported()) {
    onError?.(new Error('geolocation_unsupported'));
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (pos) => onSample(toGpsSample(pos)),
    (err) => onError?.(err),
    options,
  );
  return () => navigator.geolocation.clearWatch(id);
}
