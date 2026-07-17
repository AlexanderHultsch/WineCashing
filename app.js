// Express-App-Factory. Abhängigkeiten injizierbar -> gegen :memory:-SQLite testbar.
import express from 'express';
import session from 'express-session';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAuth } from './middleware/auth.js';
import { errorHandler, apiError } from './middleware/errorEnvelope.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { createAuthRouter } from './routes/auth.js';
import { createRoutesRouter } from './routes/routes.js';
import { createProgressRouter } from './routes/progress.js';

import { hashPassword as defaultHash, verifyPassword as defaultVerify } from './lib/password.js';
import { generateRouteCode as defaultGenerateCode } from './lib/routeCode.js';
import { newId as defaultNewId } from './lib/ids.js';
import { nowIso as defaultNow } from './lib/time.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp(deps) {
  const {
    repo,
    sessionSecret = process.env.SESSION_SECRET || 'wine-caching-dev-secret',
    // Cookie-Secure NICHT an NODE_ENV koppeln: hinter einem Reverse Proxy
    // (Cloudflare Tunnel -> Caddy -> App) ist der App-Hop HTTP, secure:true würde
    // das Login-Cookie verhindern. Extern erzwingt Cloudflare ohnehin HTTPS.
    // Nur einschalten (SECURE_COOKIES=true), wenn die App selbst über HTTPS läuft.
    secureCookie = process.env.SECURE_COOKIES === 'true',
    // Anzahl vertrauenswürdiger Proxy-Hops für req.ip (Rate-Limit) / req.protocol.
    trustProxy = process.env.TRUST_PROXY,
    hashPassword = defaultHash,
    verifyPassword = defaultVerify,
    generateCode = defaultGenerateCode,
    newId = defaultNewId,
    now = defaultNow,
    enableRateLimit = true,
  } = deps;

  if (!repo) throw new Error('createApp: repo fehlt');
  if (sessionSecret === 'wine-caching-dev-secret' && process.env.NODE_ENV === 'production') {
    console.warn('WARN: SESSION_SECRET nicht gesetzt — Standardwert in Produktion ist unsicher.');
  }

  const auth = createAuth(repo);
  const app = express();
  // Zahl (Hops) oder Ausdruck (z. B. Subnetz) zulassen; Default 1.
  app.set('trust proxy', trustProxy === undefined ? 1 : Number.isNaN(Number(trustProxy)) ? trustProxy : Number(trustProxy));
  app.use(express.json());
  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: 'lax', secure: secureCookie, maxAge: 1000 * 60 * 60 * 24 * 30 },
    }),
  );

  const rateLimiter = enableRateLimit ? createRateLimiter({ windowMs: 60_000, max: 20 }) : undefined;

  app.use('/api/auth', createAuthRouter({ repo, auth, hashPassword, verifyPassword, newId, now, rateLimiter }));
  app.use('/api', createProgressRouter({ repo, auth, now }));
  app.use('/api/routes', createRoutesRouter({ repo, auth, newId, now, generateCode }));

  // Unbekannte API-Pfade -> einheitlicher 404-Umschlag.
  app.use('/api', (_req, _res, next) => next(apiError('NOT_FOUND', 'Endpunkt nicht gefunden.')));

  app.use(express.static(join(__dirname, 'public')));
  app.use(errorHandler);

  return app;
}
