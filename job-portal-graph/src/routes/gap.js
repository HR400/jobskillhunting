/**
 * src/routes/gap.js — skill gap (Q2, Ticket 24).
 *
 *   - GET /api/gap/:candId/:jobId — unsatisfied requirements, mandatory first
 *
 * A missing candidate or job is 404 NOT_FOUND, not an empty gap list.
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/errors.js';
import { executeRead } from '../db/tx.js';
import { Errors } from '../lib/errors.js';
import { config } from '../config.js';
import { queryMeta, toNumber } from '../lib/queryMeta.js';
import { Q2_GAP } from '../queries/q2Gap.js';
import { EXISTS_CANDIDATE_JOB } from '../queries/exists.js';

export const gapRouter = Router();

const NUMBER_FIELDS = [
  'required_proficiency',
  'required_years',
  'current_proficiency',
  'current_years',
];

gapRouter.get(
  '/:candId/:jobId',
  asyncHandler(async (req, res) => {
    const { candId, jobId } = req.params;

    const exists = await executeRead((tx) =>
      tx.run(EXISTS_CANDIDATE_JOB, { candId, jobId }),
    );
    const row = exists.records[0];
    if (!row?.get('cand_id')) throw Errors.notFound('Candidate not found.');
    if (!row?.get('job_id')) throw Errors.notFound('Job not found.');

    const params = { candId, jobId, decayLambda: config.SKILL_DECAY_LAMBDA };
    const result = await executeRead((tx) => tx.run(Q2_GAP, params));
    const gaps = result.records.map((record) => {
      const gap = {
        skill_key: record.get('skill_key'),
        skill: record.get('skill'),
        mandatory: record.get('mandatory'),
        gap_type: record.get('gap_type'),
      };
      for (const field of NUMBER_FIELDS) gap[field] = toNumber(record.get(field));
      return gap;
    });

    res.json({
      candId,
      jobId,
      gaps,
      summary: {
        total: gaps.length,
        below: gaps.filter((g) => g.gap_type === 'below').length,
        missing: gaps.filter((g) => g.gap_type === 'missing').length,
      },
      meta: queryMeta({ queryName: 'Q2', cypher: Q2_GAP, params, result }),
    });
  }),
);
