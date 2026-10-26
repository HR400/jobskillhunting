/**
 * src/routes/referrals.js — Q3 referral chain (Ticket 25).
 *
 *   - POST /api/referrals — candidate refers another candidate
 *   - GET  /api/referrals/:candId/chain?maxHops=  (clamped 1–3)
 */
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errors.js';
import { executeRead, executeWrite } from '../db/tx.js';
import { Errors } from '../lib/errors.js';
import { queryMeta, toNumber } from '../lib/queryMeta.js';
import { EXISTS_CANDIDATE } from '../queries/exists.js';
import { ACCOUNT_BY_ID } from '../queries/session.js';
import { Q3_CHAIN, LOOKUP_REFERRAL, CREATE_REFERRAL } from '../queries/q3Referrals.js';

export const referralsRouter = Router();

const createSchema = z.object({ candId: z.string().uuid() }).strict();

referralsRouter.post(
  '/',
  authenticate,
  requireRole('candidate'),
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const toId = req.body.candId;
    const me = await executeRead((tx) =>
      tx.run(ACCOUNT_BY_ID.cypher, { accountId: req.auth.accountId }),
    );
    const fromId = me.records[0]?.get('profileId');
    if (!fromId) throw Errors.notFound('Candidate not found.');
    if (fromId === toId) throw Errors.validation('Cannot refer yourself.', [{ path: 'candId', message: 'must be another candidate' }]);

    const created = await executeWrite(async (tx) => {
      const lookup = await tx.run(LOOKUP_REFERRAL, { fromId, toId });
      const row = lookup.records[0];
      if (!row.get('from_id')) throw Errors.notFound('Candidate not found.');
      if (!row.get('to_id')) throw Errors.notFound('Candidate not found.');
      if (row.get('exists')) throw Errors.conflict('Referral already exists.');
      return tx.run(CREATE_REFERRAL, { fromId, toId });
    });

    const rec = created.records[0];
    res.status(201).json({ from_id: rec.get('from_id'), to_id: rec.get('to_id'), status: rec.get('status') });
  }),
);

referralsRouter.get(
  '/:candId/chain',
  asyncHandler(async (req, res) => {
    const { candId } = req.params;
    const raw = Number(req.query.maxHops);
    const maxHops = Number.isFinite(raw) ? Math.min(3, Math.max(1, Math.trunc(raw))) : 3;

    const exists = await executeRead((tx) => tx.run(EXISTS_CANDIDATE, { candId }));
    if (exists.records.length === 0) throw Errors.notFound('Candidate not found.');

    const params = { candId, maxHops };
    const result = await executeRead((tx) => tx.run(Q3_CHAIN, params));
    res.json({
      candId,
      maxHops,
      chains: result.records.map((r) => ({
        referral_chain: r.get('referral_chain'),
        ids: r.get('ids'),
        hops: toNumber(r.get('hops')),
      })),
      meta: queryMeta({ queryName: 'Q3', cypher: Q3_CHAIN, params, result }),
    });
  }),
);
