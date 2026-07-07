// Routen-Code (Vertrag A.4).
// Format: 8 Zeichen aus [A-HJ-NP-Za-hj-np-z2-9] (ohne 0 O 1 l I),
// Bindestrich nach Position 4, z. B. "Wc7f-K2pq".
import { randomInt } from 'node:crypto';

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
export const CODE_LENGTH = 8;

// Erzeugt einen neuen, formatierten Routen-Code (kryptographisch zufällig).
export function generateRouteCode() {
  let raw = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    raw += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return formatRouteCode(raw);
}

// Fügt/entfernt den Bindestrich nach Position 4 (Speicherung vs. Anzeige).
export function formatRouteCode(raw) {
  const s = String(raw).replace('-', '');
  return s.length === CODE_LENGTH ? `${s.slice(0, 4)}-${s.slice(4)}` : raw;
}

// Prüft Format/Alphabet (nicht die Existenz in der DB).
export function isValidRouteCodeFormat(code) {
  const s = String(code).replace('-', '');
  return s.length === CODE_LENGTH && [...s].every((c) => CODE_ALPHABET.includes(c));
}
