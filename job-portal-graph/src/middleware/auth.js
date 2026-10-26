/**
 * src/middleware/auth.js — request authentication and role gating (plan §9.1).
 *
 * `authenticate` reads the httpOnly cookie and puts `{ accountId, role }` on
 * `req.auth`. `requireRole` rejects the wrong role with 403 FORBIDDEN.
 */
import { COOKIE_NAME, verifyToken } from '../lib/auth.js';
import { Errors } from '../lib/errors.js';

export function authenticate(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next(Errors.unauthenticated());
  try {
    req.auth = verifyToken(token);
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth) return next(Errors.unauthenticated());
    if (!roles.includes(req.auth.role)) return next(Errors.forbidden());
    next();
  };
}
