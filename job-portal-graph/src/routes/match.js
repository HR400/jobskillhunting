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
import { getDriver } from '../db/driver.js';
import { config } from '../config.js';
import { Errors, AppError } from '../lib/errors.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { bandFor, requirementStatus } from '../services/matching.js';
import { plain, queryMeta, toNumber } from '../lib/queryMeta.js';
import { Q1_MATCH, Q1_SUBGRAPH } from '../queries/q1Match.js';
import { EXISTS_CANDIDATE, EXISTS_CANDIDATE_JOB } from '../queries/exists.js';
import { RANKED_JOBS, UNSCORED_JOBS } from '../queries/candidateRanking.js';
import { WHAT_IF_RANKING } from '../queries/whatIf.js';
import { buildHypotheticalMap, describeWhatIf } from '../services/whatIf.js';
import {
  STREAM_CANDIDATE,
  STREAM_SKILLS,
  STREAM_SCORED_JOBS,
} from '../queries/matchStream.js';

// Ticket 39: per-user stream concurrency cap (plan §9.3 "max 2 concurrent streams per user").
// Map<accountId, Set<res>> — cleaned up on close.
const activeStreams = new Map();

export const matchRouter = Router();

const CANDIDATE_NUMBER_FIELDS = [
  'required_proficiency',
  'required_years',
  'candidate_proficiency',
  'candidate_years',
  'effective_proficiency',
  'years_since_last_used',
];

// Contact details and DOB never belong in a graph payload (§9.1 privacy).
const REDACTED = ['email', 'phone', 'dob', 'house_no', 'street'];

function formatMatch(record) {
  const matchPct = toNumber(record.get('match_pct'));
  return {
    job_id: record.get('job_id'),
    job_title: record.get('job_title'),
    source: record.get('source'),
    source_url: record.get('source_url'),
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

// ── SSE stream (Ticket 39, plan §9.3) ───────────────────────────────────────
//
// GET /api/match/stream?candId=...
//
// Emits: candidate, skill×N, job_scored×N, done
// Heartbeat every 15 s; max 2 concurrent streams per authenticated user.
// On req.close the session is aborted and the stream slot is released.
//
matchRouter.get(
  '/stream',
  authenticate,
  requireRole('candidate'),
  asyncHandler(async (req, res) => {
    const candId = req.query.candId;
    if (!candId || typeof candId !== 'string' || candId.length > 64) {
      throw Errors.validation('candId is required.', [{ path: 'candId', message: 'Must be a non-empty string ≤64 chars.' }]);
    }

    const accountId = req.auth.accountId;

    // Enforce max-2-streams-per-user cap.
    if (!activeStreams.has(accountId)) activeStreams.set(accountId, new Set());
    const userStreams = activeStreams.get(accountId);
    if (userStreams.size >= 2) {
      throw new AppError('RATE_LIMITED', 'Max 2 concurrent streams per user.');
    }
    userStreams.add(res);

    // SSE headers.
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let closed = false;
    let heartbeatTimer = null;
    let neoSession = null;

    function cleanup() {
      closed = true;
      clearInterval(heartbeatTimer);
      userStreams.delete(res);
      if (userStreams.size === 0) activeStreams.delete(accountId);
      if (neoSession) {
        neoSession.close().catch(() => {});
        neoSession = null;
      }
    }

    req.on('close', cleanup);

    function emit(event, data) {
      if (closed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }

    function heartbeat() {
      if (!closed) res.write(': heartbeat\n\n');
    }

    heartbeatTimer = setInterval(heartbeat, 15_000);

    try {
      // Open a session directly so we can abort it on client disconnect.
      neoSession = getDriver().session({
        database: config.NEO4J_DATABASE,
        defaultAccessMode: 'READ',
      });

      // 1. Candidate seed event.
      if (closed) { cleanup(); return; }
      const candResult = await neoSession.run(STREAM_CANDIDATE, { candId });
      if (candResult.records.length === 0) {
        emit('error', { error: { code: 'NOT_FOUND', message: 'Candidate not found.' } });
        cleanup();
        res.end();
        return;
      }
      const cRec = candResult.records[0];
      emit('candidate', {
        node: {
          id: cRec.get('cand_id'),
          fname: cRec.get('fname'),
          lname: cRec.get('lname'),
          candidate_type: cRec.get('candidate_type'),
        },
      });

      // 2. Skill fan-out events (one per held skill).
      if (closed) { cleanup(); return; }
      const skillResult = await neoSession.run(STREAM_SKILLS, { candId });
      for (const r of skillResult.records) {
        if (closed) break;
        emit('skill', {
          node: { id: r.get('skill_key'), skill_key: r.get('skill_key'), name: r.get('name') },
          edge: {
            type: 'HAS_SKILL',
            proficiency: toNumber(r.get('proficiency')),
            years: toNumber(r.get('years')),
            last_used_year: toNumber(r.get('last_used_year')),
          },
        });
      }

      // 3. Job scored events (one per matched job).
      if (closed) { cleanup(); return; }
      const jobResult = await neoSession.run(STREAM_SCORED_JOBS, {
        candId,
        decayLambda: config.SKILL_DECAY_LAMBDA,
      });
      let strong = 0, moderate = 0, low = 0, unscored = 0;

      for (const r of jobResult.records) {
        if (closed) break;
        const matchPct = toNumber(r.get('match_pct'));
        const band = bandFor(matchPct);
        if (band === 'Strong') strong++;
        else if (band === 'Moderate') moderate++;
        else if (band === 'Low') low++;
        else unscored++;

        const reqs = r.get('reqs') || [];
        emit('job_scored', {
          node: { id: r.get('job_id'), job_title: r.get('job_title') },
          employer: { emp_id: r.get('emp_id'), company_name: r.get('employer') },
          edges: reqs,
          breakdown: reqs,
          match_pct: matchPct,
          mandatory_ok: r.get('mandatory_ok'),
          band,
        });
      }

      if (!closed) {
        emit('done', {
          totals: {
            jobs: jobResult.records.length,
            strong,
            moderate,
            low,
            unscored,
          },
          meta: {
            queryName: 'STREAM_SCORED_JOBS',
            generatedAt: new Date().toISOString(),
          },
        });
      }
    } catch {
      if (!closed) {
        emit('error', { error: { code: 'INTERNAL', message: 'Stream error.' } });
      }
    } finally {
      cleanup();
      if (!res.writableEnded) res.end();
    }
  }),
);

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
    const params = { candId, hyp, decayLambda: config.SKILL_DECAY_LAMBDA };
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

    const params = { candId, limit, skip, decayLambda: config.SKILL_DECAY_LAMBDA };
    const [ranked, unscored] = await Promise.all([
      executeRead((tx) => tx.run(RANKED_JOBS, params)),
      executeRead((tx) => tx.run(UNSCORED_JOBS, params)),
    ]);

    const rankedJobs = ranked.records.map((r) => {
      const matchPct = toNumber(r.get('match_pct'));
      const empId = r.get('emp_id');
      return {
        job_id: r.get('job_id'),
        job_title: r.get('job_title'),
        employer: empId ? { emp_id: empId, company_name: r.get('employer') } : null,
        source: r.get('source'),
        source_url: r.get('source_url'),
        total: toNumber(r.get('total')),
        matched: toNumber(r.get('matched')),
        match_pct: matchPct,
        band: bandFor(matchPct),
        mandatory_ok: r.get('mandatory_ok'),
        matched_skills: r.get('matched_skills'),
        matched_skill_keys: r.get('matched_skill_keys'),
      };
    });
    const unscoredJobs = unscored.records.map((r) => {
      const empId = r.get('emp_id');
      return {
        job_id: r.get('job_id'),
        job_title: r.get('job_title'),
        employer: empId ? { emp_id: empId, company_name: r.get('employer') } : null,
        source: r.get('source'),
        source_url: r.get('source_url'),
      };
    });

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
    ];
    const edges = [];
    if (employer) {
      nodes.push({
        id: employer.properties.emp_id,
        type: 'Employer',
        label: employer.properties.company_name,
        props: plain(employer.properties),
      });
      edges.push({
        id: `posted:${employer.properties.emp_id}:${jobId}`,
        from: employer.properties.emp_id,
        to: jobId,
        type: 'POSTED',
        props: {},
        state: 'neutral',
      });
    }

    for (const row of record.get('rows')) {
      if (!row.skill) continue;
      const skill = row.skill.properties;
      const held = row.held
        ? {
            proficiency: toNumber(row.held.properties.proficiency),
            years: toNumber(row.held.properties.years),
            last_used_year: toNumber(row.held.properties.last_used_year),
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
    const params = { candId, jobId, decayLambda: config.SKILL_DECAY_LAMBDA };
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
      decay: { lambda: config.SKILL_DECAY_LAMBDA },
      meta: queryMeta({ queryName: 'Q1', cypher: Q1_MATCH, params, result }),
    });
  }),
);
