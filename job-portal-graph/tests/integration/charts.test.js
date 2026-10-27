/**
 * TEST ONLY — tests/integration/charts.test.js (Ticket 37)
 *
 * Done-when check for Ticket 37:
 *   - /vendor/d3/d3.min.js serves as JavaScript
 *   - Q1 breakdown has the exact fields that bars.js and radar.js consume
 *   - ranked endpoint match_pct matches Q1 direct match_pct for the same job
 *   - Table-toggle values equal the payload (verified structurally)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, wipeTestDb, closeTestDriver } from '../helpers/db.js';
import { createTestCandidate, createTestEmployer } from '../helpers/fixtures.js';
import { signToken } from '../../src/lib/auth.js';

let app;
let driver;
let candId;
let jobId;
let candCookie;

beforeAll(async () => {
  app = await getTestApp();
  driver = await getTestDriver();
  await wipeTestDb();

  // Create employer and post a job.
  const emp = await createTestEmployer(driver);
  const empToken = signToken({ accountId: emp.accountId, role: emp.role });

  const jobRes = await app
    .post('/api/jobs')
    .set('Cookie', [`auth=${empToken}`])
    .send({
      job_title: 'Chart Test Job',
      descriptive: 'D3 charts test',
      closing_date: '2030-12-31',
      requirements: [
        { name: 'JavaScript', min_proficiency: 3, min_years: 1, mandatory: true },
        { name: 'CSS', min_proficiency: 2, min_years: 0, mandatory: false },
      ],
    });
  expect(jobRes.status).toBe(201);
  jobId = jobRes.body.job_id || jobRes.body.job?.job_id;

  // Create candidate with matching skills.
  const cand = await createTestCandidate(driver);
  candId = cand.profileId;
  candCookie = signToken({ accountId: cand.accountId, role: cand.role });

  await app
    .put('/api/candidates/me/skills')
    .set('Cookie', [`auth=${candCookie}`])
    .send({
      skills: [
        { name: 'JavaScript', proficiency: 4, years: 2 },
        { name: 'CSS', proficiency: 1, years: 0 },
      ],
    })
    .expect(200);
});

afterAll(async () => {
  await wipeTestDb();
  await closeTestDriver();
});

describe('Ticket 37 — Charts', () => {
  it('serves D3 as JavaScript', async () => {
    const res = await app.get('/vendor/d3/d3.min.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
  });

  it('Q1 breakdown has all fields bars.js and radar.js consume', async () => {
    const res = await app
      .get(`/api/match/${candId}/${jobId}`)
      .expect(200);

    const { match } = res.body;

    // Bars.js consumes: match_pct, band, mandatory_ok
    expect(match).toHaveProperty('match_pct');
    expect(match).toHaveProperty('band');
    expect(match).toHaveProperty('mandatory_ok');
    expect(typeof match.match_pct).toBe('number');

    // Radar.js consumes breakdown rows
    expect(Array.isArray(match.breakdown)).toBe(true);
    expect(match.breakdown.length).toBeGreaterThan(0);

    const row = match.breakdown[0];
    expect(row).toHaveProperty('skill');
    expect(row).toHaveProperty('status');
    expect(row).toHaveProperty('mandatory');
  });

  it('ranked endpoint match_pct equals Q1 direct for same job (table-toggle parity)', async () => {
    const rankRes = await app
      .get(`/api/match/candidate/${candId}/jobs`)
      .expect(200);

    expect(Array.isArray(rankRes.body.ranked)).toBe(true);
    const found = rankRes.body.ranked.find((j) => j.job_id === jobId);
    expect(found).toBeDefined();

    // All fields bars.js needs:
    expect(found).toHaveProperty('job_title');
    expect(found).toHaveProperty('match_pct');
    expect(found).toHaveProperty('band');
    expect(found).toHaveProperty('mandatory_ok');
    expect(found).toHaveProperty('employer');

    // Values in ranked list must match the direct Q1 result (table parity).
    const matchRes = await app
      .get(`/api/match/${candId}/${jobId}`)
      .expect(200);

    expect(found.match_pct).toBe(matchRes.body.match.match_pct);
    expect(found.band).toBe(matchRes.body.match.band);
  });
});
