// Auth-Endpoints (Vertrag A.3). Passwörter mit bcrypt/argon2 hashen; Login/Register rate-limitiert.
import { Router } from 'express';
import { requireOwner, requireAdmin } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/register  {username, password} -> 201 {user} + Session-Cookie | 409 USERNAME_TAKEN
router.post('/register', (req, res, next) => next(new Error('TODO')));

// POST /api/auth/login  {username, password} -> 200 {user} + Session-Cookie | 401 INVALID_CREDENTIALS
router.post('/login', (req, res, next) => next(new Error('TODO')));

// POST /api/auth/logout -> 204
router.post('/logout', (req, res, next) => next(new Error('TODO')));

// GET /api/auth/me -> 200 {user} | 401
router.get('/me', requireOwner, (req, res, next) => next(new Error('TODO')));

// POST /api/auth/admin/reset-password {username, new_password} -> 200 | 403 NOT_ADMIN | 404 USER_NOT_FOUND
router.post('/admin/reset-password', requireAdmin, (req, res, next) => next(new Error('TODO')));

export default router;
