/**
 * TEST ONLY — tests/integration/jobsCreate.test.js (Ticket 18)
 *
 * Verifies Ticket 18:
 *   - Only employers can post a job (others 403)
 *   - A calendar-invalid closing date is 400 with the field path
 *   - Requirements land as REQUIRES_SKILL edges with their properties
 *   - posted_date / closing_date are stored as native DATETIME / DATE
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, closeTestDriver, wipeTestDb } from '../helpers/db.js';
import { createTestCandidate, createTestEmployer } from '../helpers/fixtures.js';
import { signToken } from '../../src/lib/auth.js';

describe('POST /api/jobs (Ticket 18)', () => {
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

  const validJob = {
    job_title: 'Backend Engineer',
    salary: 90000,
    closing_date: '2026-12-31',
    descriptive: 'Build graph-backed APIs.',
    requirements: [
      { name: 'Node.js', min_proficiency: 3, min_years: 2, mandatory: true },
      { name: 'Neo4j' },
    ],
  };

  it('rejects non-employer roles with 403', async () => {
    const candidate = await createTestCandidate(driver);
    const token = signToken({ accountId: candidate.accountId, role: candidate.role });

    const res = await request
      .post('/api/jobs')
      .set('Cookie', [`auth=${token}`])
      .send(validJob);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects an impossible calendar date with 400 and the field path', async () => {
    const employer = await createTestEmployer(driver);
    const token = signToken({ accountId: employer.accountId, role: employer.role });

    const res = await request
      .post('/api/jobs')
      .set('Cookie', [`auth=${token}`])
      .send({ ...validJob, closing_date: '2026-02-30' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details).toContainEqual(
      expect.objectContaining({ path: 'closing_date' }),
    );
  });

  it('creates the job as REQUIRES_SKILL edges with native dates', async () => {
    const employer = await createTestEmployer(driver);
    const token = signToken({ accountId: employer.accountId, role: employer.role });

    const res = await request
      .post('/api/jobs')
      .set('Cookie', [`auth=${token}`])
      .send(validJob);

    expect(res.status).toBe(201);
    expect(res.body.job).toMatchObject({
      job_title: 'Backend Engineer',
      job_status: 'Open',
      source: 'employer',
      requirement_source: 'employer',
      emp_id: employer.profileId,
    });

    const session = driver.session({ database: 'neo4j' });
    try {
      const dbRes = await session.run(
        `MATCH (e:Employer {emp_id: $empId})-[:POSTED]->(j:Job {job_id: $jobId})
         MATCH (j)-[r:REQUIRES_SKILL]->(s:Skill)
         RETURN j.closing_date.year AS closingYear, j.posted_date.epochSeconds AS postedEpoch,
                collect({key: s.skill_key, minP: r.min_proficiency, minY: r.min_years,
                         mandatory: r.mandatory}) AS reqs`,
        { empId: employer.profileId, jobId: res.body.job.job_id },
      );
      expect(dbRes.records.length).toBe(1);
      const row = dbRes.records[0];
      expect(row.get('closingYear').toNumber()).toBe(2026);
      expect(typeof row.get('postedEpoch')).toBe('object'); // Neo4j Integer
      expect(row.get('reqs')).toEqual(
        expect.arrayContaining([
          { key: 'node.js', minP: 3, minY: 2, mandatory: true },
          { key: 'neo4j', minP: null, minY: null, mandatory: false },
        ]),
      );
    } finally {
      await session.close();
    }
  });

  it('rejects duplicate requirements and unknown fields', async () => {
    const employer = await createTestEmployer(driver);
    const token = signToken({ accountId: employer.accountId, role: employer.role });

    const dup = await request
      .post('/api/jobs')
      .set('Cookie', [`auth=${token}`])
      .send({ ...validJob, requirements: [{ name: 'Node.js' }, { name: ' node.js ' }] });
    expect(dup.status).toBe(400);
    expect(dup.body.error.details).toContainEqual(
      expect.objectContaining({ path: 'requirements' }),
    );

    const extra = await request
      .post('/api/jobs')
      .set('Cookie', [`auth=${token}`])
      .send({ ...validJob, owner_id: 'someone-else' });
    expect(extra.status).toBe(400);
  });
});
