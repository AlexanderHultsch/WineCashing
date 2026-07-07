// Einfacher In-Memory-Rate-Limiter (Fixed Window) für Login/Register (Vertrag A.3).
// Ohne externe Abhängigkeit; ausreichend für den privaten Freundeskreis.
import { apiError } from './errorEnvelope.js';

export function createRateLimiter({ windowMs = 60_000, max = 10 } = {}) {
  const hits = new Map(); // key -> { count, reset }

  return function rateLimit(req, res, next) {
    const key = `${req.ip}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    // Gelegentlich abgelaufene Fenster entsorgen, damit die Map nicht unbegrenzt wächst.
    if (hits.size > 500) {
      for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
    }
    const rec = hits.get(key);
    if (!rec || now > rec.reset) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return next();
    }
    rec.count += 1;
    if (rec.count > max) {
      return next(apiError('RATE_LIMITED', 'Zu viele Versuche. Bitte später erneut.'));
    }
    return next();
  };
}
