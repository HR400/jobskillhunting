/**
 * TEST ONLY — tests/unit/hardening.test.js (Ticket 08)
 *
 * Verifies:
 *   - Helmet security headers are present
 *   - Oversized JSON body → 413
 *   - Rate limiter returns 429 RATE_LIMITED with Retry-After
 * Does NOT connect to Neo4j.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import request from 'supertest';
import { requestId } from '../../src/middleware/requestId.js';
import { notFoundHandler, errorHandler } from '../../src/middleware/errors.js';

/** Minimal app that mirrors the hardening stack in server.js */
function buildHardenedApp({ rateMax = 300 } = {}) {
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          connectSrc: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(requestId);
  app.use(compression());

  // Rate limiter with configurable max so tests can trigger 429 quickly.
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: rateMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests.',
          requestId: req.id ?? 'unknown',
        },
      });
    },
  });
  app.use(limiter);

  // 100 kB JSON limit
  app.use(express.json({ limit: '100kb' }));

  // Test endpoint
  app.post('/api/test', (req, res) => res.json({ ok: true }));

  app.use('/api/*splat', notFoundHandler);
  app.use(errorHandler);

  return app;
}

describe('Security headers (helmet)', () => {
  it('sets Content-Security-Policy', async () => {
    const app = buildHardenedApp();
    const res = await request(app).get('/api/test');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
  });

  it('sets X-Frame-Options', async () => {
    const app = buildHardenedApp();
    const res = await request(app).get('/api/test');
    expect(res.headers['x-frame-options']).toBeDefined();
  });
});

describe('Body size limit', () => {
  it('returns 413 for payloads > 100 kB', async () => {
    const app = buildHardenedApp();
    // 101 kB of JSON (a string field large enough)
    const bigBody = JSON.stringify({ data: 'x'.repeat(103 * 1024) });
    const res = await request(app)
      .post('/api/test')
      .set('Content-Type', 'application/json')
      .send(bigBody);
    expect(res.status).toBe(413);
  });

  it('accepts payloads under 100 kB', async () => {
    const app = buildHardenedApp();
    const smallBody = JSON.stringify({ data: 'hello' });
    const res = await request(app)
      .post('/api/test')
      .set('Content-Type', 'application/json')
      .send(smallBody);
    expect(res.status).toBe(200);
  });
});

describe('Rate limiter', () => {
  it('returns 429 RATE_LIMITED with Retry-After when limit exceeded', async () => {
    // Set max=1 so the second request is rate-limited.
    const app = buildHardenedApp({ rateMax: 1 });
    await request(app).get('/api/test'); // first request — allowed
    const res = await request(app).get('/api/test'); // second — limited
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    // RateLimit-Reset header should be present (draft-7 standard headers)
    expect(
      res.headers['ratelimit-reset'] || res.headers['retry-after'],
    ).toBeDefined();
  });
});
