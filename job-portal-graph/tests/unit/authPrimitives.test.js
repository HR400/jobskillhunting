/**
 * TEST ONLY — tests/unit/authPrimitives.test.js (Ticket 10)
 *
 * Password hashing, JWT cookie verification, and role gating, without a
 * database. Cookie flags are asserted from the Set-Cookie header.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { hashPassword, verifyPassword, signToken, setAuthCookie, COOKIE_NAME } from '../../src/lib/auth.js';
import { authenticate, requireRole } from '../../src/middleware/auth.js';
import { requestId } from '../../src/middleware/requestId.js';
import { errorHandler } from '../../src/middleware/errors.js';

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(requestId);
  app.get('/private', authenticate, (req, res) => res.json(req.auth));
  app.get('/employer', authenticate, requireRole('employer'), (req, res) => res.json({ ok: true }));
  app.get('/cookie', (req, res) => {
    setAuthCookie(res, signToken({ accountId: 'acc-1', role: 'candidate' }));
    res.json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

const candidateToken = () => signToken({ accountId: 'acc-1', role: 'candidate' });

describe('passwords', () => {
  it('round-trips a password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true);
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });

  it('returns false for a malformed stored hash', async () => {
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
  });
});

describe('authenticate', () => {
  it('401 UNAUTHENTICATED without a cookie', async () => {
    const res = await request(buildApp()).get('/private');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('401 UNAUTHENTICATED for a bad token', async () => {
    const res = await request(buildApp()).get('/private').set('Cookie', `${COOKIE_NAME}=garbage`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('401 UNAUTHENTICATED for an expired token', async () => {
    const expired = signToken({ accountId: 'acc-1', role: 'candidate' }, '-1s');
    const res = await request(buildApp()).get('/private').set('Cookie', `${COOKIE_NAME}=${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('attaches the account id and role for a valid token', async () => {
    const res = await request(buildApp())
      .get('/private')
      .set('Cookie', `${COOKIE_NAME}=${candidateToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accountId: 'acc-1', role: 'candidate' });
  });
});

describe('requireRole', () => {
  it('403 FORBIDDEN for the wrong role', async () => {
    const res = await request(buildApp())
      .get('/employer')
      .set('Cookie', `${COOKIE_NAME}=${candidateToken()}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('allows the right role', async () => {
    const token = signToken({ accountId: 'acc-2', role: 'employer' });
    const res = await request(buildApp()).get('/employer').set('Cookie', `${COOKIE_NAME}=${token}`);
    expect(res.status).toBe(200);
  });
});

describe('session cookie', () => {
  it('is httpOnly, SameSite=Lax, and not Secure outside production', async () => {
    const res = await request(buildApp()).get('/cookie');
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Secure');
    expect(cookie).toContain('Path=/');
  });
});
