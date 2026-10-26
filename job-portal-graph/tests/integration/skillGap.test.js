/**
 * TEST ONLY — tests/integration/skillGap.test.js (Ticket 24)
 *
 * Q2 on real fixture data: satisfied requirements excluded, both `below` and
 * `missing` represented, mandatory requirements ordered first, 404 for
 * missing ids, and an empty gap list when everything is satisfied.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, closeTestDriver, wipeTestDb } from '../helpers/db.js';
import { createTestCandidate, createTestEmployer } from '../helpers/fixtures.js';
import { signToken } from '../../src/lib/auth.js';

describe('GET /api/gap/:candId/:jobId (Ticket 24)', () => {
  let driver;
  let request;
  let candidate;
  let candToken;
  let empToken;

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
    const employer = await createTestEmployer(driver);
    candToken = signToken({ accountId: candidate.accountId, role: 'candidate' });
    empToken = signToken({ accountId: employer.accountId, role: 'employer' });
  });

  async function setSkills(skills) {
    const res = await request
      .put('/api/candidates/me/skills')
      .set('Cookie', [`auth=${candToken}`])
      .send({ skills });
    expect(res.status).toBe(200);
  }

  async function postJob(requirements) {
    const res = await request
      .post('/api/jobs')
      .set('Cookie', [`auth=${empToken}`])
      .send({ job_title: 'Graph Engineer', requirements });
    expect(res.status).toBe(201);
    return res.body.job;
  }

  it('returns below and missing gaps, mandatory first, satisfied excluded', async () => {
    await setSkills([
      { name: 'Zebra', proficiency: 1, years: 4 },
      { name: 'Node.js', proficiency: 2, years: 5 },
      { name: 'Neo4j', proficiency: 4, years: 3 },
    ]);
    const job = await postJob([
      { name: 'Node.js', min_proficiency: 4, min_years: 5 },
      { name: 'Zebra', min_proficiency: 5, min_years: 4, mandatory: true },
      { name: 'SQL', min_proficiency: 3 },
      { name: 'Neo4j', min_proficiency: 4, mandatory: true },
    ]);

    const res = await request.get(`/api/gap/${candidate.profileId}/${job.job_id}`);
    expect(res.status).toBe(200);
    expect(res.body.gaps.map((g) => g.skill)).toEqual(['Zebra', 'Node.js', 'SQL']);
    expect(res.body.gaps.map((g) => g.gap_type)).toEqual(['below', 'below', 'missing']);
    expect(res.body.gaps[0]).toMatchObject({
      skill_key: 'zebra',
      mandatory: true,
      required_proficiency: 5,
      required_years: 4,
      current_proficiency: 1,
      current_years: 4,
    });
    expect(res.body.gaps[2]).toMatchObject({
      mandatory: false,
      current_proficiency: null,
      current_years: null,
    });
    expect(res.body.summary).toEqual({ total: 3, below: 2, missing: 1 });
    expect(res.body.meta).toMatchObject({ queryName: 'Q2', rowCount: 3 });
  });

  it('returns an empty gap list when the candidate satisfies everything', async () => {
    await setSkills([{ name: 'Node.js', proficiency: 4, years: 3 }]);
    const job = await postJob([
      { name: 'Node.js', min_proficiency: 3, min_years: 2, mandatory: true },
    ]);

    const res = await request.get(`/api/gap/${candidate.profileId}/${job.job_id}`);
    expect(res.status).toBe(200);
    expect(res.body.gaps).toEqual([]);
    expect(res.body.summary).toEqual({ total: 0, below: 0, missing: 0 });
  });

  it('404s when the candidate or the job is missing', async () => {
    const job = await postJob([{ name: 'SQL' }]);

    const noCandidate = await request.get(`/api/gap/missing/${job.job_id}`);
    expect(noCandidate.status).toBe(404);
    expect(noCandidate.body.error.code).toBe('NOT_FOUND');

    const noJob = await request.get(`/api/gap/${candidate.profileId}/missing`);
    expect(noJob.status).toBe(404);
    expect(noJob.body.error.code).toBe('NOT_FOUND');
  });
});
