// Routen-Code (Vertrag A.4).
// Format: 8 Zeichen aus einem eindeutigen GROSSBUCHSTABEN-Alphabet (ohne 0 O 1 I L),
// Bindestrich nach Position 4, z. B. "WC7F-K2PQ".
// Codes werden immer in CAPS gespeichert/angezeigt; die Eingabe ist case-insensitiv
// (formatRouteCode normalisiert auf Grossschreibung).
import { randomInt } from 'node:crypto';

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // ohne I, L, O sowie 0, 1
export const CODE_LENGTH = 8;

// Erzeugt einen neuen, formatierten Routen-Code (kryptographisch zufällig).
export function generateRouteCode() {
  let raw = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    raw += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return formatRouteCode(raw);
}

// Normalisiert beliebige Eingabe (Gross/Klein, mit/ohne Bindestrich, Leerzeichen)
// in die kanonische Form: nur Alphanumerik, GROSS, Bindestrich nach Position 4.
export function formatRouteCode(raw) {
  const s = String(raw)
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase();
  return s.length === CODE_LENGTH ? `${s.slice(0, 4)}-${s.slice(4)}` : s;
}

// Prüft Format/Alphabet (nicht die Existenz in der DB), case-insensitiv.
export function isValidRouteCodeFormat(code) {
  const s = String(code)
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase();
  return s.length === CODE_LENGTH && [...s].every((c) => CODE_ALPHABET.includes(c));
}

// --- Gemeinsame Code-Vergabe-Logik für Owner- (routes/routes.js) und Admin-Endpunkte
// (routes/admin.js) — Review-Fix: vorher in beiden Routern fast wörtlich dupliziert,
// wodurch ein künftiger Fix an einer Stelle vergessen werden könnte.

// Erzeugt einen Code, der noch keiner Route zugeordnet ist (Kollisionsprüfung über repo).
export function generateUniqueRouteCode(repo, generateCode) {
  for (let i = 0; i < 10; i++) {
    const code = generateCode();
    if (!repo.getRouteByCode(code)) return code;
  }
  throw new Error('Konnte keinen eindeutigen Routen-Code erzeugen.');
}

// Neuer Code, alter wird ungültig (Vertrag A.4 .../code/renew).
export function renewRouteCode(repo, routeId, generateCode) {
  const code = generateUniqueRouteCode(repo, generateCode);
  return repo.setRouteCode(routeId, code, true);
}

// Reaktiviert den bestehenden Code; erzeugt einen, falls die Route (Alt-Route) noch
// keinen hat (Vertrag A.4 .../code/activate — Bug-1-Fix: reaktiviert TATSÄCHLICH,
// anders als der ältere .../code-Endpunkt, der nur den Zustand zurückgab).
export function activateRouteCode(repo, route, generateCode) {
  if (!route.route_code) {
    const code = generateUniqueRouteCode(repo, generateCode);
    return repo.setRouteCode(route.id, code, true);
  }
  return repo.setRouteCodeActive(route.id, true);
}
