/**
 * TEST ONLY — tests/integration/matchQ1.test.js (Ticket 22)
 *
 * Q1 and its subgraph against real fixture data on the throwaway instance:
 * missing ids are 404 (not 0 %), boundary values score, and the subgraph
 * carries the §9.4 node/edge shape with PII removed.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, closeTestDriver, wipeTestDb } from '../helpers/db.js';
import { createTestCandidate, createTestEmployer } from '../helpers/fixtures.js';
import { signToken } from '../../src/lib/auth.js';

describe('GET /api/match/:candId/:jobId (Ticket 22)', () => {
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
    candidate = await createTestCandidate(driver, { fname: 'Ada', lname: 'Lovelace' });
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

  it('scores requirements with satisfied, below and missing statuses', async () => {
    await setSkills([
      { name: 'Node.js', proficiency: 4, years: 3 },
      { name: 'Neo4j', proficiency: 2, years: 1 },
    ]);
    const job = await postJob([
      { name: 'Node.js', min_proficiency: 4, min_years: 3, mandatory: true },
      { name: 'Neo4j', min_proficiency: 4, min_years: 3 },
      { name: 'SQL', min_proficiency: 3 },
    ]);

    const res = await request.get(`/api/match/${candidate.profileId}/${job.job_id}`);
    expect(res.status).toBe(200);
    expect(res.body.match).toMatchObject({
      job_id: job.job_id,
      job_title: 'Graph Engineer',
      total: 3,
      matched: 1,
      match_pct: 33.3,
      band: 'Low',
      mandatory_ok: true,
    });
    const bySkill = Object.fromEntries(
      res.body.match.breakdown.map((r) => [r.skill_key, r]),
    );
    expect(bySkill['node.js']).toMatchObject({
      status: 'satisfied',
      candidate_proficiency: 4,
      candidate_years: 3,
    });
    expect(bySkill.neo4j.status).toBe('below');
    expect(bySkill.sql).toMatchObject({ status: 'missing', candidate_proficiency: null });
    expect(res.body.meta).toMatchObject({ queryName: 'Q1', rowCount: 1 });
    expect(res.body.meta.dbTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('treats equal-to-minimum as satisfied and null minimums as proficiency 1', async () => {
    await setSkills([{ name: 'SQL', proficiency: 1, years: 0 }]);
    const job = await postJob([
      { name: 'SQL', min_proficiency: 1, min_years: 0 },
      { name: 'Excel' },
    ]);

    const res = await request.get(`/api/match/${candidate.profileId}/${job.job_id}`);
    expect(res.body.match).toMatchObject({ total: 2, matched: 1, match_pct: 50 });
  });

  it('reports an empty-requirement job as unscored, never 100 %', async () => {
    const job = await postJob([]);
    const res = await request.get(`/api/match/${candidate.profileId}/${job.job_id}`);
    expect(res.status).toBe(200);
    expect(res.body.match).toMatchObject({
      total: 0,
      matched: 0,
      match_pct: null,
      band: 'Unscored',
    });
  });

  it('returns 404 for a missing candidate or job', async () => {
    const job = await postJob([{ name: 'SQL' }]);

    const noCandidate = await request.get(`/api/match/missing/${job.job_id}`);
    expect(noCandidate.status).toBe(404);
    expect(noCandidate.body.error.code).toBe('NOT_FOUND');

    const noJob = await request.get(`/api/match/${candidate.profileId}/missing`);
    expect(noJob.status).toBe(404);
    expect(noJob.body.error.code).toBe('NOT_FOUND');

    expect((await request.get('/api/match/missing/missing/subgraph')).status).toBe(404);
  });

  it('returns the §9.4 subgraph without candidate contact details', async () => {
    await setSkills([{ name: 'Node.js', proficiency: 4, years: 3 }]);
    const job = await postJob([
      { name: 'Node.js', min_proficiency: 3, mandatory: true },
      { name: 'SQL' },
    ]);

    const res = await request.get(
      `/api/match/${candidate.profileId}/${job.job_id}/subgraph`,
    );
    expect(res.status).toBe(200);

    const types = res.body.nodes.map((n) => n.type).sort();
    expect(types).toEqual(['Candidate', 'Employer', 'Job', 'Skill', 'Skill']);

    const candidateNode = res.body.nodes.find((n) => n.type === 'Candidate');
    expect(candidateNode.label).toBe('Ada Lovelace');
    expect(candidateNode.props).not.toHaveProperty('email');
    expect(candidateNode.props).not.toHaveProperty('phone');
    expect(candidateNode.props).not.toHaveProperty('dob');

    const requires = res.body.edges.filter((e) => e.type === 'REQUIRES_SKILL');
    expect(requires.map((e) => [e.to, e.state])).toEqual(
      expect.arrayContaining([
        ['node.js', 'satisfied'],
        ['sql', 'missing'],
      ]),
    );
    expect(res.body.edges.filter((e) => e.type === 'HAS_SKILL')).toHaveLength(1);
    expect(res.body.meta).toMatchObject({
      queryName: 'Q1_SUBGRAPH',
      params: { candId: candidate.profileId, jobId: job.job_id },
    });
  });
});
