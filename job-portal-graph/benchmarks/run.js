/**
 * benchmarks/run.js — executes Q1–Q4 N times on the real DB (Ticket 59, plan §12).
 * Writes p50/p95/max + DB size + Neo4j version to benchmarks/results/*.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { config } from '../src/config.js';
import { executeRead } from '../src/db/tx.js';
import { verifyConnectivity, closeDriver } from '../src/db/driver.js';
import { calculateStats } from './stats.js';
import { Q1_MATCH } from '../src/queries/q1Match.js';
import { Q2_GAP } from '../src/queries/q2Gap.js';
import { Q3_CHAIN } from '../src/queries/q3Referrals.js';
import { Q4_RECOMMENDATIONS } from '../src/queries/q4Recruiter.js';
import { GET_DB_COUNTS, GET_DBMS_INFO } from '../src/queries/report.js';
import { toNumber } from '../src/lib/queryMeta.js';

async function runBenchmarks() {
  console.log('Connecting to Neo4j...');
  await verifyConnectivity();

  // 1. Fetch DBMS info and DB size
  const meta = await executeRead(async (tx) => {
    const dbmsRes = await tx.run(GET_DBMS_INFO);
    const countsRes = await tx.run(GET_DB_COUNTS);
    const candRes = await tx.run('MATCH (c:Candidate) RETURN c.cand_id AS id LIMIT 1');
    const jobRes = await tx.run('MATCH (j:Job) RETURN j.job_id AS id LIMIT 1');
    const empRes = await tx.run('MATCH (e:Employer) RETURN e.emp_id AS id LIMIT 1');

    return {
      dbms: dbmsRes.records[0],
      counts: countsRes.records[0],
      candId: candRes.records[0]?.get('id') ?? '00000000-0000-0000-0000-000000000000',
      jobId: jobRes.records[0]?.get('id') ?? '00000000-0000-0000-0000-000000000000',
      empId: empRes.records[0]?.get('id') ?? '00000000-0000-0000-0000-000000000000',
    };
  });

  const nodeCount = toNumber(meta.counts?.get('nodeCount')) ?? 0;
  const relCount = toNumber(meta.counts?.get('relCount')) ?? 0;
  const dbInfo = {
    name: meta.dbms?.get('name') ?? 'Neo4j',
    version: meta.dbms?.get('version') ?? '5.x',
    edition: meta.dbms?.get('edition') ?? 'community',
  };

  const iterations = parseInt(process.env.BENCH_ITERATIONS || '20', 10);
  const warmup = 3;
  console.log(`Running benchmarks: ${iterations} iterations (${warmup} warmup) on ${dbInfo.name} ${dbInfo.version} (${nodeCount} nodes, ${relCount} rels)...`);

  const benchmarkQueries = [
    {
      name: 'Q1_MATCH',
      cypher: Q1_MATCH,
      params: { candId: meta.candId, jobId: meta.jobId, decayLambda: config.SKILL_DECAY_LAMBDA },
    },
    {
      name: 'Q2_GAP',
      cypher: Q2_GAP,
      params: { candId: meta.candId, jobId: meta.jobId, decayLambda: config.SKILL_DECAY_LAMBDA },
    },
    {
      name: 'Q3_REFERRALS',
      cypher: Q3_CHAIN,
      params: { candId: meta.candId, maxHops: 3 },
    },
    {
      name: 'Q4_RECRUITER',
      cypher: Q4_RECOMMENDATIONS,
      params: { empId: meta.empId, threshold: 40, limit: 50, decayLambda: config.SKILL_DECAY_LAMBDA },
    },
  ];

  const results = {};

  for (const q of benchmarkQueries) {
    // Warmup
    for (let w = 0; w < warmup; w++) {
      await executeRead((tx) => tx.run(q.cypher, q.params));
    }

    // Measured runs
    const timings = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await executeRead((tx) => tx.run(q.cypher, q.params));
      const elapsed = performance.now() - start;
      timings.push(elapsed);
    }

    results[q.name] = calculateStats(timings);
  }

  // Relational comparison check (Plan §12 item 3)
  const relationalComparison = process.env.RELATIONAL_URL
    ? { configured: true, note: 'RELATIONAL_URL set but driver comparison not executed in this runner' }
    : { configured: false, reason: 'RELATIONAL_URL not configured' };

  const payload = {
    timestamp: new Date().toISOString(),
    iterations,
    neo4j_version: dbInfo.version,
    edition: dbInfo.edition,
    db_info: dbInfo,
    db_size: {
      nodes: nodeCount,
      relationships: relCount,
    },
    benchmarks: results,
    relational: relationalComparison,
  };

  const resultsDir = resolve(process.cwd(), 'benchmarks', 'results');
  mkdirSync(resultsDir, { recursive: true });

  const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
  const timestampPath = resolve(resultsDir, `benchmark-${timestampStr}.json`);
  const latestPath = resolve(resultsDir, 'latest.json');

  writeFileSync(timestampPath, JSON.stringify(payload, null, 2), 'utf8');
  writeFileSync(latestPath, JSON.stringify(payload, null, 2), 'utf8');

  console.log(`\nBenchmark Results (${iterations} iterations):`);
  console.table(results);
  console.log(`Saved results to: ${latestPath}`);

  await closeDriver();
}

// Execute when run directly
if (process.argv[1] && process.argv[1].endsWith('run.js')) {
  runBenchmarks().catch((err) => {
    console.error('Benchmark failed:', err);
    process.exit(1);
  });
}
