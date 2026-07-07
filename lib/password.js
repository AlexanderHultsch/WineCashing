// Passwort-Hashing (Vertrag A.3). Node-eingebautes scrypt (memory-hard KDF) —
// keine native Abhängigkeit (bcrypt/argon2), voll offline testbar.
// Speicherformat: scrypt$N$r$p$saltHex$hashHex
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const N = 16384; // CPU/Memory-Kostenparameter (2^14)
const R = 8;
const P = 1;
const KEYLEN = 64;

export function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, n, r, p, saltHex, hashHex] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const expected = Buffer.from(hashHex, 'hex');
    const derived = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
