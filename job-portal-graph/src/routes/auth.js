/**
 * src/routes/auth.js — registration, login, logout, session (plan §9.2).
 *
 * Registration is one write transaction: Account + role profile + OWNS_PROFILE.
 * Credentials live only on Account; the profile node never carries a hash.
 */
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { executeRead, executeWrite } from '../db/tx.js';
import {
  clearAuthCookie,
  hashPassword,
  setAuthCookie,
  signToken,
  verifyPassword,
} from '../lib/auth.js';
import { Errors } from '../lib/errors.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';
import { validateBody } from '../middleware/validate.js';
import { REGISTER_QUERIES } from '../queries/register.js';
import { ACCOUNT_BY_ID, LOGIN } from '../queries/session.js';

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const password = z.string().min(8, 'must be at least 8 characters').max(128);
const name = z.string().trim().min(1, 'is required').max(100);
const optionalText = (max) => z.string().trim().max(max).optional();

const candidateFields = {
  fname: name,
  lname: name,
  dob: z.iso.date().optional(),
  gender: optionalText(40),
  house_no: optionalText(40),
  street: optionalText(200),
  phone: optionalText(30),
};

const candidateProfile = z.discriminatedUnion('candidate_type', [
  z
    .object({
      candidate_type: z.literal('freelancer'),
      ...candidateFields,
      hourly_rate: z.number().nonnegative().max(100000).optional(),
      portfolio_url: z.url().max(500).optional(),
    })
    .strict(),
  z
    .object({
      candidate_type: z.literal('fresher'),
      ...candidateFields,
      grad_year: z.number().int().min(1950).max(2100).optional(),
    })
    .strict(),
  z
    .object({
      candidate_type: z.literal('experienced'),
      ...candidateFields,
      total_exp: z.number().min(0).max(60).optional(),
      current_company: optionalText(200),
    })
    .strict(),
]);

export const registerSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('candidate'), email, password, profile: candidateProfile }).strict(),
  z
    .object({
      role: z.literal('employer'),
      email,
      password,
      profile: z
        .object({
          company_name: name,
          website: z.url().max(500).optional(),
          headquarters: optionalText(200),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      role: z.literal('recruiter'),
      email,
      password,
      profile: z
        .object({ agency_name: name, lic_no: optionalText(100) })
        .strict(),
    })
    .strict(),
]);

export const loginSchema = z
  .object({
    email,
    password: z.string().min(1, 'is required').max(128),
  })
  .strict();

export const authRouter = Router();

authRouter.post(
  '/register',
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const { email, password, role, profile } = req.body;
    const query = REGISTER_QUERIES[role === 'candidate' ? profile.candidate_type : role];

    const params = {
      accountId: randomUUID(),
      profileId: randomUUID(),
      email,
      role,
      passwordHash: await hashPassword(password),
      // Optional fields default to null so every $param the query names exists.
      dob: null,
      gender: null,
      house_no: null,
      street: null,
      phone: null,
      hourly_rate: null,
      portfolio_url: null,
      grad_year: null,
      total_exp: null,
      current_company: null,
      company_name: null,
      website: null,
      headquarters: null,
      agency_name: null,
      lic_no: null,
      ...profile,
    };

    await executeWrite(async (tx) => {
      try {
        await tx.run(query.cypher, params);
      } catch (err) {
        // Unique index on Account.email is the race-safe duplicate check.
        if (err?.code === 'Neo.ClientError.Schema.ConstraintValidationFailed') {
          throw Errors.conflict('An account with this email already exists.');
        }
        throw err;
      }
    });

    res.status(201).json({
      accountId: params.accountId,
      role,
      profileId: params.profileId,
    });
  }),
);

authRouter.post(
  '/login',
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { records } = await executeRead((tx) => tx.run(LOGIN.cypher, req.body));
    const account = records[0];
    // Same message for unknown email and wrong password — never reveal which.
    const ok = account && (await verifyPassword(account.get('passwordHash'), req.body.password));
    if (!ok) throw Errors.unauthenticated('Invalid email or password.');

    const session = {
      accountId: account.get('accountId'),
      role: account.get('role'),
      profileId: account.get('profileId'),
    };
    setAuthCookie(res, signToken(session));
    res.json(session);
  }),
);

authRouter.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const { records } = await executeRead((tx) =>
      tx.run(ACCOUNT_BY_ID.cypher, { accountId: req.auth.accountId }),
    );
    const account = records[0];
    if (!account) throw Errors.unauthenticated('Session no longer valid.');

    res.json({
      accountId: account.get('accountId'),
      email: account.get('email'),
      role: account.get('role'),
      profileId: account.get('profileId'),
    });
  }),
);
