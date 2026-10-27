/**
 * TEST ONLY — tests/integration/phase1Sweep.test.js (Ticket 20)
 *
 * Phase 1 sweep:
 *   - An empty-DB CRUD walkthrough over HTTP: register employer -> post job ->
 *     register candidate -> skills -> delete profile -> logout.
 *   - Every Phase 1 error code is reached live; the codes that cannot be
 *     produced before their features exist are listed and checked for drift.
 *   - Every §9.1 code still maps to its documented status via the real handler.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, closeTestDriver, wipeTestDb } from '../helpers/db.js';
import { AppError, ERROR_STATUS } from '../../src/lib/errors.js';
import { requestId } from '../../src/middleware/requestId.js';
import { errorHandler } from '../../src/middleware/errors.js';

const DEFERRED_CODES = [
  'ALREADY_APPLIED', // ticket 27
  'MATCH_BELOW_THRESHOLD', // ticket 27
  'MANDATORY_SKILLS_MISSING', // ticket 27
  'RATE_LIMITED', // tickets 07/08 unit tests
  'DB_UNAVAILABLE', // ticket 09 unit test
  'QUERY_TIMEOUT', // ticket 07 unit test
  'INTERNAL', // ticket 07 unit test
  'UNAVAILABLE', // ticket 47 ingest-off unit test (ingestCore.test.js)
];

describe('Phase 1 sweep (Ticket 20)', () => {
  let api;
  let hit;

  beforeAll(async () => {
    await getTestDriver();
    api = await getTestApp();
  });

  afterAll(async () => {
    await closeTestDriver();
  });

  beforeEach(async () => {
    await wipeTestDb();
    hit = new Set();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function record(res, expectedStatus) {
    expect(res.status).toBe(expectedStatus);
    if (res.body?.error) hit.add(res.body.error.code);
    return res;
  }

  async function login(email, password) {
    const res = record(
      await api.post('/api/auth/login').send({ email, password }),
      200,
    );
    return res.headers['set-cookie'][0].split(';')[0];
  }

  it('walks an empty database through CRUD', async () => {
    const emptyJobs = record(await api.get('/api/jobs'), 200);
    expect(emptyJobs.body.jobs).toEqual([]);
    record(await api.get('/api/skills?q=node'), 200);

    record(await api.post('/api/auth/register').send({ role: 'employer' }), 400);

    const employer = { email: 'boss@example.com', password: 'password123' };
    record(
      await api.post('/api/auth/register').send({
        ...employer,
        role: 'employer',
        profile: { company_name: 'Sweep Co' },
      }),
      201,
    );
    record(
      await api.post('/api/auth/register').send({
        ...employer,
        role: 'employer',
        profile: { company_name: 'Sweep Co' },
      }),
      409,
    );
    record(
      await api.post('/api/auth/login').send({ ...employer, password: 'wrong-password' }),
      401,
    );
    const employerCookie = await login(employer.email, employer.password);
    record(await api.get('/api/auth/me').set('Cookie', [employerCookie]), 200);

    const job = record(
      await api
        .post('/api/jobs')
        .set('Cookie', [employerCookie])
        .send({
          job_title: 'Sweep Engineer',
          closing_date: '2026-06-30',
          requirements: [{ name: 'Node.js', min_proficiency: 2, mandatory: true }],
        }),
      201,
    ).body.job;

    const candidate = { email: 'cand@example.com', password: 'password123' };
    record(
      await api.post('/api/auth/register').send({
        ...candidate,
        role: 'candidate',
        profile: { candidate_type: 'fresher', fname: 'Sweep', lname: 'Candidate' },
      }),
      201,
    );
    const candidateCookie = await login(candidate.email, candidate.password);

    record(
      await api.post('/api/jobs').set('Cookie', [candidateCookie]).send({ job_title: 'Nope' }),
      403,
    );
    record(
      await api
        .put('/api/candidates/me/skills')
        .set('Cookie', [candidateCookie])
        .send({ skills: [{ name: 'Node.js', proficiency: 9, years: 1 }] }),
      400,
    );
    const skills = record(
      await api
        .put('/api/candidates/me/skills')
        .set('Cookie', [candidateCookie])
        .send({ skills: [{ name: 'Node.js', proficiency: 3, years: 1 }] }),
      200,
    );
    expect(skills.body.skills).toHaveLength(1);
    expect(
      record(await api.get('/api/skills?q=node'), 200).body.skills,
    ).toEqual([expect.objectContaining({ skill_key: 'node.js' })]);
    record(await api.get('/api/candidates/me').set('Cookie', [candidateCookie]), 200);

    const readBack = record(await api.get(`/api/jobs/${job.job_id}`), 200);
    expect(readBack.body.job.requirements[0]).toMatchObject({
      skill_key: 'node.js',
      mandatory: true,
    });

    record(await api.get('/api/nope'), 404);
    record(await api.delete('/api/candidates/me').set('Cookie', [candidateCookie]), 204);
    record(await api.get('/api/candidates/me').set('Cookie', [candidateCookie]), 404);

    const logout = record(
      await api.post('/api/auth/logout').set('Cookie', [employerCookie]),
      204,
    );
    expect(String(logout.headers['set-cookie'])).toMatch(/auth=;.*Expires=/);
    record(await api.get('/api/auth/me'), 401);

    // Every §9.1 code is either reached live here or explicitly deferred.
    expect([...hit].sort()).toEqual([
      'CONFLICT',
      'FORBIDDEN',
      'NOT_FOUND',
      'UNAUTHENTICATED',
      'VALIDATION_FAILED',
    ]);
    expect([...hit, ...DEFERRED_CODES].sort()).toEqual(Object.keys(ERROR_STATUS).sort());
  });

  it('maps every §9.1 code to its documented status through the real handler', async () => {
    const probe = express();
    probe.use(requestId);
    probe.use('/api/:code', (req, res, next) => next(new AppError(req.params.code, 'probe')));
    probe.use(errorHandler);

    for (const [code, status] of Object.entries(ERROR_STATUS)) {
      const res = await request(probe).get(`/api/${code}`);
      expect(res.status).toBe(status);
      expect(res.body.error).toEqual({
        code,
        message: 'probe',
        requestId: expect.any(String),
      });
    }
  });
});
