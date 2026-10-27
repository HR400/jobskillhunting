/**
 * TEST ONLY — tests/integration/ingestCore.test.js (Ticket 47)
 *
 * The feed adapter is registered here so the runner is exercised end to end
 * without network access. Data lives only in the throwaway test database.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, closeTestDriver, wipeTestDb } from '../helpers/db.js';
import { registerAdapter } from '../../src/ingest/registry.js';
import { config } from '../../src/config.js';

const TOKEN = 'test-ingest-token';
const SOURCE = 'Test Feed';
const REF = 'testfeed-1';

describe('POST /api/ingest/:adapter/run (Ticket 47)', () => {
  let driver;
  let request;
  let originalToken;

  beforeAll(async () => {
    driver = await getTestDriver();
    request = await getTestApp();
    originalToken = config.INGEST_ADMIN_TOKEN;
    config.INGEST_ADMIN_TOKEN = TOKEN;

    registerAdapter({
      name: 'testfeed',
      source: SOURCE,
      sourceUrl: 'https://example.test/jobs',
      isConfigured: () => true,
      fetchJobs: async () => [
        {
          external_ref: REF,
          job_title: 'Ingested Test Role',
          descriptive: 'Imported by the adapter.',
        },
        { job_title: 'No ref, must be skipped' },
      ],
    });
    registerAdapter({
      name: 'coldfeed',
      source: 'Cold Feed',
      isConfigured: () => false,
      fetchJobs: async () => [],
    });
  });

  beforeEach(async () => {
    await wipeTestDb();
  });

  afterAll(async () => {
    config.INGEST_ADMIN_TOKEN = originalToken;
    await closeTestDriver();
  });

  const run = (adapter = 'testfeed') =>
    request
      .post(`/api/ingest/${adapter}/run`)
      .set('x-ingest-token', TOKEN);

  it('requires the operator token and lists adapters with their configured flag', async () => {
    const denied = await request.post('/api/ingest/testfeed/run');
    expect(denied.status).toBe(403);

    const list = await request.get('/api/ingest').set('x-ingest-token', TOKEN);
    expect(list.status).toBe(200);
    expect(list.body.capabilities.feeds).toBe(true);
    const testfeed = list.body.adapters.find((a) => a.name === 'testfeed');
    expect(testfeed).toMatchObject({ source: SOURCE, configured: true });
  });

  it('creates no duplicate when the same adapter runs twice', async () => {
    const first = await run();
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ fetched: 1, created: 1, duplicates: 0, skipped: 1 });

    const second = await run();
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ fetched: 1, created: 0, duplicates: 1, skipped: 1 });

    const session = driver.session({ database: config.NEO4J_DATABASE });
    try {
      const count = await session.run(
        'MATCH (j:Job {external_ref: $ref}) RETURN count(j) AS n',
        { ref: REF },
      );
      expect(count.records[0].get('n').toNumber()).toBe(1);

      const props = await session.run(
        'MATCH (j:Job {external_ref: $ref}) RETURN j.source AS source, j.source_url AS url, j.fetched_at AS at',
        { ref: REF },
      );
      const row = props.records[0];
      expect(row.get('source')).toBe(SOURCE);
      expect(row.get('url')).toBe('https://example.test/jobs');
      expect(row.get('at')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    } finally {
      await session.close();
    }
  });

  it('reports unknown and unconfigured adapters honestly', async () => {
    const unknown = await run('nope');
    expect(unknown.status).toBe(404);

    const cold = await run('coldfeed');
    expect(cold.status).toBe(503);
    expect(cold.body.error.message).toContain('not configured');
  });

  it('is unavailable when no operator token is configured', async () => {
    config.INGEST_ADMIN_TOKEN = '';
    const disabled = await run();
    expect(disabled.status).toBe(503);
    expect(disabled.body.error.message).toContain('INGEST_ADMIN_TOKEN');
    config.INGEST_ADMIN_TOKEN = TOKEN;
  });
});
