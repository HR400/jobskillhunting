/**
 * TEST ONLY — tests/integration/blindRecruiter.test.js (Ticket 54)
 *
 * The recruiter endpoint is the only employer/recruiter view that carries
 * candidates. It must return anonymity at or below the threshold, unmask
 * strictly above it, and log every unmask server-side.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, closeTestDriver, wipeTestDb } from '../helpers/db.js';
import { createTestCandidate, createTestEmployer } from '../helpers/fixtures.js';
import { signToken } from '../../src/lib/auth.js';
import { config } from '../../src/config.js';
import { logger } from '../../src/lib/logger.js';
import { blindRef } from '../../src/lib/blind.js';

describe('GET /api/recruiter/:empId/recommendations — blind hiring (Ticket 54)', () => {
  let driver;
  let request;
  let employer;
  let jobId;
  let open;
  let masked;

  beforeAll(async () => {
    driver = await getTestDriver();
    request = await getTestApp();
  });

  beforeEach(async () => {
    await wipeTestDb();
    employer = await createTestEmployer(driver);
    open = await createTestCandidate(driver, { fname: 'Open', lname: 'Hire', email: 'open@example.test' });
    masked = await createTestCandidate(driver, { fname: 'Masked', lname: 'Person', email: 'masked@example.test' });

    const token = signToken({ accountId: employer.accountId, role: 'employer' });
    const job = await request
      .post('/api/jobs')
      .set('Cookie', [`auth=${token}`])
      .send({ job_title: 'Blind Role', requirements: [] });
    expect(job.status).toBe(201);
    jobId = job.body.job.job_id;

    const session = driver.session({ database: 'neo4j' });
    try {
      await session.executeWrite((tx) =>
        tx.run(
          `UNWIND range(1, 5) AS i
           MERGE (s:Skill {skill_key: 'blind' + toString(i)})
             ON CREATE SET s.name = 'Blind' + toString(i)
           WITH s, i
           MATCH (j:Job {job_id: $jobId})
           MERGE (j)-[:REQUIRES_SKILL {min_proficiency: 1, min_years: 0, mandatory: false}]->(s)`,
          { jobId },
        ),
      );
      // 4/5 = 80% (above the blind threshold) and 3/5 = 60% (above screening, masked).
      for (const [candId, matched] of [
        [open.profileId, 4],
        [masked.profileId, 3],
      ]) {
        await session.executeWrite((tx) =>
          tx.run(
            `UNWIND range(1, $matched) AS i
             MATCH (j:Job {job_id: $jobId})-[:REQUIRES_SKILL]->(s:Skill {skill_key: 'blind' + toString(i)})
             MATCH (c:Candidate {cand_id: $candId})
             MERGE (c)-[:HAS_SKILL {proficiency: 1, years: 0}]->(s)`,
            { jobId, candId, matched },
          ),
        );
      }
    } finally {
      await session.close();
    }
  });

  afterAll(async () => {
    await closeTestDriver();
  });

  it('masks at/below the threshold and unmasks above it, logging the unmask', async () => {
    const spy = vi.spyOn(logger, 'info');
    try {
      const token = signToken({ accountId: employer.accountId, role: 'employer' });
      const res = await request
        .get(`/api/recruiter/${employer.profileId}/recommendations?limit=100`)
        .set('Cookie', [`auth=${token}`]);
      expect(res.status).toBe(200);
      expect(res.body.blindThreshold).toBe(config.BLIND_UNMASK_THRESHOLD);

      const high = res.body.recommendations.find((r) => r.cand_id === open.profileId);
      expect(high.match_pct).toBe(80);
      expect(high.candidate).toMatchObject({ unmasked: true, name: 'Open Hire', email: 'open@example.test' });

      const low = res.body.recommendations.find((r) => r.cand_id === masked.profileId);
      expect(low.match_pct).toBe(60);
      expect(low.candidate).toEqual({
        cand_id: masked.profileId,
        ref: blindRef(masked.profileId),
        unmasked: false,
      });
      expect(JSON.stringify(low)).not.toMatch(/Masked|Person|masked@example/);

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'blind unmask', candId: open.profileId, jobId }),
        'blind unmask',
      );
      expect(spy.mock.calls.filter(([fields]) => fields?.candId === masked.profileId)).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });
});
