/**
 * TEST ONLY — tests/integration/skillDecay.test.js (Ticket 56)
 *
 * With λ = 0 the stored proficiency scores as before. With λ > 0 a skill last
 * used a decade ago falls below a 4/5 requirement in Q1, the ranking, the gap
 * and Q4 — and Q1 reports both the effective value and λ so the UI can show it.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, closeTestDriver, wipeTestDb } from '../helpers/db.js';
import { createTestCandidate, createTestEmployer } from '../helpers/fixtures.js';
import { signToken } from '../../src/lib/auth.js';
import { config } from '../../src/config.js';

const LAMBDA = 0.1;

describe('skill decay (Ticket 56)', () => {
  let driver;
  let request;
  let candidate;
  let employer;
  let jobId;
  const originalLambda = config.SKILL_DECAY_LAMBDA;

  beforeAll(async () => {
    driver = await getTestDriver();
    request = await getTestApp();
  });

  afterAll(async () => {
    config.SKILL_DECAY_LAMBDA = originalLambda;
    await closeTestDriver();
  });

  beforeEach(async () => {
    await wipeTestDb();
    config.SKILL_DECAY_LAMBDA = 0;
    candidate = await createTestCandidate(driver);
    employer = await createTestEmployer(driver);
    jobId = randomUUID();

    const session = driver.session({ database: 'neo4j' });
    try {
      await session.run(
        `MERGE (s:Skill {skill_key: 'rust'}) SET s.name = 'Rust'
         WITH s
         MATCH (c:Candidate {cand_id: $candId})
         MERGE (c)-[:HAS_SKILL {proficiency: 4, years: 6, last_used_year: date().year - 10}]->(s)
         WITH s
         MATCH (e:Employer {emp_id: $empId})
         CREATE (e)-[:POSTED]->(j:Job {
           job_id: $jobId, job_title: 'Rust Systems Engineer', job_status: 'Open',
           posted_date: datetime(), closing_date: '2031-01-01'
         })
         CREATE (j)-[:REQUIRES_SKILL {min_proficiency: 4, min_years: 0, mandatory: true}]->(s)`,
        { candId: candidate.profileId, empId: employer.profileId, jobId },
      );
    } finally {
      await session.close();
    }
  });

  it('scores the stored proficiency when decay is off', async () => {
    const res = await request.get(`/api/match/${candidate.profileId}/${jobId}`);
    expect(res.status).toBe(200);
    expect(res.body.decay).toEqual({ lambda: 0 });
    expect(res.body.match).toMatchObject({ match_pct: 100, band: 'Strong', mandatory_ok: true });
  });

  it('decays the score everywhere and reports the effective value', async () => {
    config.SKILL_DECAY_LAMBDA = LAMBDA;

    const q1 = await request.get(`/api/match/${candidate.profileId}/${jobId}`);
    expect(q1.status).toBe(200);
    expect(q1.body.decay).toEqual({ lambda: LAMBDA });
    expect(q1.body.match.match_pct).toBe(0);
    expect(q1.body.match.band).toBe('Low');

    const row = q1.body.match.breakdown[0];
    expect(row.candidate_proficiency).toBe(4);
    expect(row.years_since_last_used).toBe(10);
    expect(row.effective_proficiency).toBeCloseTo(4 * Math.exp(-LAMBDA * 10), 2);
    expect(row.status).toBe('below');

    const ranking = await request.get(`/api/match/candidate/${candidate.profileId}/jobs`);
    expect(ranking.body.ranked.map((job) => job.job_id)).not.toContain(jobId);

    const gap = await request.get(`/api/gap/${candidate.profileId}/${jobId}`);
    expect(gap.body.gaps[0]).toMatchObject({ skill_key: 'rust', gap_type: 'below' });

    const empToken = signToken({ accountId: employer.accountId, role: 'employer' });
    const recruiter = await request
      .get(`/api/recruiter/${employer.profileId}/recommendations`)
      .set('Cookie', [`auth=${empToken}`]);
    expect(recruiter.status).toBe(200);
    expect(recruiter.body.recommendations.map((r) => r.cand_id)).not.toContain(candidate.profileId);
  });
});
