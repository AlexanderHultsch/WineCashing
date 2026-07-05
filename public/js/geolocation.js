// GPS-Auslesen & Berechtigungen (Seiteneffekte — getrennt von der reinen Pipeline, Vertrag C).
// Liefert GpsSample = { lat, lng, accuracy, timestamp } an den Controller.

// Fragt Standort-Berechtigung an (blockierend, Vertrag 6.6). TODO.
export function requestLocationPermission() {
  throw new Error('requestLocationPermission: TODO');
}

// watchPosition-Abo; onSample(GpsSample). Gibt eine Stop-Funktion zurück. TODO.
export function watchPosition(onSample, onError) {
  throw new Error('watchPosition: TODO');
}
