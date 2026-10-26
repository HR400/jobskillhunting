/**
 * TEST ONLY — tests/integration/candidateRanking.test.js (Ticket 23)
 *
 * §8.3 ranking on real fixture data: order, exclusions, unscored bucket,
 * pagination, 404, and the empty case for a candidate with no skills.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, closeTestDriver, wipeTestDb } from '../helpers/db.js';
import { createTestCandidate, createTestEmployer } from '../helpers/fixtures.js';
import { signToken } from '../../src/lib/auth.js';

describe('GET /api/match/candidate/:candId/jobs (Ticket 23)', () => {
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
    const employer = await createTestEmployer(driver, { companyName: 'Acme' });
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

  async function postJob(body) {
    const res = await request
      .post('/api/jobs')
      .set('Cookie', [`auth=${empToken}`])
      .send({ job_title: 'Role', ...body });
    expect(res.status).toBe(201);
    return res.body.job;
  }

  it('ranks open jobs by mandatory_ok then match_pct and skips the rest', async () => {
    await setSkills([
      { name: 'Node.js', proficiency: 4, years: 3 },
      { name: 'SQL', proficiency: 3, years: 2 },
    ]);

    // 2/2 = 100, mandatory satisfied.
    const best = await postJob({
      job_title: 'Perfect',
      requirements: [
        { name: 'Node.js', min_proficiency: 4, mandatory: true },
        { name: 'SQL', min_proficiency: 3 },
      ],
    });
    // 2/2 = 100 but the mandatory requirement fails.
    await postJob({
      job_title: 'Mandatory Miss',
      requirements: [
        { name: 'Node.js', min_proficiency: 5, mandatory: true },
        { name: 'SQL', min_proficiency: 3 },
      ],
    });
    // 1/2 = 50.
    await postJob({
      job_title: 'Partial',
      requirements: [{ name: 'Node.js', min_proficiency: 3 }, { name: 'Rust' }],
    });
    // Zero satisfied -> not in the ranked list.
    await postJob({ job_title: 'Unrelated', requirements: [{ name: 'Rust', min_proficiency: 5 }] });
    // Zero requirements -> unscored bucket.
    const unscored = await postJob({ job_title: 'Unscored Role' });
    // Closed and expired jobs never appear.
    const closed = await postJob({
      job_title: 'Closed Role',
      requirements: [{ name: 'Node.js' }],
    });
    await request
      .patch(`/api/jobs/${closed.job_id}`)
      .set('Cookie', [`auth=${empToken}`])
      .send({ job_status: 'Closed' });
    await postJob({
      job_title: 'Expired Role',
      closing_date: '2020-01-01',
      requirements: [{ name: 'Node.js' }],
    });

    const res = await request.get(`/api/match/candidate/${candidate.profileId}/jobs`);
    expect(res.status).toBe(200);
    expect(res.body.ranked.map((j) => j.job_title)).toEqual([
      'Perfect',
      'Partial',
      'Mandatory Miss',
    ]);
    expect(res.body.ranked.map((j) => j.match_pct)).toEqual([100, 50, 50]);
    expect(res.body.ranked.map((j) => j.mandatory_ok)).toEqual([true, true, false]);
    expect(res.body.ranked[0]).toMatchObject({
      job_id: best.job_id,
      total: 2,
      matched: 2,
      band: 'Strong',
      employer: { company_name: 'Acme' },
    });
    expect(res.body.ranked[0].matched_skills.sort()).toEqual(['Node.js', 'SQL']);
    expect(res.body.unscored.map((j) => j.job_title)).toEqual(['Unscored Role']);
    expect(res.body.unscored[0].job_id).toBe(unscored.job_id);
    expect(res.body.message).toBeUndefined();

    const paged = await request.get(
      `/api/match/candidate/${candidate.profileId}/jobs?limit=1&skip=1`,
    );
    expect(paged.body.ranked.map((j) => j.job_title)).toEqual(['Partial']);
    expect(paged.body).toMatchObject({ limit: 1, skip: 1 });
  });

  it('returns an empty ranked list and the real message for a candidate with no skills', async () => {
    await postJob({ job_title: 'Needs Skills', requirements: [{ name: 'Rust' }] });
    await postJob({ job_title: 'No Requirements' });

    const res = await request.get(`/api/match/candidate/${candidate.profileId}/jobs`);
    expect(res.status).toBe(200);
    expect(res.body.ranked).toEqual([]);
    expect(res.body.unscored.map((j) => j.job_title)).toEqual(['No Requirements']);
    expect(res.body.message).toBe('No open jobs matched your current skills.');
  });

  it('validates pagination and 404s on a missing candidate', async () => {
    const tooBig = await request.get(
      `/api/match/candidate/${candidate.profileId}/jobs?limit=101`,
    );
    expect(tooBig.status).toBe(400);

    const missing = await request.get('/api/match/candidate/missing/jobs');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
  });
});
