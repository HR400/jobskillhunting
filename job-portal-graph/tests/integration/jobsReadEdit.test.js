/**
 * TEST ONLY — tests/integration/jobsReadEdit.test.js (Ticket 19)
 *
 * Verifies Ticket 19:
 *   - GET /api/jobs filters, limit <= 100, skip
 *   - GET /api/jobs/:id returns the job with its requirements (404 when unknown)
 *   - PATCH /api/jobs/:id edits and closes; non-owner 403, unknown 404, bad date 400
 *   - A closed job leaves the open set (the ranked matcher's filter, ticket 23)
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, closeTestDriver, wipeTestDb } from '../helpers/db.js';
import { createTestEmployer } from '../helpers/fixtures.js';
import { signToken } from '../../src/lib/auth.js';

describe('GET/PATCH /api/jobs (Ticket 19)', () => {
  let driver;
  let request;
  let owner;
  let ownerToken;
  let otherToken;

  beforeAll(async () => {
    driver = await getTestDriver();
    request = await getTestApp();
  });

  afterAll(async () => {
    await closeTestDriver();
  });

  beforeEach(async () => {
    await wipeTestDb();
    owner = await createTestEmployer(driver, { companyName: 'Owner Co' });
    const other = await createTestEmployer(driver);
    ownerToken = signToken({ accountId: owner.accountId, role: owner.role });
    otherToken = signToken({ accountId: other.accountId, role: other.role });
  });

  async function postJob(body) {
    const res = await request
      .post('/api/jobs')
      .set('Cookie', [`auth=${ownerToken}`])
      .send({ job_title: 'Engineer', ...body });
    expect(res.status).toBe(201);
    return res.body.job;
  }

  it('lists jobs with filters, skip and limit validation', async () => {
    await postJob({
      job_title: 'Backend Engineer',
      requirements: [{ name: 'Node.js', min_proficiency: 3, min_years: 2 }],
    });
    await postJob({ job_title: 'Data Analyst', requirements: [{ name: 'SQL' }] });
    const closed = await postJob({ job_title: 'Old Role' });
    await request
      .patch(`/api/jobs/${closed.job_id}`)
      .set('Cookie', [`auth=${ownerToken}`])
      .send({ job_status: 'Closed' });

    const all = await request.get('/api/jobs');
    expect(all.status).toBe(200);
    expect(all.body.jobs).toHaveLength(3);

    const open = await request.get('/api/jobs?status=Open');
    expect(open.body.jobs.map((j) => j.job_title)).not.toContain('Old Role');

    const byTitle = await request.get('/api/jobs?q=backend');
    expect(byTitle.body.jobs.map((j) => j.job_title)).toEqual(['Backend Engineer']);

    const bySkill = await request.get('/api/jobs?skill_key=NODE.JS');
    expect(bySkill.body.jobs.map((j) => j.job_title)).toEqual(['Backend Engineer']);
    expect(bySkill.body.jobs[0].requirement_count).toBe(1);

    const paged = await request.get('/api/jobs?limit=1&skip=1');
    expect(paged.body.jobs).toHaveLength(1);
    expect(paged.body).toMatchObject({ limit: 1, skip: 1 });

    expect((await request.get('/api/jobs?limit=101')).status).toBe(400);
    expect((await request.get('/api/jobs?status=Archived')).status).toBe(400);
  });

  it('reads one job with requirements, 404 when unknown', async () => {
    const job = await postJob({
      job_title: 'Graph Engineer',
      closing_date: '2026-12-31',
      requirements: [
        { name: 'Neo4j', min_proficiency: 4, mandatory: true },
        { name: 'Node.js' },
      ],
    });

    const res = await request.get(`/api/jobs/${job.job_id}`);
    expect(res.status).toBe(200);
    expect(res.body.job).toMatchObject({ job_title: 'Graph Engineer', job_status: 'Open' });
    expect(res.body.job.requirements).toEqual(
      expect.arrayContaining([
        { skill_key: 'neo4j', name: 'Neo4j', min_proficiency: 4, min_years: null, mandatory: true },
        { skill_key: 'node.js', name: 'Node.js', min_proficiency: null, min_years: null, mandatory: false },
      ]),
    );

    expect((await request.get('/api/jobs/missing')).status).toBe(404);
  });

  it('lets only the owning employer edit or close a job', async () => {
    const job = await postJob({ job_title: 'Editable' });

    const closed = await request
      .patch(`/api/jobs/${job.job_id}`)
      .set('Cookie', [`auth=${ownerToken}`])
      .send({ job_status: 'Closed', salary: 1234 });
    expect(closed.status).toBe(200);
    expect(closed.body.job).toMatchObject({ job_status: 'Closed', salary: 1234 });

    const foreign = await request
      .patch(`/api/jobs/${job.job_id}`)
      .set('Cookie', [`auth=${otherToken}`])
      .send({ job_status: 'Open' });
    expect(foreign.status).toBe(403);
    expect(foreign.body.error.code).toBe('FORBIDDEN');

    expect(
      (await request.patch('/api/jobs/missing').set('Cookie', [`auth=${ownerToken}`]).send({ job_status: 'Closed' }))
        .status,
    ).toBe(404);

    const badDate = await request
      .patch(`/api/jobs/${job.job_id}`)
      .set('Cookie', [`auth=${ownerToken}`])
      .send({ closing_date: '2026-02-30' });
    expect(badDate.status).toBe(400);

    expect(
      (await request.patch(`/api/jobs/${job.job_id}`).set('Cookie', [`auth=${ownerToken}`]).send({}))
        .status,
    ).toBe(400);
  });
});
