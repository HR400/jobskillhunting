/**
 * src/routes/meta.js — public capability flags (Tickets 49–50, plan §9.1).
 *
 * Every flag is derived from the running system: `feeds` from configured
 * adapters, `esco` from config, `gds` from the boot probe, `vector` from the
 * embedding provider. Nothing is assumed on the client.
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/errors.js';
import { listAdapters } from '../ingest/registry.js';
import { getGds } from '../lib/gds.js';
import { config } from '../config.js';
import { embeddingsUnavailableReason } from '../services/embeddings.js';

export const metaRouter = Router();

metaRouter.get(
  '/capabilities',
  asyncHandler(async (req, res) => {
    const configured = listAdapters().filter((adapter) => adapter.configured);
    const gds = await getGds();
    res.json({
      capabilities: {
        esco: config.ENABLE_ESCO,
        feeds: configured.length > 0,
        gds: gds.available,
        gds_version: gds.version,
        vector: embeddingsUnavailableReason() === null,
        adapters: configured.map((adapter) => ({ name: adapter.name, source: adapter.source })),
      },
    });
  }),
);
