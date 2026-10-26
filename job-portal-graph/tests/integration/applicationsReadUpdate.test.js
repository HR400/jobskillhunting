/**
 * TEST ONLY — tests/integration/applicationsReadUpdate.test.js (Ticket 28)
 *
 * GET /api/applications/me returns only the caller's applications; the owning
 * employer can patch status/final_result; candidates and other employers are
 * refused.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, closeTestDriver, wipeTestDb } from '../helpers/db.js';
import { createTestCandidate, createTestEmployer } from '../helpers/fixtures.js';
import { signToken } from '../../src/lib/auth.js';

describe('application read/update (Ticket 28)', () => {
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

  function cookieFor(profile, role) {
    return [`auth=${signToken({ accountId: profile.accountId, role })}`];
  }

  async function seedApplied() {
    const employer = await createTestEmployer(driver);
    const candidate = await createTestCandidate(driver);
    const skills = await request
      .put('/api/candidates/me/skills')
      .set('Cookie', cookieFor(candidate, 'candidate'))
      .send({ skills: [{ name: 'JavaScript', proficiency: 3, years: 2 }] });
    expect(skills.status).toBe(200);

    const job = await request
      .post('/api/jobs')
      .set('Cookie', cookieFor(employer, 'employer'))
      .send({ job_title: 'Read Role', requirements: [{ name: 'JavaScript' }] });
    expect(job.status).toBe(201);

    const applied = await request
      .post('/api/applications')
      .set('Cookie', cookieFor(candidate, 'candidate'))
      .send({ jobId: job.body.job.job_id });
    expect(applied.status).toBe(201);

    return { employer, candidate, jobId: job.body.job.job_id, appId: applied.body.application.app_id };
  }

  it('lists only the caller\'s applications with the match snapshot', async () => {
    const { candidate, jobId, appId } = await seedApplied();
    const other = await createTestCandidate(driver);
    await request
      .put('/api/candidates/me/skills')
      .set('Cookie', cookieFor(other, 'candidate'))
      .send({ skills: [{ name: 'JavaScript', proficiency: 3, years: 2 }] });
    await request
      .post('/api/applications')
      .set('Cookie', cookieFor(other, 'candidate'))
      .send({ jobId });

    const mine = await request
      .get('/api/applications/me')
      .set('Cookie', cookieFor(candidate, 'candidate'));

    expect(mine.status).toBe(200);
    expect(mine.body.applications).toHaveLength(1);
    expect(mine.body.applications[0]).toMatchObject({
      app_id: appId,
      job_id: jobId,
      status: 'Applied',
      final_result: null,
      match_pct: 100,
      recommendation_level: 'Strong',
    });

    const anonymous = await request.get('/api/applications/me');
    expect(anonymous.status).toBe(401);
  });

  it('refuses candidates and unrelated employers, then lets the owner update', async () => {
    const { employer, candidate, appId } = await seedApplied();
    const otherEmployer = await createTestEmployer(driver, { companyName: 'Other' });

    const byCandidate = await request
      .patch(`/api/applications/${appId}`)
      .set('Cookie', cookieFor(candidate, 'candidate'))
      .send({ status: 'Offered' });
    expect(byCandidate.status).toBe(403);

    const byStranger = await request
      .patch(`/api/applications/${appId}`)
      .set('Cookie', cookieFor(otherEmployer, 'employer'))
      .send({ status: 'Offered' });
    expect(byStranger.status).toBe(403);

    const invalid = await request
      .patch(`/api/applications/${appId}`)
      .set('Cookie', cookieFor(employer, 'employer'))
      .send({ status: 'Ghosted' });
    expect(invalid.status).toBe(400);

    const unknown = await request
      .patch('/api/applications/00000000-0000-4000-8000-000000000000')
      .set('Cookie', cookieFor(employer, 'employer'))
      .send({ status: 'Offered' });
    expect(unknown.status).toBe(404);

    const updated = await request
      .patch(`/api/applications/${appId}`)
      .set('Cookie', cookieFor(employer, 'employer'))
      .send({ status: 'Offered', final_result: 'Passed' });
    expect(updated.status).toBe(200);
    expect(updated.body.application).toMatchObject({
      app_id: appId,
      status: 'Offered',
      final_result: 'Passed',
    });

    const listed = await request
      .get('/api/applications/me')
      .set('Cookie', cookieFor(candidate, 'candidate'));
    expect(listed.body.applications[0]).toMatchObject({
      status: 'Offered',
      final_result: 'Passed',
    });
  });
});
