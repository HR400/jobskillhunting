/**
 * src/routes/recruiter.js — Q4 recommendations (Ticket 26).
 *
 *   - GET /api/recruiter/:empId/recommendations
 */
import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';
import { executeRead } from '../db/tx.js';
import { Errors } from '../lib/errors.js';
import { config } from '../config.js';
import { bandFor } from '../services/matching.js';
import { queryMeta, toNumber } from '../lib/queryMeta.js';
import { EXISTS_EMPLOYER } from '../queries/exists.js';
import { Q4_RECOMMENDATIONS } from '../queries/q4Recruiter.js';
import { ACCOUNT_BY_ID } from '../queries/session.js';

export const recruiterRouter = Router();

recruiterRouter.get(
  '/:empId/recommendations',
  authenticate,
  requireRole('employer', 'recruiter'),
  asyncHandler(async (req, res) => {
    const { empId } = req.params;
    const raw = Number(req.query.limit);
    const limit = Number.isFinite(raw) ? Math.min(100, Math.max(1, Math.trunc(raw))) : 100;

    const exists = await executeRead((tx) => tx.run(EXISTS_EMPLOYER, { empId }));
    if (exists.records.length === 0) throw Errors.notFound('Employer not found.');

    const me = await executeRead((tx) =>
      tx.run(ACCOUNT_BY_ID.cypher, { accountId: req.auth.accountId }),
    );
    const profileId = me.records[0]?.get('profileId');
    if (req.auth.role === 'employer' && profileId !== empId) throw Errors.forbidden();
    if (req.auth.role === 'recruiter') {
      const reps = await executeRead((tx) =>
        tx.run(
          `MATCH (:Recruiter {rec_id: $recId})-[:REPRESENTS]->(:Employer {emp_id: $empId}) RETURN 1 AS ok`,
          { recId: profileId, empId },
        ),
      );
      if (reps.records.length === 0) throw Errors.forbidden();
    }

    const params = { empId, threshold: config.SCREEN_THRESHOLD, limit };
    const result = await executeRead((tx) => tx.run(Q4_RECOMMENDATIONS, params));
    res.json({
      empId,
      threshold: config.SCREEN_THRESHOLD,
      recommendations: result.records.map((r) => {
        const matchPct = toNumber(r.get('match_pct'));
        return {
          job_id: r.get('job_id'),
          job_title: r.get('job_title'),
          cand_id: r.get('cand_id'),
          match_pct: matchPct,
          band: bandFor(matchPct),
          mandatory_ok: r.get('mandatory_ok'),
          matched_skills: r.get('matched_skills'),
        };
      }),
      meta: queryMeta({ queryName: 'Q4', cypher: Q4_RECOMMENDATIONS, params, result }),
    });
  }),
);
