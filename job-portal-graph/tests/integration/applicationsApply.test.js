/**
 * TEST ONLY — tests/integration/applicationsApply.test.js (Ticket 27)
 *
 * Screening on apply (plan §8.4): threshold 422, mandatory 422, unscored
 * allowed, auditable MATCHED_TO / ASSESSED_FOR snapshot, duplicate 409,
 * and 20 parallel applies yielding exactly one 201.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, closeTestDriver, wipeTestDb } from '../helpers/db.js';
import { createTestCandidate, createTestEmployer } from '../helpers/fixtures.js';
import { signToken } from '../../src/lib/auth.js';

describe('POST /api/applications (Ticket 27)', () => {
  let driver;
  let request;

  beforeAll(async () => {
    driver = await getTestDriver();
    request = await getTestApp();
  });

  afterAll(async () => {
    await closeTestDriver();
  });

  beforeEach(async () => {
    await wipeTestDb();
  });

  async function seedCandidate(skills) {
    const candidate = await createTestCandidate(driver);
    const cookie = [`auth=${signToken({ accountId: candidate.accountId, role: 'candidate' })}`];
    const res = await request
      .put('/api/candidates/me/skills')
      .set('Cookie', cookie)
      .send({ skills });
    expect(res.status).toBe(200);
    return { ...candidate, cookie };
  }

  async function seedJob(requirements) {
    const employer = await createTestEmployer(driver);
    const cookie = [`auth=${signToken({ accountId: employer.accountId, role: 'employer' })}`];
    const res = await request
      .post('/api/jobs')
      .set('Cookie', cookie)
      .send({ job_title: 'Apply Role', requirements });
    expect(res.status).toBe(201);
    return { ...employer, cookie, jobId: res.body.job.job_id };
  }

  it('rejects below the threshold with the breakdown', async () => {
    const candidate = await seedCandidate([{ name: 'JavaScript', proficiency: 3, years: 2 }]);
    const employer = await seedJob([{ name: 'JavaScript' }, { name: 'Rust' }, { name: 'Go' }]);

    const res = await request
      .post('/api/applications')
      .set('Cookie', candidate.cookie)
      .send({ jobId: employer.jobId });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('MATCH_BELOW_THRESHOLD');
    expect(res.body.error.message).toBe('Match score below threshold 40%.');
    expect(res.body.error.details.match_pct).toBe(33.3);
    expect(res.body.error.details.breakdown).toHaveLength(3);
  });

  it('rejects a missing mandatory skill once the threshold is met', async () => {
    const candidate = await seedCandidate([{ name: 'JavaScript', proficiency: 3, years: 2 }]);
    const employer = await seedJob([
      { name: 'JavaScript' },
      { name: 'Rust', mandatory: true },
    ]);

    const res = await request
      .post('/api/applications')
      .set('Cookie', candidate.cookie)
      .send({ jobId: employer.jobId });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('MANDATORY_SKILLS_MISSING');
    expect(res.body.error.details.breakdown.map((r) => r.skill_key)).toEqual(['rust']);
  });

  it('accepts at the threshold and writes the snapshot', async () => {
    const candidate = await seedCandidate([
      { name: 'JavaScript', proficiency: 3, years: 2 },
      { name: 'Rust', proficiency: 2, years: 1 },
    ]);
    const employer = await seedJob([
      { name: 'JavaScript' },
      { name: 'Rust' },
      { name: 'Go' },
      { name: 'Java' },
    ]);

    const res = await request
      .post('/api/applications')
      .set('Cookie', candidate.cookie)
      .send({ jobId: employer.jobId });

    expect(res.status).toBe(201);
    expect(res.body.match).toMatchObject({ scored: true, match_pct: 50, band: 'Moderate' });
    expect(res.body.application.status).toBe('Applied');

    const session = driver.session({ database: 'neo4j' });
    try {
      const rows = await session.executeRead((tx) =>
        tx.run(
          `MATCH (c:Candidate {cand_id: $c})-[a:APPLIED_TO]->(j:Job {job_id: $j})
           MATCH (c)-[m:MATCHED_TO]->(j)
           OPTIONAL MATCH (c)-[s:ASSESSED_FOR]->(j)
           RETURN a.app_id AS app_id, a.status AS status,
                  m.match_pct AS match_pct, m.recommendation_level AS level,
                  count(s) AS assessed,
                  collect(s.skill_key) AS keys`,
          { c: candidate.profileId, j: employer.jobId },
        ),
      );
      const row = rows.records[0];
      expect(row.get('app_id')).toBe(res.body.application.app_id);
      expect(row.get('status')).toBe('Applied');
      expect(row.get('match_pct')).toBe(50);
      expect(row.get('level')).toBe('Moderate');
      expect(row.get('assessed').toNumber()).toBe(4);
      expect(row.get('keys').sort()).toEqual(['go', 'java', 'javascript', 'rust']);
    } finally {
      await session.close();
    }
  });

  it('allows a job with no requirements as unscored', async () => {
    const candidate = await seedCandidate([{ name: 'JavaScript', proficiency: 3, years: 2 }]);
    const employer = await seedJob([]);

    const res = await request
      .post('/api/applications')
      .set('Cookie', candidate.cookie)
      .send({ jobId: employer.jobId });

    expect(res.status).toBe(201);
    expect(res.body.match).toMatchObject({ scored: false, match_pct: null, band: 'Unscored' });
  });

  it('rejects a second application with 409', async () => {
    const candidate = await seedCandidate([{ name: 'JavaScript', proficiency: 3, years: 2 }]);
    const employer = await seedJob([{ name: 'JavaScript' }]);

    const first = await request
      .post('/api/applications')
      .set('Cookie', candidate.cookie)
      .send({ jobId: employer.jobId });
    const second = await request
      .post('/api/applications')
      .set('Cookie', candidate.cookie)
      .send({ jobId: employer.jobId });

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ALREADY_APPLIED');
  });

  it('lets exactly one of 20 parallel applies through', async () => {
    const candidate = await seedCandidate([{ name: 'JavaScript', proficiency: 3, years: 2 }]);
    const employer = await seedJob([{ name: 'JavaScript' }]);

    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        request
          .post('/api/applications')
          .set('Cookie', candidate.cookie)
          .send({ jobId: employer.jobId }),
      ),
    );

    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(19);

    const session = driver.session({ database: 'neo4j' });
    try {
      const count = await session.executeRead((tx) =>
        tx.run(
          `MATCH (:Candidate {cand_id: $c})-[a:APPLIED_TO]->(:Job {job_id: $j})
           RETURN count(a) AS n`,
          { c: candidate.profileId, j: employer.jobId },
        ),
      );
      expect(count.records[0].get('n').toNumber()).toBe(1);
    } finally {
      await session.close();
    }
  });
});
