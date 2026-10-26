/**
 * TEST ONLY — tests/integration/recruiterRecommendations.test.js (Ticket 26)
 *
 * Applicants are excluded; 39.9 % is filtered at SCREEN_THRESHOLD 40;
 * closed and expired jobs are omitted.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, closeTestDriver, wipeTestDb } from '../helpers/db.js';
import { createTestCandidate, createTestEmployer } from '../helpers/fixtures.js';
import { signToken } from '../../src/lib/auth.js';

describe('GET /api/recruiter/:empId/recommendations (Ticket 26)', () => {
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

  async function seedJobSkills(jobId, candId, matched, total, prefix) {
    const session = driver.session({ database: 'neo4j' });
    try {
      await session.executeWrite((tx) =>
        tx.run(
          `UNWIND range(1, $total) AS i
           MERGE (s:Skill {skill_key: $prefix + toString(i)})
             ON CREATE SET s.name = $prefix + toString(i)
           WITH s, i
           MATCH (j:Job {job_id: $jobId})
           MERGE (j)-[:REQUIRES_SKILL {min_proficiency: 1, min_years: 0, mandatory: false}]->(s)
           WITH s, i
           WHERE i <= $matched
           MATCH (c:Candidate {cand_id: $candId})
           MERGE (c)-[:HAS_SKILL {proficiency: 1, years: 0}]->(s)`,
          { candId, jobId, matched, total, prefix },
        ),
      );
    } finally {
      await session.close();
    }
  }

  it('excludes applicants and filters 39.9% at 40, ignoring closed/expired jobs', async () => {
    const employer = await createTestEmployer(driver);
    const empToken = signToken({ accountId: employer.accountId, role: 'employer' });
    const applicant = await createTestCandidate(driver, { fname: 'Ann' });
    const low = await createTestCandidate(driver, { fname: 'Low' });
    const edge = await createTestCandidate(driver, { fname: 'Edge' });

    const forty = await request
      .post('/api/jobs')
      .set('Cookie', [`auth=${empToken}`])
      .send({ job_title: 'Open Role', requirements: [] });
    const pctJob = await request
      .post('/api/jobs')
      .set('Cookie', [`auth=${empToken}`])
      .send({ job_title: 'Percent Role', requirements: [] });
    expect(forty.status).toBe(201);
    const jobId = forty.body.job.job_id;

    const closed = await request
      .post('/api/jobs')
      .set('Cookie', [`auth=${empToken}`])
      .send({ job_title: 'Closed Role', requirements: [{ name: 'Java' }] });
    await request.patch(`/api/jobs/${closed.body.job.job_id}`).set('Cookie', [`auth=${empToken}`]).send({ job_status: 'Closed' });

    const expired = await request
      .post('/api/jobs')
      .set('Cookie', [`auth=${empToken}`])
      .send({ job_title: 'Expired Role', requirements: [{ name: 'Go' }] });
    const session = driver.session({ database: 'neo4j' });
    try {
      await session.executeWrite((tx) =>
        tx.run(`MATCH (j:Job {job_id: $id}) SET j.closing_date = date('2020-01-01')`, {
          id: expired.body.job.job_id,
        }),
      );
      await seedJobSkills(jobId, applicant.profileId, 5, 5, 's');
      await seedJobSkills(jobId, edge.profileId, 2, 5, 's');
      await seedJobSkills(pctJob.body.job.job_id, low.profileId, 67, 168, 'l');
      await session.executeWrite((tx) =>
        tx.run(
          `MATCH (c:Candidate {cand_id: $c}), (j:Job {job_id: $j})
           CREATE (c)-[:APPLIED_TO {app_id: 'app-1', status: 'Applied', date: date()}]->(j)`,
          { c: applicant.profileId, j: jobId },
        ),
      );
    } finally {
      await session.close();
    }

    const res = await request
      .get(`/api/recruiter/${employer.profileId}/recommendations`)
      .set('Cookie', [`auth=${empToken}`]);
    expect(res.status).toBe(200);
    const ids = res.body.recommendations.map((r) => r.cand_id);
    expect(ids).not.toContain(applicant.profileId);
    expect(ids).not.toContain(low.profileId);
    expect(ids).toContain(edge.profileId);
    expect(res.body.recommendations.map((r) => r.job_title)).not.toContain('Closed Role');
    expect(res.body.recommendations.map((r) => r.job_title)).not.toContain('Expired Role');
    expect(res.body.recommendations.find((r) => r.cand_id === edge.profileId).match_pct).toBe(40);

    const other = await createTestEmployer(driver, { companyName: 'Other' });
    const forbidden = await request
      .get(`/api/recruiter/${employer.profileId}/recommendations`)
      .set('Cookie', [`auth=${signToken({ accountId: other.accountId, role: 'employer' })}`]);
    expect(forbidden.status).toBe(403);
  });
});
