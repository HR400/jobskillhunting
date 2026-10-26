/**
 * TEST ONLY — tests/unit/registerSchema.test.js (Ticket 11)
 *
 * zod chrome for registration: strict objects, role-specific profiles, email
 * normalisation, and the 400 VALIDATION_FAILED mapping through the middleware.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerSchema } from '../../src/routes/auth.js';
import { validateBody } from '../../src/middleware/validate.js';
import { requestId } from '../../src/middleware/requestId.js';
import { errorHandler } from '../../src/middleware/errors.js';

const validCandidate = {
  role: 'candidate',
  email: '  Test@Example.COM ',
  password: 'supersecret',
  profile: {
    candidate_type: 'freelancer',
    fname: 'Ada',
    lname: 'Lovelace',
    portfolio_url: 'https://ada.example',
  },
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(requestId);
  app.post('/register', validateBody(registerSchema), (req, res) => res.json(req.body));
  app.use(errorHandler);
  return app;
}

describe('registerSchema', () => {
  it('accepts a valid candidate and normalises the email', () => {
    const parsed = registerSchema.parse(validCandidate);
    expect(parsed.email).toBe('test@example.com');
  });

  it('rejects an unknown role', () => {
    const result = registerSchema.safeParse({ ...validCandidate, role: 'admin' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing candidate_type', () => {
    const { candidate_type, ...profile } = validCandidate.profile;
    const result = registerSchema.safeParse({ ...validCandidate, profile });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields (strict)', () => {
    const result = registerSchema.safeParse({ ...validCandidate, admin: true });
    expect(result.success).toBe(false);
  });

  it('rejects an employer without a company name', () => {
    const result = registerSchema.safeParse({
      role: 'employer',
      email: 'hr@example.com',
      password: 'supersecret',
      profile: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects a short password and a malformed date', () => {
    expect(registerSchema.safeParse({ ...validCandidate, password: 'short' }).success).toBe(false);
    const badDate = {
      ...validCandidate,
      profile: { ...validCandidate.profile, dob: '2026-02-31' },
    };
    expect(registerSchema.safeParse(badDate).success).toBe(false);
  });
});

describe('validateBody', () => {
  it('maps an invalid role to 400 VALIDATION_FAILED with a field path', async () => {
    const res = await request(buildApp())
      .post('/register')
      .send({ ...validCandidate, role: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details.length).toBeGreaterThan(0);
    expect(res.body.error.details[0].path).toBe('role');
  });

  it('passes a valid body through', async () => {
    const res = await request(buildApp()).post('/register').send(validCandidate);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('test@example.com');
  });
});
