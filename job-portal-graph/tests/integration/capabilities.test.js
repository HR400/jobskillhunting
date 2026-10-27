/**
 * TEST ONLY — tests/integration/capabilities.test.js (Ticket 50)
 *
 * Every capability is derived from the running system, and a missing GDS
 * plugin or embedding provider is reported as `false` — never assumed.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, closeTestDriver } from '../helpers/db.js';
import { config } from '../../src/config.js';

describe('GET /api/meta/capabilities (Ticket 50)', () => {
  let request;

  beforeAll(async () => {
    await getTestDriver();
    request = await getTestApp();
  });

  afterAll(async () => {
    await closeTestDriver();
  });

  it('reports every flag and a consistent GDS answer', async () => {
    const res = await request.get('/api/meta/capabilities');
    expect(res.status).toBe(200);
    const caps = res.body.capabilities;
    expect(caps).toMatchObject({
      esco: expect.any(Boolean),
      feeds: expect.any(Boolean),
      gds: expect.any(Boolean),
      vector: expect.any(Boolean),
    });
    expect(caps.feeds).toBe(caps.adapters.length > 0);
    expect(caps.gds ? typeof caps.gds_version === 'string' : caps.gds_version === null).toBe(true);
    for (const adapter of caps.adapters) {
      expect(Object.keys(adapter).sort()).toEqual(['name', 'source']);
    }
  });

  it('tracks ENABLE_ESCO', async () => {
    const original = config.ENABLE_ESCO;
    try {
      config.ENABLE_ESCO = false;
      expect((await request.get('/api/meta/capabilities')).body.capabilities.esco).toBe(false);
      config.ENABLE_ESCO = true;
      expect((await request.get('/api/meta/capabilities')).body.capabilities.esco).toBe(true);
    } finally {
      config.ENABLE_ESCO = original;
    }
  });

  it('reports vector only when both provider and key are set', async () => {
    const original = [config.EMBEDDINGS_PROVIDER, config.EMBEDDINGS_API_KEY];
    try {
      config.EMBEDDINGS_PROVIDER = '';
      config.EMBEDDINGS_API_KEY = '';
      expect((await request.get('/api/meta/capabilities')).body.capabilities.vector).toBe(false);

      config.EMBEDDINGS_PROVIDER = 'openai';
      config.EMBEDDINGS_API_KEY = 'test-key';
      expect((await request.get('/api/meta/capabilities')).body.capabilities.vector).toBe(true);
    } finally {
      [config.EMBEDDINGS_PROVIDER, config.EMBEDDINGS_API_KEY] = original;
    }
  });
});
