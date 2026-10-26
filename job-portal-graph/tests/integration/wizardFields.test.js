/**
 * TEST ONLY — tests/integration/wizardFields.test.js (Ticket 33)
 *
 * Verifies that registration and profile-update validation errors carry
 * field-path details that the wizard can map onto the exact input.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, wipeTestDb, closeTestDriver } from '../helpers/db.js';
import { createTestCandidate } from '../helpers/fixtures.js';

describe('Wizard field validation (Ticket 33)', () => {
  let app;
  let driver;

  beforeAll(async () => {
    app = await getTestApp();
    driver = await getTestDriver();
    await wipeTestDb();
  });

  afterAll(async () => {
    await wipeTestDb();
  });

  it('register with missing email returns 400 with email path', async () => {
    const res = await app
      .post('/api/auth/register')
      .send({
        password: 'password123456789012345678901234',
        role: 'candidate',
        profile: { candidate_type: 'fresher', fname: 'A', lname: 'B' },
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    const paths = res.body.error.details.map((d) => d.path);
    expect(paths).toContain('email');
  });

  it('register with invalid role returns 400 with role path', async () => {
    const res = await app
      .post('/api/auth/register')
      .send({
        email: 'x@example.com',
        password: 'password123456789012345678901234',
        role: 'admin',
        profile: {},
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('register candidate with missing profile.fname returns 400 with profile path', async () => {
    const res = await app
      .post('/api/auth/register')
      .send({
        email: 'fname-missing@example.com',
        password: 'password123456789012345678901234',
        role: 'candidate',
        profile: { candidate_type: 'fresher', lname: 'B' },
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    const paths = res.body.error.details.map((d) => d.path);
    expect(paths.some((p) => p.includes('fname'))).toBe(true);
  });

  it('PUT /candidates/me with out-of-range hourly_rate returns 400 with field path', async () => {
    const cand = await createTestCandidate(driver, { candidateType: 'freelancer' });
    // Login.
    const loginRes = await app
      .post('/api/auth/login')
      .send({ email: cand.email, password: cand.password });
    expect(loginRes.status).toBe(200);
    const cookie = loginRes.headers['set-cookie'];

    const res = await app
      .put('/api/candidates/me')
      .set('Cookie', cookie)
      .send({ hourly_rate: -1 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    const paths = res.body.error.details.map((d) => d.path);
    expect(paths).toContain('hourly_rate');
  });

  it('PUT /candidates/me with invalid gender returns 400 with gender path', async () => {
    const cand = await createTestCandidate(driver);
    const loginRes = await app
      .post('/api/auth/login')
      .send({ email: cand.email, password: cand.password });
    const cookie = loginRes.headers['set-cookie'];

    const res = await app
      .put('/api/candidates/me')
      .set('Cookie', cookie)
      .send({ gender: 'invalid_value' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    const paths = res.body.error.details.map((d) => d.path);
    expect(paths).toContain('gender');
  });
});
