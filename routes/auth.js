// Auth-Endpoints (Vertrag A.3). Factory: Abhängigkeiten werden injiziert (testbar).
import { Router } from 'express';
import { apiError } from '../middleware/errorEnvelope.js';
import { publicUser } from '../lib/domain.js';

function requireString(value, field, { min = 1, max = 200 } = {}) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) {
    throw apiError('VALIDATION', `Feld "${field}" ist ungültig.`);
  }
  return value.trim();
}

// Passwörter werden NICHT getrimmt — Leerzeichen sind Teil des Geheimnisses.
function requirePassword(value, { min = 6, max = 200 } = {}) {
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    throw apiError('VALIDATION', 'Feld "password" ist ungültig (min. 6 Zeichen).');
  }
  return value;
}

export function createAuthRouter({ repo, auth, hashPassword, verifyPassword, newId, now, rateLimiter }) {
  const router = Router();
  const limit = rateLimiter ?? ((_req, _res, next) => next());

  // POST /register {username, password} -> 201 {user} + Session-Cookie | 409 USERNAME_TAKEN
  router.post('/register', limit, (req, res) => {
    const username = requireString(req.body?.username, 'username', { min: 3, max: 32 });
    const password = requirePassword(req.body?.password);
    if (repo.getUserByUsername(username)) throw apiError('USERNAME_TAKEN', 'Benutzername bereits vergeben.');

    const user = repo.createUser({
      id: newId(),
      username,
      password_hash: hashPassword(password),
      is_admin: false,
      created_at: now(),
    });
    req.session.userId = user.id;
    res.status(201).json({ user: publicUser(user) });
  });

  // POST /login {username, password} -> 200 {user} + Session-Cookie | 401 INVALID_CREDENTIALS
  router.post('/login', limit, (req, res) => {
    const username = requireString(req.body?.username, 'username');
    const password = requirePassword(req.body?.password, { min: 1 });
    const user = repo.getUserByUsername(username);
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw apiError('INVALID_CREDENTIALS', 'Benutzername oder Passwort falsch.');
    }
    req.session.userId = user.id;
    res.json({ user: publicUser(user) });
  });

  // POST /logout -> 204
  router.post('/logout', (req, res) => {
    req.session?.destroy(() => res.status(204).end());
  });

  // GET /me -> 200 {user} | 401
  router.get('/me', auth.requireOwner, (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  // POST /admin/reset-password {username, new_password} -> 200 | 403 NOT_ADMIN | 404 USER_NOT_FOUND
  router.post('/admin/reset-password', auth.requireAdmin, (req, res) => {
    const username = requireString(req.body?.username, 'username');
    const newPassword = requirePassword(req.body?.new_password);
    const target = repo.getUserByUsername(username);
    if (!target) throw apiError('USER_NOT_FOUND', 'Nutzer nicht gefunden.');
    repo.setUserPassword(target.id, hashPassword(newPassword));
    res.json({ ok: true });
  });

  return router;
}
