/**
 * src/routes/health.js — liveness and readiness probes (plan §9.1).
 *
 * /healthz  — process is alive.
 * /readyz   — `RETURN 1` through the shared driver. A dead database throws
 *             ServiceUnavailableError, which the central error handler maps to
 *             503 DB_UNAVAILABLE.
 */
import { Router } from 'express';
import { executeRead } from '../db/tx.js';
import { asyncHandler } from '../middleware/errors.js';

export const healthRouter = Router();

healthRouter.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

healthRouter.get(
  '/readyz',
  asyncHandler(async (req, res) => {
    await executeRead((tx) => tx.run('RETURN 1 AS ok'));
    res.json({ status: 'ready' });
  }),
);
