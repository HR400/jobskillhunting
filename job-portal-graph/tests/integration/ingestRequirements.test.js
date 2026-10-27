/**
 * TEST ONLY — tests/integration/ingestRequirements.test.js (Ticket 48)
 *
 * Extracted requirements come only from catalogue name/alias matches, carry
 * null minimums, and are replaced (not duplicated) on a re-run.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, closeTestDriver, wipeTestDb } from '../helpers/db.js';
import { registerAdapter } from '../../src/ingest/registry.js';
import { config } from '../../src/config.js';

const TOKEN = 'test-ingest-token';
const REF = 'reqfeed-1';

describe('ingested requirements (Ticket 48)', () => {
  let driver;
  let request;
  let originalToken;

  beforeAll(async () => {
    driver = await getTestDriver();
    request = await getTestApp();
    originalToken = config.INGEST_ADMIN_TOKEN;
    config.INGEST_ADMIN_TOKEN = TOKEN;

    registerAdapter({
      name: 'reqfeed',
      source: 'Requirement Feed',
      isConfigured: () => true,
      fetchJobs: async () => [
        {
          external_ref: REF,
          job_title: 'Graph Engineer',
          descriptive: '<p>We use JavaScript and JS daily. Kubernetes is a plus.</p>',
          source_url: 'https://jobs.test/reqfeed-1',
        },
      ],
    });
  });

  beforeEach(async () => {
    await wipeTestDb();
    const session = driver.session({ database: config.NEO4J_DATABASE });
    try {
      await session.run(
        `MERGE (js:Skill {skill_key: 'javascript'})
           SET js.name = 'JavaScript', js.aliases = ['JS']
         MERGE (k8s:Skill {skill_key: 'kubernetes'})
           SET k8s.name = 'Kubernetes'`,
      );
    } finally {
      await session.close();
    }
  });

  afterAll(async () => {
    config.INGEST_ADMIN_TOKEN = originalToken;
    await closeTestDriver();
  });

  const run = () =>
    request.post('/api/ingest/reqfeed/run').set('x-ingest-token', TOKEN);

  const readEdges = async () => {
    const session = driver.session({ database: config.NEO4J_DATABASE });
    try {
      const res = await session.run(
        `MATCH (:Job {external_ref: $ref})-[r:REQUIRES_SKILL]->(s:Skill)
         RETURN s.skill_key AS key, r.min_proficiency AS prof, r.min_years AS years,
                r.mandatory AS mandatory, r.requirement_source AS source
         ORDER BY key`,
        { ref: REF },
      );
      return res.records.map((r) => ({
        key: r.get('key'),
        prof: r.get('prof'),
        years: r.get('years'),
        mandatory: r.get('mandatory'),
        source: r.get('source'),
      }));
    } finally {
      await session.close();
    }
  };

  it('attaches only exact-name/alias matches with null minimums', async () => {
    const res = await run();
    expect(res.status).toBe(200);
    expect(res.body.requirements).toBe(2);
    expect(await readEdges()).toEqual([
      { key: 'javascript', prof: null, years: null, mandatory: false, source: 'extracted' },
      { key: 'kubernetes', prof: null, years: null, mandatory: false, source: 'extracted' },
    ]);
  });

  it('replaces requirements instead of duplicating them on a re-run', async () => {
    await run();
    const second = await run();
    expect(second.body).toMatchObject({ created: 0, duplicates: 1, requirements: 2 });
    expect(await readEdges()).toHaveLength(2);
  });
});
