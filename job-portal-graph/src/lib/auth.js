/**
 * src/lib/auth.js — password hashing and stateless session tokens (plan §9.1).
 *
 * Argon2id for passwords (never plaintext, never bcrypt), HS256 JWT in an
 * httpOnly cookie. Nothing is stored server-side, so a restart does not log
 * anyone out.
 */
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { Errors } from './errors.js';

export const COOKIE_NAME = 'auth';
export const TOKEN_TTL = '7d';
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function hashPassword(password) {
  return argon2.hash(password, { type: argon2.argon2id });
}

/** False on a wrong password *or* a malformed hash — never throws. */
export async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function signToken({ accountId, role }, ttl = TOKEN_TTL) {
  return jwt.sign({ sub: accountId, role }, config.JWT_SECRET, { expiresIn: ttl });
}

/** @throws {AppError} 401 UNAUTHENTICATED for expired or invalid tokens. */
export function verifyToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, config.JWT_SECRET);
  } catch {
    throw Errors.unauthenticated('Invalid or expired session.');
  }
  if (typeof payload.sub !== 'string' || typeof payload.role !== 'string') {
    throw Errors.unauthenticated('Invalid or expired session.');
  }
  return { accountId: payload.sub, role: payload.role };
}

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.COOKIE_SECURE,
  path: '/',
};

export function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: COOKIE_MAX_AGE_MS });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions);
}
