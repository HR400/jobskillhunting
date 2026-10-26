/**
 * src/routes/skills.js — skill catalogue routes (Ticket 16).
 *
 * Provides:
 *   - GET /api/skills?q= — search local skill catalogue
 *   - POST /api/skills — user-confirmed skill, normalised to canonical skill_key
 */
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errors.js';
import { executeRead, executeWrite } from '../db/tx.js';
import { Errors } from '../lib/errors.js';
import { skillKey } from '../lib/skillKey.js';
import { SEARCH_SKILLS, UPSERT_SKILL } from '../queries/skills.js';
import { searchEsco, escoAvailable } from '../ingest/esco.js';

export const skillsRouter = Router();

const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'query parameter q is required').max(100),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const postSkillSchema = z
  .object({
    name: z.string().trim().min(1, 'skill name is required').max(100),
    skill_category: z.string().trim().max(100).optional(),
    description: z.string().trim().max(500).optional(),
  })
  .strict();

skillsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const parseResult = searchQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      throw Errors.validation(
        'Invalid query parameters.',
        parseResult.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      );
    }

    const { q, limit } = parseResult.data;
    const qLower = q.toLowerCase();

    const result = await executeRead((tx) =>
      tx.run(SEARCH_SKILLS, { qLower, limit }),
    );

    const skills = result.records.map((r) => ({
      skill_key: r.get('skill_key'),
      name: r.get('name'),
      skill_category: r.get('skill_category') ?? 'General',
      description: r.get('description') ?? null,
      source: 'local',
    }));

    const seen = new Set(skills.map((s) => s.skill_key));
    const suggestions = (await searchEsco(q, limit)).filter((s) => {
      if (seen.has(s.skill_key)) return false;
      seen.add(s.skill_key);
      return true;
    });

    res.json({
      skills: [...skills, ...suggestions],
      capabilities: { esco: escoAvailable() },
    });
  }),
);

skillsRouter.post(
  '/',
  authenticate,
  validateBody(postSkillSchema),
  asyncHandler(async (req, res) => {
    const { name, skill_category = 'General', description = null } = req.body;
    const key = skillKey(name);

    if (!key) {
      throw Errors.validation('Invalid skill name.');
    }

    const result = await executeWrite((tx) =>
      tx.run(UPSERT_SKILL, {
        skillKey: key,
        name: name.trim(),
        skillCategory: skill_category,
        description,
      }),
    );

    const record = result.records[0];
    const isNew = record.get('isNew') === true;

    res.status(isNew ? 201 : 200).json({
      skill: {
        skill_key: record.get('skill_key'),
        name: record.get('name'),
        skill_category: record.get('skill_category'),
        description: record.get('description'),
      },
    });
  }),
);
