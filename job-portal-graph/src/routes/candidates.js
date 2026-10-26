/**
 * src/routes/candidates.js — candidate profile management (Ticket 14 & 15).
 *
 * Provides:
 *   - GET /api/candidates/me
 *   - PUT /api/candidates/me
 *   - DELETE /api/candidates/me
 *   - PUT /api/candidates/me/skills (atomic replace)
 *   - POST /api/candidates/me/education
 *   - DELETE /api/candidates/me/education/:eduId
 *
 * Strict role gating, input validation, and ownership enforcement.
 */
import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errors.js';
import { executeRead, executeWrite } from '../db/tx.js';
import { Errors } from '../lib/errors.js';
import { skillKey } from '../lib/skillKey.js';
import {
  GET_CANDIDATE_PROFILE,
  UPDATE_CANDIDATE_PROFILE,
  DELETE_CANDIDATE_PROFILE,
  formatCandidateNode,
} from '../queries/candidates.js';
import {
  DELETE_CANDIDATE_SKILL_EDGES,
  INSERT_CANDIDATE_SKILLS,
  CREATE_CANDIDATE_EDUCATION,
  DELETE_CANDIDATE_EDUCATION,
  formatEducationNode,
} from '../queries/candidateSkillsEducation.js';

export const candidatesRouter = Router();

// Only authenticated candidates can access /api/candidates/me
candidatesRouter.use(authenticate, requireRole('candidate'));

const updateCandidateSchema = z
  .object({
    fname: z.string().trim().min(1).max(100).optional(),
    lname: z.string().trim().min(1).max(100).optional(),
    phone: z.string().trim().min(1).max(30).optional(),
    house_no: z.string().trim().min(1).max(50).optional(),
    street: z.string().trim().min(1).max(100).optional(),
    gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
    hourly_rate: z.number().min(0).max(100000).optional(),
    portfolio_url: z.string().url().or(z.literal('')).optional(),
    grad_year: z.number().int().min(1950).max(2100).optional(),
    total_exp: z.number().min(0).max(100).optional(),
    current_company: z.string().trim().max(100).optional(),
  })
  .strict();

const candidateSkillSchema = z.object({
  name: z.string().trim().min(1, 'skill name is required').max(100),
  skill_key: z.string().trim().optional(),
  proficiency: z
    .number()
    .int('must be an integer')
    .min(1, 'must be between 1 and 5')
    .max(5, 'must be between 1 and 5'),
  years: z
    .number()
    .min(0, 'must be between 0 and 60')
    .max(60, 'must be between 0 and 60'),
  last_used_year: z
    .number()
    .int()
    .min(1950)
    .max(2100)
    .optional()
    .nullable(),
});

const putSkillsSchema = z
  .object({
    skills: z.array(candidateSkillSchema),
  })
  .strict();

const educationSchema = z
  .object({
    degree: z.string().trim().min(1, 'degree is required').max(100),
    cgpa: z.number().min(0).max(10).optional().nullable(),
    specialization: z.string().trim().min(1).max(100).optional().nullable(),
    university: z.string().trim().min(1, 'university is required').max(150),
    start_year: z.number().int().min(1950).max(2100),
    end_year: z.number().int().min(1950).max(2100).optional().nullable(),
  })
  .strict();

candidatesRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const { accountId } = req.auth;
    const result = await executeRead((tx) =>
      tx.run(GET_CANDIDATE_PROFILE, { accountId }),
    );

    if (result.records.length === 0) {
      throw Errors.notFound('Candidate profile not found.');
    }

    const record = result.records[0];
    const candidate = formatCandidateNode(
      record.get('c').properties,
      record.get('labels'),
    );

    res.json({ candidate });
  }),
);

candidatesRouter.put(
  '/me',
  validateBody(updateCandidateSchema),
  asyncHandler(async (req, res) => {
    const { accountId } = req.auth;
    const updates = req.body;

    const result = await executeWrite((tx) =>
      tx.run(UPDATE_CANDIDATE_PROFILE, { accountId, updates }),
    );

    if (result.records.length === 0) {
      throw Errors.notFound('Candidate profile not found.');
    }

    const record = result.records[0];
    const candidate = formatCandidateNode(
      record.get('c').properties,
      record.get('labels'),
    );

    res.json({ candidate });
  }),
);

candidatesRouter.delete(
  '/me',
  asyncHandler(async (req, res) => {
    const { accountId } = req.auth;
    const result = await executeWrite((tx) =>
      tx.run(DELETE_CANDIDATE_PROFILE, { accountId }),
    );

    const deleted = result.records[0]?.get('deleted')?.toNumber?.() ?? 0;
    if (deleted === 0) {
      throw Errors.notFound('Candidate profile not found.');
    }

    res.status(204).end();
  }),
);

candidatesRouter.put(
  '/me/skills',
  validateBody(putSkillsSchema),
  asyncHandler(async (req, res) => {
    const { accountId } = req.auth;
    const rawSkills = req.body.skills;

    const skills = rawSkills.map((s) => ({
      name: s.name,
      skill_key: s.skill_key || skillKey(s.name),
      proficiency: s.proficiency,
      years: s.years,
      last_used_year: s.last_used_year ?? null,
    }));

    const result = await executeWrite(async (tx) => {
      await tx.run(DELETE_CANDIDATE_SKILL_EDGES, { accountId });
      if (skills.length > 0) {
        const insertRes = await tx.run(INSERT_CANDIDATE_SKILLS, { accountId, skills });
        return insertRes.records.map((r) => ({
          name: r.get('name'),
          skill_key: r.get('skill_key'),
          proficiency:
            typeof r.get('proficiency')?.toNumber === 'function'
              ? r.get('proficiency').toNumber()
              : r.get('proficiency'),
          years:
            typeof r.get('years')?.toNumber === 'function'
              ? r.get('years').toNumber()
              : r.get('years'),
          last_used_year:
            typeof r.get('last_used_year')?.toNumber === 'function'
              ? r.get('last_used_year').toNumber()
              : r.get('last_used_year'),
        }));
      }
      return [];
    });

    res.json({ skills: result });
  }),
);

candidatesRouter.post(
  '/me/education',
  validateBody(educationSchema),
  asyncHandler(async (req, res) => {
    const { accountId } = req.auth;
    const eduId = randomUUID();
    const data = {
      accountId,
      eduId,
      degree: req.body.degree,
      cgpa: req.body.cgpa ?? null,
      specialization: req.body.specialization ?? null,
      university: req.body.university,
      start_year: req.body.start_year,
      end_year: req.body.end_year ?? null,
    };

    const result = await executeWrite((tx) =>
      tx.run(CREATE_CANDIDATE_EDUCATION, data),
    );

    if (result.records.length === 0) {
      throw Errors.notFound('Candidate profile not found.');
    }

    const education = formatEducationNode(result.records[0].get('e').properties);
    res.status(201).json({ education });
  }),
);

candidatesRouter.delete(
  '/me/education/:eduId',
  asyncHandler(async (req, res) => {
    const { accountId } = req.auth;
    const { eduId } = req.params;

    const result = await executeWrite((tx) =>
      tx.run(DELETE_CANDIDATE_EDUCATION, { accountId, eduId }),
    );

    const deleted = result.records[0]?.get('deleted')?.toNumber?.() ?? 0;
    if (deleted === 0) {
      throw Errors.notFound('Education record not found.');
    }

    res.status(204).end();
  }),
);
