/**
 * src/routes/applications.js — apply + screening (Ticket 27) and read/update
 * (Ticket 28), plan §8.4 / §9.2.
 *
 *   - POST  /api/applications      — candidate applies (one write transaction)
 *   - GET   /api/applications/me   — candidate's own applications
 *   - PATCH /api/applications/:id  — employer sets status / final_result
 */
import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errors.js';
import { executeRead, executeWrite } from '../db/tx.js';
import { Errors } from '../lib/errors.js';
import { config } from '../config.js';
import { plain, toNumber } from '../lib/queryMeta.js';
import { bandFor } from '../services/matching.js';
import { EXISTS_CANDIDATE_JOB } from '../queries/exists.js';
import { ACCOUNT_BY_ID } from '../queries/session.js';
import { Q1_MATCH } from '../queries/q1Match.js';
import {
  LOCK_JOB,
  FIND_APPLICATION,
  CREATE_APPLICATION,
  MY_APPLICATIONS,
  GET_APPLICATION,
  UPDATE_APPLICATION,
} from '../queries/applications.js';

export const applicationsRouter = Router();

const applySchema = z.object({ jobId: z.string().uuid() }).strict();

applicationsRouter.post(
  '/',
  authenticate,
  requireRole('candidate'),
  validateBody(applySchema),
  asyncHandler(async (req, res) => {
    const { jobId } = req.body;

    const me = await executeRead((tx) =>
      tx.run(ACCOUNT_BY_ID.cypher, { accountId: req.auth.accountId }),
    );
    const candId = me.records[0]?.get('profileId');
    if (!candId) throw Errors.notFound('Candidate not found.');

    const result = await executeWrite(async (tx) => {
      const exists = await tx.run(EXISTS_CANDIDATE_JOB, { candId, jobId });
      const row = exists.records[0];
      if (!row?.get('cand_id')) throw Errors.notFound('Candidate not found.');
      if (!row?.get('job_id')) throw Errors.notFound('Job not found.');

      await tx.run(LOCK_JOB, { jobId });

      // Q1 inside the transaction: screening never trusts a stale score.
      const q1 = await tx.run(Q1_MATCH, { candId, jobId, decayLambda: config.SKILL_DECAY_LAMBDA });
      const scored = q1.records[0];
      const matchPct = scored ? toNumber(scored.get('match_pct')) : null;
      const mandatoryOk = scored ? scored.get('mandatory_ok') : true;
      const breakdown = scored ? plain(scored.get('breakdown')) : [];

      if (matchPct !== null && matchPct < config.SCREEN_THRESHOLD) {
        throw Errors.matchBelowThreshold(
          `Match score below threshold ${config.SCREEN_THRESHOLD}%.`,
          { match_pct: matchPct, threshold: config.SCREEN_THRESHOLD, breakdown },
        );
      }
      if (config.ENFORCE_MANDATORY && !mandatoryOk) {
        throw Errors.mandatorySkillsMissing(
          'Mandatory skills are missing.',
          { breakdown: breakdown.filter((r) => r.mandatory && !r.satisfied) },
        );
      }

      const duplicate = await tx.run(FIND_APPLICATION, { candId, jobId });
      if (duplicate.records.length > 0) throw Errors.alreadyApplied();

      const appId = randomUUID();
      const created = await tx.run(CREATE_APPLICATION, {
        candId,
        jobId,
        appId,
        matchId: randomUUID(),
        band: bandFor(matchPct),
        matchPct,
        assessments: breakdown.map((r) => ({
          skill_key: r.skill_key,
          match_percentage: r.satisfied ? 100 : 0,
          assess_score: r.candidate_proficiency ?? 0,
        })),
      });
      const rec = created.records[0];

      return {
        application: {
          app_id: rec.get('app_id'),
          status: rec.get('status'),
          date: plain(rec.get('date')),
        },
        job: { job_id: jobId, job_title: row.get('job_title') },
        match: {
          scored: scored !== undefined,
          match_pct: matchPct,
          band: bandFor(matchPct),
          mandatory_ok: mandatoryOk,
          breakdown,
        },
      };
    });

    res.status(201).json(result);
  }),
);

applicationsRouter.get(
  '/me',
  authenticate,
  requireRole('candidate'),
  asyncHandler(async (req, res) => {
    const result = await executeRead((tx) =>
      tx.run(MY_APPLICATIONS, { accountId: req.auth.accountId }),
    );
    res.json({
      applications: result.records.map((r) => ({
        app_id: r.get('app_id'),
        status: r.get('status'),
        final_result: r.get('final_result') ?? null,
        date: plain(r.get('date')),
        job_id: r.get('job_id'),
        job_title: r.get('job_title'),
        job_status: r.get('job_status'),
        employer: r.get('employer'),
        match_pct: toNumber(r.get('match_pct')),
        recommendation_level: r.get('recommendation_level'),
      })),
    });
  }),
);

const APPLICATION_STATUS = ['Applied', 'Screening', 'Interview', 'Offered', 'Rejected'];
const FINAL_RESULTS = ['Pending', 'Passed', 'Failed'];

const patchApplicationSchema = z
  .object({
    status: z.enum(APPLICATION_STATUS).optional(),
    final_result: z.enum(FINAL_RESULTS).optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'at least one field is required');

applicationsRouter.patch(
  '/:id',
  authenticate,
  requireRole('employer'),
  validateBody(patchApplicationSchema),
  asyncHandler(async (req, res) => {
    const appId = req.params.id;
    const found = await executeRead((tx) => tx.run(GET_APPLICATION, { appId }));
    if (found.records.length === 0) throw Errors.notFound('Application not found.');

    const updated = await executeWrite((tx) =>
      tx.run(UPDATE_APPLICATION, {
        accountId: req.auth.accountId,
        appId,
        status: req.body.status ?? null,
        finalResult: req.body.final_result ?? null,
      }),
    );
    if (updated.records.length === 0) {
      throw Errors.forbidden('This application is for another employer\'s job.');
    }

    const rec = updated.records[0];
    res.json({
      application: {
        app_id: rec.get('app_id'),
        status: rec.get('status'),
        final_result: rec.get('final_result'),
        cand_id: rec.get('cand_id'),
      },
    });
  }),
);
