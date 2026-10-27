/**
 * TEST ONLY — tests/integration/semanticSearch.test.js (Ticket 55)
 *
 * The vector index exists, semantic search reports the real reason it cannot
 * run, and the backfill is operator-only. No test stubs the provider: running
 * embeddings would be a real network call, so only the gating is exercised.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, closeTestDriver } from '../helpers/db.js';
import { config } from '../../src/config.js';

describe('semantic search (Ticket 55)', () => {
  let driver;
  let request;
  const original = {
    provider: config.EMBEDDINGS_PROVIDER,
    key: config.EMBEDDINGS_API_KEY,
    token: config.INGEST_ADMIN_TOKEN,
  };

  beforeAll(async () => {
    driver = await getTestDriver();
    request = await getTestApp();
    config.EMBEDDINGS_PROVIDER = '';
    config.EMBEDDINGS_API_KEY = '';
  });

  afterAll(async () => {
    config.EMBEDDINGS_PROVIDER = original.provider;
    config.EMBEDDINGS_API_KEY = original.key;
    config.INGEST_ADMIN_TOKEN = original.token;
    await closeTestDriver();
  });

  it('creates the vector index during migration', async () => {
    const session = driver.session({ database: 'neo4j' });
    try {
      const res = await session.run(
        "SHOW INDEXES YIELD name, type WHERE name = 'job_embedding' RETURN type",
      );
      expect(res.records[0]?.get('type')).toBe('VECTOR');
    } finally {
      await session.close();
    }
  });

  it('reports unavailable with the configuration reason', async () => {
    const res = await request.get('/api/search/semantic?q=graph');
    expect(res.status).toBe(200);
    expect(res.body.jobs).toEqual([]);
    expect(res.body.unavailable).toMatch(/EMBEDDINGS_PROVIDER/);

    config.EMBEDDINGS_PROVIDER = 'cohere';
    config.EMBEDDINGS_API_KEY = 'key';
    const unsupported = await request.get('/api/search/semantic?q=graph');
    expect(unsupported.body.unavailable).toMatch(/only openai/);
    expect((await request.get('/api/meta/capabilities')).body.capabilities.vector).toBe(false);
  });

  it('validates the query', async () => {
    expect((await request.get('/api/search/semantic')).status).toBe(400);
    expect((await request.get('/api/search/semantic?q=x')).status).toBe(400);
  });

  it('backfills only for the operator token', async () => {
    config.EMBEDDINGS_PROVIDER = 'cohere';
    config.EMBEDDINGS_API_KEY = 'key';
    config.INGEST_ADMIN_TOKEN = '';
    expect((await request.post('/api/search/semantic/index')).status).toBe(503);

    config.INGEST_ADMIN_TOKEN = 'semantic-token';
    expect(
      (await request.post('/api/search/semantic/index').set('x-ingest-token', 'wrong')).status,
    ).toBe(403);

    const configured = await request
      .post('/api/search/semantic/index')
      .set('x-ingest-token', 'semantic-token');
    expect(configured.status).toBe(503);
    expect(configured.body.error.message).toMatch(/only openai/);
  });
});
