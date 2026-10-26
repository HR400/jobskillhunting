/**
 * src/routes/match.js — match reads: Q1 and its subgraph (Ticket 22).
 *
 *   - GET /api/match/:candId/:jobId            Q1 score + per-requirement breakdown
 *   - GET /api/match/:candId/:jobId/subgraph   §9.4 node/edge payload
 *
 * A missing candidate or job is 404 NOT_FOUND, not 0 %.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errors.js';
import { executeRead } from '../db/tx.js';
import { Errors } from '../lib/errors.js';
import { bandFor, requirementStatus } from '../services/matching.js';
import { plain, queryMeta, toNumber } from '../lib/queryMeta.js';
import { Q1_MATCH, Q1_SUBGRAPH } from '../queries/q1Match.js';
import { EXISTS_CANDIDATE, EXISTS_CANDIDATE_JOB } from '../queries/exists.js';
import { RANKED_JOBS, UNSCORED_JOBS } from '../queries/candidateRanking.js';
import { WHAT_IF_RANKING } from '../queries/whatIf.js';
import { buildHypotheticalMap, describeWhatIf } from '../services/whatIf.js';

export const matchRouter = Router();

const CANDIDATE_NUMBER_FIELDS = [
  'required_proficiency',
  'required_years',
  'candidate_proficiency',
  'candidate_years',
];

// Contact details and DOB never belong in a graph payload (§9.1 privacy).
const REDACTED = ['email', 'phone', 'dob', 'house_no', 'street'];

function formatMatch(record) {
  const matchPct = toNumber(record.get('match_pct'));
  return {
    job_id: record.get('job_id'),
    job_title: record.get('job_title'),
    total: toNumber(record.get('total')),
    matched: toNumber(record.get('matched')),
    match_pct: matchPct,
    band: bandFor(matchPct),
    mandatory_ok: record.get('mandatory_ok'),
    breakdown: record.get('breakdown').map((row) => {
      const out = { ...row };
      for (const field of CANDIDATE_NUMBER_FIELDS) out[field] = toNumber(row[field]);
      return out;
    }),
  };
}

/** 404 for a missing candidate or job; returns the job title when found. */
async function assertCandidateAndJob(candId, jobId) {
  const result = await executeRead((tx) =>
    tx.run(EXISTS_CANDIDATE_JOB, { candId, jobId }),
  );
  const row = result.records[0];
  if (!row?.get('cand_id')) throw Errors.notFound('Candidate not found.');
  if (!row?.get('job_id')) throw Errors.notFound('Job not found.');
  return row.get('job_title');
}

const rankingQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  skip: z.coerce.number().int().min(0).default(0),
});

const whatIfSchema = z
  .object({
    candId: z.string().min(1).max(64),
    hypothetical: z
      .array(
        z.object({
          skill_key: z.string().min(1).max(100),
          proficiency: z.number().int().min(1).max(5),
          years: z.number().int().min(0).max(60),
        }),
      )
      .max(100),
  })
  .strict();

// POST is a separate method, so /what-if cannot be shadowed by the GET routes.
matchRouter.post(
  '/what-if',
  asyncHandler(async (req, res) => {
    const parsed = whatIfSchema.safeParse(req.body);
    if (!parsed.success) {
      throw Errors.validation(
        'Invalid what-if payload.',
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    const { candId, hypothetical } = parsed.data;

    const exists = await executeRead((tx) => tx.run(EXISTS_CANDIDATE, { candId }));
    if (exists.records.length === 0) throw Errors.notFound('Candidate not found.');

    // Read-only: no transaction writes, nothing to roll back (plan §8.5).
    const hyp = buildHypotheticalMap(hypothetical);
    const params = { candId, hyp };
    const result = await executeRead((tx) => tx.run(WHAT_IF_RANKING, params));
    const rows = result.records.map((r) => ({
      job_id: r.get('job_id'),
      job_title: r.get('job_title'),
      emp_id: r.get('emp_id'),
      employer: r.get('employer'),
      total: toNumber(r.get('total')),
      stored_matched: toNumber(r.get('stored_matched')),
      eff_matched: toNumber(r.get('eff_matched')),
      stored_pct: toNumber(r.get('stored_pct')),
      eff_pct: toNumber(r.get('eff_pct')),
      stored_mandatory_ok: r.get('stored_mandatory_ok'),
      eff_mandatory_ok: r.get('eff_mandatory_ok'),
    }));

    const { jobs, summary } = describeWhatIf(rows);
    res.json({
      candId,
      hypothetical,
      jobs,
      summary,
      meta: queryMeta({
        queryName: 'WHAT_IF_RANKING',
        cypher: WHAT_IF_RANKING,
        params,
        result,
      }),
    });
  }),
);

matchRouter.get(
  '/candidate/:candId/jobs',
  asyncHandler(async (req, res) => {
    const parsed = rankingQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw Errors.validation(
        'Invalid query parameters.',
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    const { limit, skip } = parsed.data;
    const { candId } = req.params;

    const exists = await executeRead((tx) => tx.run(EXISTS_CANDIDATE, { candId }));
    if (exists.records.length === 0) throw Errors.notFound('Candidate not found.');

    const params = { candId, limit, skip };
    const [ranked, unscored] = await Promise.all([
      executeRead((tx) => tx.run(RANKED_JOBS, params)),
      executeRead((tx) => tx.run(UNSCORED_JOBS, params)),
    ]);

    const rankedJobs = ranked.records.map((r) => {
      const matchPct = toNumber(r.get('match_pct'));
      return {
        job_id: r.get('job_id'),
        job_title: r.get('job_title'),
        employer: { emp_id: r.get('emp_id'), company_name: r.get('employer') },
        total: toNumber(r.get('total')),
        matched: toNumber(r.get('matched')),
        match_pct: matchPct,
        band: bandFor(matchPct),
        mandatory_ok: r.get('mandatory_ok'),
        matched_skills: r.get('matched_skills'),
      };
    });
    const unscoredJobs = unscored.records.map((r) => ({
      job_id: r.get('job_id'),
      job_title: r.get('job_title'),
      employer: { emp_id: r.get('emp_id'), company_name: r.get('employer') },
    }));

    res.json({
      candId,
      ranked: rankedJobs,
      unscored: unscoredJobs,
      limit,
      skip,
      ...(rankedJobs.length === 0
        ? { message: 'No open jobs matched your current skills.' }
        : {}),
      meta: queryMeta({
        queryName: 'RANKED_JOBS',
        cypher: RANKED_JOBS,
        params,
        result: ranked,
      }),
    });
  }),
);

matchRouter.get(
  '/:candId/:jobId/subgraph',
  asyncHandler(async (req, res) => {
    const { candId, jobId } = req.params;
    const result = await executeRead((tx) => tx.run(Q1_SUBGRAPH, { candId, jobId }));
    if (result.records.length === 0) {
      throw Errors.notFound('Candidate or job not found.');
    }

    const record = result.records[0];
    const candidate = record.get('c');
    const job = record.get('j');
    const employer = record.get('e');

    const candidateProps = plain(candidate.properties);
    for (const field of REDACTED) delete candidateProps[field];

    const nodes = [
      {
        id: candId,
        type: 'Candidate',
        label: `${candidate.properties.fname} ${candidate.properties.lname}`,
        props: candidateProps,
      },
      {
        id: job.properties.job_id,
        type: 'Job',
        label: job.properties.job_title,
        props: plain(job.properties),
      },
      {
        id: employer.properties.emp_id,
        type: 'Employer',
        label: employer.properties.company_name,
        props: plain(employer.properties),
      },
    ];
    const edges = [
      {
        id: `posted:${employer.properties.emp_id}:${jobId}`,
        from: employer.properties.emp_id,
        to: jobId,
        type: 'POSTED',
        props: {},
        state: 'neutral',
      },
    ];

    for (const row of record.get('rows')) {
      if (!row.skill) continue;
      const skill = row.skill.properties;
      const held = row.held
        ? {
            proficiency: toNumber(row.held.properties.proficiency),
            years: toNumber(row.held.properties.years),
          }
        : null;
      const state = requirementStatus(row.req.properties, held);

      nodes.push({
        id: skill.skill_key,
        type: 'Skill',
        label: skill.name,
        props: plain(skill),
      });
      edges.push({
        id: `requires:${jobId}:${skill.skill_key}`,
        from: jobId,
        to: skill.skill_key,
        type: 'REQUIRES_SKILL',
        props: plain(row.req.properties),
        state,
      });
      if (row.held) {
        edges.push({
          id: `has:${candId}:${skill.skill_key}`,
          from: candId,
          to: skill.skill_key,
          type: 'HAS_SKILL',
          props: plain(row.held.properties),
          state,
        });
      }
    }

    res.json({
      nodes,
      edges,
      meta: queryMeta({
        queryName: 'Q1_SUBGRAPH',
        cypher: Q1_SUBGRAPH,
        params: { candId, jobId },
        result,
      }),
    });
  }),
);

matchRouter.get(
  '/:candId/:jobId',
  asyncHandler(async (req, res) => {
    const { candId, jobId } = req.params;
    const jobTitle = await assertCandidateAndJob(candId, jobId);
    const params = { candId, jobId };
    const result = await executeRead((tx) => tx.run(Q1_MATCH, params));

    // Both ids exist: no rows means the job has no requirements → unscored.
    const match =
      result.records.length === 0
        ? {
            job_id: jobId,
            job_title: jobTitle,
            total: 0,
            matched: 0,
            match_pct: null,
            band: 'Unscored',
            mandatory_ok: true,
            breakdown: [],
          }
        : formatMatch(result.records[0]);

    res.json({
      match,
      meta: queryMeta({ queryName: 'Q1', cypher: Q1_MATCH, params, result }),
    });
  }),
);
