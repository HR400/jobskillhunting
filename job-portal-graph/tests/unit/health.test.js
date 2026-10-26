/**
 * TEST ONLY — tests/unit/health.test.js (Ticket 09)
 *
 * Covers /healthz and /readyz without a database: the tx module is mocked.
 * The real 503 path (database stopped) is checked manually against 7688.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../src/db/tx.js', () => ({ executeRead: vi.fn() }));

import { executeRead } from '../../src/db/tx.js';
import { healthRouter } from '../../src/routes/health.js';
import { requestId } from '../../src/middleware/requestId.js';
import { errorHandler } from '../../src/middleware/errors.js';

function buildApp() {
  const app = express();
  app.use(requestId);
  app.use(healthRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  vi.mocked(executeRead).mockReset();
});

describe('GET /healthz', () => {
  it('returns 200 without touching the database', async () => {
    const res = await request(buildApp()).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(executeRead).not.toHaveBeenCalled();
  });
});

describe('GET /readyz', () => {
  it('returns 200 when RETURN 1 succeeds', async () => {
    vi.mocked(executeRead).mockResolvedValueOnce([]);
    const res = await request(buildApp()).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready' });
  });

  it('returns 503 DB_UNAVAILABLE when the database is down', async () => {
    const err = new Error('Failed to connect to server.');
    err.name = 'Neo4jError';
    err.code = 'ServiceUnavailable';
    vi.mocked(executeRead).mockRejectedValueOnce(err);

    const res = await request(buildApp()).get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('DB_UNAVAILABLE');
    expect(res.body.error.requestId).toBeTruthy();
    expect(res.headers['retry-after']).toBeDefined();
  });
});
