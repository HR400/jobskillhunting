/**
 * TEST ONLY — tests/unit/apiNotFound.test.js (Ticket 07)
 *
 * Verifies that an unknown /api/* route returns the error contract with a
 * requestId, without needing Neo4j.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requestId } from '../../src/middleware/requestId.js';
import { notFoundHandler, errorHandler } from '../../src/middleware/errors.js';

function buildApp() {
  const app = express();
  app.use(requestId);
  // No real routes — every /api/* will fall through to notFoundHandler
  app.use('/api/*splat', notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe('JSON 404 for /api/* routes', () => {
  it('returns 404 with error contract and a requestId', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(typeof res.body.error.requestId).toBe('string');
    expect(res.body.error.requestId).toHaveLength(36); // UUID format
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('requestId in body matches X-Request-Id header', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/any/deep/path');
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });
});
