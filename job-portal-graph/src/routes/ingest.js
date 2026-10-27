/**
 * src/routes/ingest.js — job-feed ingestion (Ticket 47, plan §4/§9.1).
 *
 *   - GET  /api/ingest            — adapters and whether each is configured
 *   - POST /api/ingest/:adapter/run — fetch + upsert (operator token)
 *
 * There is no admin role in the account model, so the ops endpoint is guarded
 * by `INGEST_ADMIN_TOKEN`; without it the endpoint reports unavailable.
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/errors.js';
import { requireAdminToken } from '../middleware/adminToken.js';
import { Errors } from '../lib/errors.js';
import { getAdapter, listAdapters } from '../ingest/registry.js';
import { ingestJobs } from '../ingest/runner.js';

export const ingestRouter = Router();

ingestRouter.get('/', requireAdminToken, (req, res) => {
  const adapters = listAdapters();
  res.json({ adapters, capabilities: { feeds: adapters.some((a) => a.configured) } });
});

ingestRouter.post(
  '/:adapter/run',
  requireAdminToken,
  asyncHandler(async (req, res) => {
    const adapter = getAdapter(req.params.adapter);
    if (!adapter) throw Errors.notFound(`Unknown adapter: ${req.params.adapter}.`);
    if (!adapter.isConfigured()) {
      throw Errors.unavailable(`${adapter.name} is not configured.`);
    }
    const raw = Number(req.query.limit);
    const limit = Number.isFinite(raw) ? Math.min(100, Math.max(1, Math.trunc(raw))) : 25;
    res.json(await ingestJobs(adapter, { limit }));
  }),
);
