/**
 * src/routes/careerPath.js — career roadmap (Ticket 53, plan §11.2).
 *
 *   GET /api/career-path/:candId/:jobId
 *
 * Builds a Skill–Skill co-requirement graph from real job requirements and runs
 * GDS Dijkstra from the skills the candidate holds to each missing skill. The
 * weights are the data's; nothing is approximated when GDS is missing.
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/errors.js';
import { executeRead } from '../db/tx.js';
import { Errors } from '../lib/errors.js';
import { getGds } from '../lib/gds.js';
import {
  CAREER_HELD_SKILLS,
  CAREER_MISSING_SKILLS,
  PROJECT_CO_REQUIREMENT_GRAPH,
  DIJKSTRA_PATH,
} from '../queries/careerPath.js';
import { EXISTS_CANDIDATE_JOB } from '../queries/exists.js';
import { pickCareerSteps } from '../services/careerPath.js';

export const careerPathRouter = Router();

const PROJECTION = 'skill-co-requirement';

async function dropProjection() {
  try {
    await executeRead((tx) => tx.run('CALL gds.graph.drop($name, false)', { name: PROJECTION }));
  } catch {
    // A missing projection is the normal first-run case.
  }
}

careerPathRouter.get(
  '/:candId/:jobId',
  asyncHandler(async (req, res) => {
    const { candId, jobId } = req.params;

    const exists = await executeRead((tx) => tx.run(EXISTS_CANDIDATE_JOB, { candId, jobId }));
    const row = exists.records[0];
    if (!row?.get('cand_id')) throw Errors.notFound('Candidate not found.');
    if (!row?.get('job_id')) throw Errors.notFound('Job not found.');
    const jobTitle = row.get('job_title');

    const [heldResult, missingResult] = await Promise.all([
      executeRead((tx) => tx.run(CAREER_HELD_SKILLS, { candId })),
      executeRead((tx) => tx.run(CAREER_MISSING_SKILLS, { candId, jobId })),
    ]);
    const held = heldResult.records.map((r) => ({ id: r.get('id'), skill_key: r.get('skill_key') }));
    const missing = missingResult.records.map((r) => ({
      id: r.get('id'),
      skill_key: r.get('skill_key'),
      name: r.get('name'),
    }));

    const base = {
      candId,
      jobId,
      job_title: jobTitle,
      held_skills: held.map((skill) => skill.skill_key),
      missing_skills: missing.map((skill) => skill.skill_key),
    };

    if (missing.length === 0) {
      res.json({ ...base, steps: [], message: 'You already hold every skill this job requires.' });
      return;
    }

    const gds = await getGds();
    if (!gds.available) {
      res.json({
        ...base,
        unavailable: 'The GDS plugin is not installed on this database, so a career path cannot be computed.',
        steps: [],
      });
      return;
    }

    await dropProjection();
    try {
      await executeRead((tx) => tx.run(PROJECT_CO_REQUIREMENT_GRAPH, { name: PROJECTION }));

      const attempts = [];
      // Shortcut: one Dijkstra per pair; fine for real candidate/job sizes.
      for (const from of held) {
        for (const to of missing) {
          const result = await executeRead((tx) =>
            tx.run(DIJKSTRA_PATH, { name: PROJECTION, source: from.id, target: to.id }),
          );
          const record = result.records[0];
          if (!record) continue;
          attempts.push({
            target: to.skill_key,
            path: record.get('path'),
            weight: record.get('totalCost'),
          });
        }
      }

      res.json({
        ...base,
        method: 'gds.shortestPath.dijkstra',
        gds_version: gds.version,
        steps: pickCareerSteps(missing, attempts),
      });
    } finally {
      await dropProjection();
    }
  }),
);
