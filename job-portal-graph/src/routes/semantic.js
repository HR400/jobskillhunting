/**
 * src/routes/semantic.js — vector search over job text (Ticket 55, plan §11.1).
 *
 *   - GET  /api/search/semantic?q=&limit=  — embed the query, ask the vector index
 *   - POST /api/search/semantic/index      — backfill embeddings (operator token)
 *
 * Without a provider the route answers `unavailable` with the reason; it never
 * invents a vector. Results carry the vector score plus the real job fields.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errors.js';
import { requireAdminToken } from '../middleware/adminToken.js';
import { executeRead, executeWrite } from '../db/tx.js';
import { Errors } from '../lib/errors.js';
import { formatJobNode } from '../queries/jobs.js';
import { embed, embeddingsUnavailableReason } from '../services/embeddings.js';

export const semanticRouter = Router();

const INDEX = 'job_embedding';

const searchSchema = z.object({
  q: z.string().trim().min(2).max(500),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const SEARCH = `
CALL db.index.vector.queryNodes($index, $k, $vector)
YIELD node AS j, score
OPTIONAL MATCH (e:Employer)-[:POSTED]->(j)
RETURN j, score, e.emp_id AS emp_id, e.company_name AS company_name
ORDER BY score DESC
`;

const UNEMBEDDED = `
MATCH (j:Job)
WHERE j.embedding IS NULL AND j.job_title IS NOT NULL
RETURN j.job_id AS job_id, j.job_title AS job_title, j.descriptive AS descriptive
ORDER BY j.job_id
LIMIT $limit
`;

const SET_EMBEDDINGS = `
UNWIND $rows AS row
MATCH (j:Job {job_id: row.job_id})
CALL db.create.setNodeVectorProperty(j, 'embedding', row.embedding)
`;

semanticRouter.get(
  '/semantic',
  asyncHandler(async (req, res) => {
    const parsed = searchSchema.safeParse(req.query);
    if (!parsed.success) {
      throw Errors.validation(
        'Invalid search parameters.',
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }

    const reason = embeddingsUnavailableReason();
    if (reason) {
      res.json({ unavailable: reason, jobs: [] });
      return;
    }

    const { q, limit } = parsed.data;
    const vector = await embed(q);
    const result = await executeRead((tx) =>
      tx.run(SEARCH, { index: INDEX, k: limit, vector }),
    );

    res.json({
      query: q,
      jobs: result.records.map((record) => {
        const empId = record.get('emp_id');
        return formatJobNode(record.get('j').properties, {
          score: record.get('score'),
          employer: empId ? { emp_id: empId, company_name: record.get('company_name') } : null,
        });
      }),
    });
  }),
);

semanticRouter.post(
  '/semantic/index',
  requireAdminToken,
  asyncHandler(async (req, res) => {
    const reason = embeddingsUnavailableReason();
    if (reason) throw Errors.unavailable(reason);

    const raw = Number(req.query.limit);
    const limit = Number.isFinite(raw) ? Math.min(100, Math.max(1, Math.trunc(raw))) : 25;

    const pending = await executeRead((tx) => tx.run(UNEMBEDDED, { limit }));
    const rows = [];
    for (const record of pending.records) {
      const text = `${record.get('job_title')} ${record.get('descriptive') ?? ''}`.trim();
      rows.push({ job_id: record.get('job_id'), embedding: await embed(text) });
    }
    if (rows.length > 0) {
      await executeWrite((tx) => tx.run(SET_EMBEDDINGS, { rows }));
    }

    res.json({ provider: 'openai', embedded: rows.length });
  }),
);
