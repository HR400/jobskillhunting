/**
 * TEST ONLY — tests/integration/whatIf.test.js (Ticket 29)
 *
 * POST /api/match/what-if against real fixtures: effective-skill scoring,
 * validation, 404, and the done-when check — node/edge counts unchanged.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, closeTestDriver, wipeTestDb } from '../helpers/db.js';
import { createTestCandidate, createTestEmployer } from '../helpers/fixtures.js';
import { signToken } from '../../src/lib/auth.js';

describe('POST /api/match/what-if (Ticket 29)', () => {
  let driver;
  let request;
  let candidate;

  beforeAll(async () => {
    driver = await getTestDriver();
    request = await getTestApp();
  });

  afterAll(async () => {
    await closeTestDriver();
  });

  beforeEach(async () => {
    await wipeTestDb();
    candidate = await createTestCandidate(driver);
  });

  async function graphCounts() {
    const session = driver.session({ database: 'neo4j' });
    try {
      const nodes = await session.run('MATCH (n) RETURN count(n) AS n');
      const edges = await session.run('MATCH ()-[r]->() RETURN count(r) AS r');
      return {
        nodes: nodes.records[0].get('n').toNumber(),
        edges: edges.records[0].get('r').toNumber(),
      };
    } finally {
      await session.close();
    }
  }

  /** Registers one employer and one job through the API. */
  async function seedJobs() {
    const employer = await createTestEmployer(driver);
    const token = signToken({ accountId: employer.accountId, role: 'employer' });
    const res = await request
      .post('/api/jobs')
      .set('Cookie', [`auth=${token}`])
      .send({
        job_title: 'Graph Engineer',
        requirements: [
          { name: 'Node.js', min_proficiency: 4, mandatory: true },
          { name: 'SQL', min_proficiency: 3 },
        ],
      });
    expect(res.status).toBe(201);
    return res.body.job.job_id;
  }

  it('scores the effective skill map and never writes', async () => {
    await request
      .put('/api/candidates/me/skills')
      .set('Cookie', [`auth=${signToken({ accountId: candidate.accountId, role: 'candidate' })}`])
      .send({ skills: [{ name: 'Node.js', proficiency: 2, years: 1 }] })
      .expect(200);
    const jobId = await seedJobs();
    const before = await graphCounts();

    const res = await request.post('/api/match/what-if').send({
      candId: candidate.profileId,
      hypothetical: [{ skill_key: 'node.js', proficiency: 5, years: 2 }],
    });

    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({
      jobs_scored: 1,
      jobs_improved: 1,
      newly_unlocked: 1,
      newly_mandatory_ok: 1,
      newly_above_band: 1,
    });
    const job = res.body.jobs[0];
    expect(job).toMatchObject({
      job_id: jobId,
      total: 2,
      stored: { matched: 0, match_pct: 0, band: 'Low', mandatory_ok: false },
      hypothetical: { matched: 1, match_pct: 50, band: 'Moderate', mandatory_ok: true },
      delta_pct: 50,
      newly_unlocked: true,
    });
    // SQL stays missing even though the hypothetical bumps Node.js.
    expect(res.body.meta).toMatchObject({ queryName: 'WHAT_IF_RANKING', rowCount: 1 });
    expect(res.body.meta.dbTimeMs).toBeGreaterThanOrEqual(0);

    // Done-when: nothing was written.
    expect(await graphCounts()).toEqual(before);
  });

  it('returns the stored scores for an empty hypothetical list', async () => {
    await request
      .put('/api/candidates/me/skills')
      .set('Cookie', [`auth=${signToken({ accountId: candidate.accountId, role: 'candidate' })}`])
      .send({ skills: [{ name: 'SQL', proficiency: 3, years: 2 }] })
      .expect(200);
    await seedJobs();

    const res = await request
      .post('/api/match/what-if')
      .send({ candId: candidate.profileId, hypothetical: [] });
    expect(res.status).toBe(200);
    expect(res.body.jobs[0].hypothetical).toEqual(res.body.jobs[0].stored);
  });

  it('ignores hypothetical skills that no job requires', async () => {
    const jobId = await seedJobs();
    const res = await request.post('/api/match/what-if').send({
      candId: candidate.profileId,
      hypothetical: [{ skill_key: 'quantum-weaving', proficiency: 5, years: 10 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.jobs[0]).toMatchObject({
      job_id: jobId,
      stored: { match_pct: 0 },
      hypothetical: { match_pct: 0 },
      delta_pct: 0,
    });
  });

  it('404s an unknown candidate and 400s invalid payloads', async () => {
    expect(
      (await request.post('/api/match/what-if').send({ candId: 'missing', hypothetical: [] }))
        .status,
    ).toBe(404);

    const res = await request.post('/api/match/what-if').send({
      candId: candidate.profileId,
      hypothetical: [{ skill_key: 'node.js', proficiency: 6, years: 0 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details[0].path).toBe('hypothetical.0.proficiency');

    expect(
      (
        await request.post('/api/match/what-if').send({
          candId: candidate.profileId,
          hypothetical: [],
          extra: true,
        })
      ).status,
    ).toBe(400);
  });
});
