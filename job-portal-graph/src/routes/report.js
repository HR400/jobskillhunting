/**
 * src/routes/report.js — research report endpoints (Tickets 57, 59).
 *
 * GET /api/report/data — real counts and query subgraphs (Ticket 57).
 */
import { Router } from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { asyncHandler } from '../middleware/errors.js';
import { executeRead } from '../db/tx.js';
import { toNumber, plain } from '../lib/queryMeta.js';
import {
  GET_DB_COUNTS,
  GET_LABEL_COUNTS,
  GET_REL_TYPE_COUNTS,
  FIND_SAMPLE_CANDIDATE_JOB,
  GET_DBMS_INFO,
} from '../queries/report.js';
import { Q1_SUBGRAPH } from '../queries/q1Match.js';
import { requirementStatus } from '../services/matching.js';

export const reportRouter = Router();

const REDACTED = ['email', 'phone', 'dob', 'house_no', 'street'];

reportRouter.get(
  '/data',
  asyncHandler(async (req, res) => {
    const { countsResult, labelsResult, typesResult, dbmsResult, samplePairResult } =
      await executeRead(async (tx) => {
        const counts = await tx.run(GET_DB_COUNTS);
        const labels = await tx.run(GET_LABEL_COUNTS);
        const types = await tx.run(GET_REL_TYPE_COUNTS);
        const dbms = await tx.run(GET_DBMS_INFO);
        const samplePair = await tx.run(FIND_SAMPLE_CANDIDATE_JOB);
        return {
          countsResult: counts,
          labelsResult: labels,
          typesResult: types,
          dbmsResult: dbms,
          samplePairResult: samplePair,
        };
      });

    const totalNodes = toNumber(countsResult.records[0]?.get('nodeCount')) ?? 0;
    const totalRels = toNumber(countsResult.records[0]?.get('relCount')) ?? 0;

    const labelCounts = {};
    for (const record of labelsResult.records) {
      labelCounts[record.get('label')] = toNumber(record.get('count'));
    }

    const typeCounts = {};
    for (const record of typesResult.records) {
      typeCounts[record.get('type')] = toNumber(record.get('count'));
    }

    const dbmsRecord = dbmsResult.records[0];
    const dbInfo = dbmsRecord
      ? {
          name: dbmsRecord.get('name'),
          version: dbmsRecord.get('version'),
          edition: dbmsRecord.get('edition'),
        }
      : { name: 'Neo4j', version: '5.x', edition: 'community' };

    const sampleRow = samplePairResult.records[0];
    if (totalNodes === 0 || !sampleRow) {
      return res.json({
        has_data: false,
        message: 'No data in database to render query subgraph.',
        counts: {
          nodes: totalNodes,
          relationships: totalRels,
          labels: labelCounts,
          types: typeCounts,
        },
        subgraph: null,
        db_info: dbInfo,
      });
    }

    const candId = sampleRow.get('candId');
    const jobId = sampleRow.get('jobId');

    const subgraphResult = await executeRead((tx) =>
      tx.run(Q1_SUBGRAPH, { candId, jobId }),
    );

    if (subgraphResult.records.length === 0) {
      return res.json({
        has_data: true,
        counts: {
          nodes: totalNodes,
          relationships: totalRels,
          labels: labelCounts,
          types: typeCounts,
        },
        subgraph: null,
        db_info: dbInfo,
      });
    }

    const rec = subgraphResult.records[0];
    const candidate = rec.get('c');
    const job = rec.get('j');
    const employer = rec.get('e');

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

    for (const row of rec.get('rows')) {
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
      has_data: true,
      counts: {
        nodes: totalNodes,
        relationships: totalRels,
        labels: labelCounts,
        types: typeCounts,
      },
      subgraph: { nodes, edges },
      db_info: dbInfo,
    });
  }),
);

reportRouter.get(
  '/benchmarks',
  asyncHandler(async (req, res) => {
    const latestPath = resolve(process.cwd(), 'benchmarks', 'results', 'latest.json');
    if (!existsSync(latestPath)) {
      return res.json({
        available: false,
        message: 'No benchmark results yet. Run `npm run bench` to measure latencies on the running database.',
      });
    }

    try {
      const content = readFileSync(latestPath, 'utf8');
      const data = JSON.parse(content);
      res.json({
        available: true,
        ...data,
      });
    } catch {
      res.json({
        available: false,
        message: 'Unable to parse latest benchmark results file.',
      });
    }
  }),
);
