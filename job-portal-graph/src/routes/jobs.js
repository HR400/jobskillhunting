/**
 * src/routes/jobs.js — job postings (Tickets 18–19).
 *
 *   - POST /api/jobs — employer posts a job with embedded skill requirements
 *   - GET /api/jobs — filters (q, status, employerId, skill_key), pagination
 *   - GET /api/jobs/:id — job with its requirements
 *   - PATCH /api/jobs/:id — owner edits fields or closes the job
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
  CREATE_JOB,
  LIST_JOBS,
  GET_JOB_BY_ID,
  UPDATE_JOB,
  formatJobNode,
  formatRequirement,
} from '../queries/jobs.js';

export const jobsRouter = Router();

const requirementSchema = z
  .object({
    name: z.string().trim().min(1, 'skill name is required').max(100),
    min_proficiency: z.number().int().min(1).max(5).optional().nullable(),
    min_years: z.number().min(0).max(60).optional().nullable(),
    mandatory: z.boolean().default(false),
  })
  .strict();

const createJobSchema = z
  .object({
    job_title: z.string().trim().min(1, 'job title is required').max(200),
    salary: z.number().min(0).max(1_000_000_000).optional().nullable(),
    closing_date: z.iso.date().optional().nullable(),
    descriptive: z.string().trim().max(5000).optional().nullable(),
    requirement_source: z.enum(['employer', 'extracted']).default('employer'),
    requirements: z.array(requirementSchema).max(100).default([]),
  })
  .strict()
  .superRefine((body, ctx) => {
    const keys = body.requirements.map((r) => skillKey(r.name));
    const duplicate = keys.find((key, i) => keys.indexOf(key) !== i);
    if (duplicate) {
      ctx.addIssue({
        code: 'custom',
        path: ['requirements'],
        message: `duplicate skill "${duplicate}"`,
      });
    }
  });

jobsRouter.post(
  '/',
  authenticate,
  requireRole('employer'),
  validateBody(createJobSchema),
  asyncHandler(async (req, res) => {
    const { accountId } = req.auth;
    const jobId = randomUUID();
    const requirements = req.body.requirements.map((r) => ({
      skill_key: skillKey(r.name),
      name: r.name,
      min_proficiency: r.min_proficiency ?? null,
      min_years: r.min_years ?? null,
      mandatory: r.mandatory,
    }));

    const result = await executeWrite((tx) =>
      tx.run(CREATE_JOB, {
        accountId,
        jobId,
        jobTitle: req.body.job_title,
        salary: req.body.salary ?? null,
        closingDate: req.body.closing_date ?? null,
        descriptive: req.body.descriptive ?? null,
        requirementSource: req.body.requirement_source,
        requirements,
      }),
    );

    if (result.records.length === 0) {
      throw Errors.forbidden('No employer profile is linked to this account.');
    }

    const record = result.records[0];
    const job = formatJobNode(record.get('j').properties, {
      emp_id: record.get('emp_id'),
      company_name: record.get('company_name'),
      requirements: requirements.map(formatRequirement),
    });
    res.status(201).json({ job });
  }),
);

const listJobsQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['Open', 'Closed']).optional(),
  employerId: z.string().trim().min(1).max(64).optional(),
  skill_key: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  skip: z.coerce.number().int().min(0).default(0),
});

jobsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = listJobsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw Errors.validation(
        'Invalid query parameters.',
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    const { q, status, employerId, skill_key: skill, limit, skip } = parsed.data;

    const result = await executeRead((tx) =>
      tx.run(LIST_JOBS, {
        q: q ? q.toLowerCase() : null,
        status: status ?? null,
        employerId: employerId ?? null,
        skillKey: skill ? skillKey(skill) : null,
        limit,
        skip,
      }),
    );

    const jobs = result.records.map((record) =>
      formatJobNode(record.get('j').properties, {
        emp_id: record.get('emp_id'),
        company_name: record.get('company_name'),
        requirement_count: record.get('requirement_count').toNumber(),
      }),
    );
    res.json({ jobs, limit, skip });
  }),
);

jobsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = await executeRead((tx) =>
      tx.run(GET_JOB_BY_ID, { jobId: req.params.id }),
    );
    if (result.records.length === 0) throw Errors.notFound('Job not found.');

    const record = result.records[0];
    res.json({
      job: formatJobNode(record.get('j').properties, {
        emp_id: record.get('emp_id'),
        company_name: record.get('company_name'),
        requirements: record.get('requirements').map(formatRequirement),
      }),
    });
  }),
);

const patchJobSchema = z
  .object({
    job_title: z.string().trim().min(1).max(200).optional(),
    salary: z.number().min(0).max(1_000_000_000).optional(),
    closing_date: z.iso.date().optional(),
    descriptive: z.string().trim().max(5000).optional(),
    job_status: z.enum(['Open', 'Closed']).optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'at least one field is required');

jobsRouter.patch(
  '/:id',
  authenticate,
  requireRole('employer'),
  validateBody(patchJobSchema),
  asyncHandler(async (req, res) => {
    const jobId = req.params.id;
    const exists = await executeRead((tx) => tx.run(GET_JOB_BY_ID, { jobId }));
    if (exists.records.length === 0) throw Errors.notFound('Job not found.');

    const result = await executeWrite((tx) =>
      tx.run(UPDATE_JOB, {
        accountId: req.auth.accountId,
        jobId,
        jobTitle: req.body.job_title ?? null,
        salary: req.body.salary ?? null,
        descriptive: req.body.descriptive ?? null,
        jobStatus: req.body.job_status ?? null,
        closingDate: req.body.closing_date ?? null,
      }),
    );
    if (result.records.length === 0) {
      throw Errors.forbidden('This job belongs to another employer.');
    }

    res.json({ job: formatJobNode(result.records[0].get('j').properties) });
  }),
);
