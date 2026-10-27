/**
 * TEST ONLY — tests/integration/ingestVisibility.test.js (Ticket 49)
 *
 * An ingested job has no employer and may have zero extracted requirements. It
 * must still be visible in the job list, the ranking (or its unscored bucket),
 * Q1 and the subgraph — with its source attributed — instead of vanishing
 * behind employer-only MATCH clauses.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, closeTestDriver, wipeTestDb } from '../helpers/db.js';
import { createTestCandidate } from '../helpers/fixtures.js';
import { registerAdapter } from '../../src/ingest/registry.js';
import { config } from '../../src/config.js';

const SOURCE = 'Visibility Feed';
const SCORED_REF = 'visfeed-scored';
const EMPTY_REF = 'visfeed-empty';

describe('ingested jobs in the read path (Ticket 49)', () => {
  let driver;
  let request;
  let candidate;
  let originalToken;
  let originalArbeitnow;

  beforeAll(async () => {
    driver = await getTestDriver();
    request = await getTestApp();
    originalToken = config.INGEST_ADMIN_TOKEN;
    originalArbeitnow = config.ENABLE_ARBEITNOW;
    config.INGEST_ADMIN_TOKEN = 'vis-token';

    registerAdapter({
      name: 'visfeed',
      source: SOURCE,
      isConfigured: () => true,
      fetchJobs: async () => [
        {
          external_ref: SCORED_REF,
          job_title: 'Imported Graph Role',
          descriptive: 'JavaScript',
          source_url: `https://visibility.test/${SCORED_REF}`,
        },
        {
          external_ref: EMPTY_REF,
          job_title: 'Imported Untagged Role',
          descriptive: 'No known skills.',
          source_url: `https://visibility.test/${EMPTY_REF}`,
        },
      ],
    });
  });

  afterAll(async () => {
    config.INGEST_ADMIN_TOKEN = originalToken;
    config.ENABLE_ARBEITNOW = originalArbeitnow;
    await closeTestDriver();
  });

  beforeEach(async () => {
    await wipeTestDb();
    candidate = await createTestCandidate(driver);
    const session = driver.session({ database: 'neo4j' });
    try {
      await session.run(
        `MERGE (s:Skill {skill_key: 'javascript'}) SET s.name = 'JavaScript'
         WITH s
         MATCH (c:Candidate {cand_id: $candId})
         MERGE (c)-[:HAS_SKILL {proficiency: 4, years: 3}]->(s)`,
        { candId: candidate.profileId },
      );
    } finally {
      await session.close();
    }

    const run = await request.post('/api/ingest/visfeed/run').set('x-ingest-token', 'vis-token');
    expect(run.status).toBe(200);
    expect(run.body).toMatchObject({ created: 2, duplicates: 0 });
  });

  const jobIdByTitle = async (title) => {
    const list = await request.get('/api/jobs?limit=100');
    return list.body.jobs.find((job) => job.job_title === title).job_id;
  };

  it('lists and reads ingested jobs with their source and no employer', async () => {
    const list = await request.get('/api/jobs?limit=100');
    const ingested = list.body.jobs.filter((job) => job.external_ref);
    expect(ingested).toHaveLength(2);
    for (const job of ingested) {
      expect(job).toMatchObject({ source: SOURCE, emp_id: null, company_name: null });
      expect(job.source_url).toMatch(/^https:\/\/visibility\.test\//);
    }

    const byId = await request.get(`/api/jobs/${ingested[0].job_id}`);
    expect(byId.status).toBe(200);
    expect(byId.body.job).toMatchObject({ source: SOURCE, emp_id: null, external_ref: ingested[0].external_ref });
  });

  it('scores the requirement-bearing job and buckets the untagged one', async () => {
    const ranking = await request.get(`/api/match/candidate/${candidate.profileId}/jobs`);
    expect(ranking.status).toBe(200);

    const scored = ranking.body.ranked.find((job) => job.job_title === 'Imported Graph Role');
    expect(scored).toMatchObject({ employer: null, source: SOURCE, source_url: expect.stringContaining(SCORED_REF) });

    const unscored = ranking.body.unscored.find((job) => job.job_title === 'Imported Untagged Role');
    expect(unscored).toMatchObject({ employer: null, source: SOURCE, source_url: expect.stringContaining(EMPTY_REF) });
  });

  it('returns source fields from Q1 and an employer-free subgraph', async () => {
    const scoredId = await jobIdByTitle('Imported Graph Role');

    const match = await request.get(`/api/match/${candidate.profileId}/${scoredId}`);
    expect(match.status).toBe(200);
    expect(match.body.match).toMatchObject({ source: SOURCE, source_url: expect.stringContaining(SCORED_REF) });

    const subgraph = await request.get(`/api/match/${candidate.profileId}/${scoredId}/subgraph`);
    expect(subgraph.status).toBe(200);
    expect(subgraph.body.nodes.some((node) => node.type === 'Employer')).toBe(false);
    expect(subgraph.body.nodes.some((node) => node.type === 'Job' && node.id === scoredId)).toBe(true);
    expect(subgraph.body.edges.some((edge) => edge.type === 'POSTED')).toBe(false);
  });

  it('reports feed capability only for configured adapters', async () => {
    config.ENABLE_ARBEITNOW = false;
    const off = await request.get('/api/meta/capabilities');
    expect(off.status).toBe(200);
    expect(off.body.capabilities.feeds).toBe(off.body.capabilities.adapters.length > 0);
    expect(off.body.capabilities.adapters.map((a) => a.name)).not.toContain('arbeitnow');

    config.ENABLE_ARBEITNOW = true;
    const on = await request.get('/api/meta/capabilities');
    expect(on.body.capabilities.feeds).toBe(true);
    expect(on.body.capabilities.adapters).toContainEqual({ name: 'arbeitnow', source: 'Arbeitnow' });
  });
});
