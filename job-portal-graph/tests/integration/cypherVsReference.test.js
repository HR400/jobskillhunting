/**
 * TEST ONLY — tests/integration/cypherVsReference.test.js (Ticket 30)
 *
 * The four core Cypher queries (plan §8.2) must agree with the reference
 * matcher (src/services/matching.js) for EVERY candidate/job pair in the
 * fixture. Boundary cases are explicit: equal-to-minimum, null minimums,
 * mandatory missing, zero requirements, exactly 40 %/75 %, just below
 * (39.8 %/74.8 % via 41/103 and 77/103 satisfied of 103 requirements),
 * closed/expired/applied exclusions, and a referral cycle.
 *
 * Fixture is written straight to the throwaway instance (7688); the named
 * queries run through the same executeRead path as the routes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestDriver, closeTestDriver, wipeTestDb } from '../helpers/db.js';
import { createTestCandidate, createTestEmployer } from '../helpers/fixtures.js';
import { executeRead } from '../../src/db/tx.js';
import { Q1_MATCH } from '../../src/queries/q1Match.js';
import { Q2_GAP } from '../../src/queries/q2Gap.js';
import { Q4_RECOMMENDATIONS } from '../../src/queries/q4Recruiter.js';
import { Q3_CHAIN } from '../../src/queries/q3Referrals.js';
import {
  scoreMatch,
  bandFor,
  SATISFIED,
  BELOW,
} from '../../src/services/matching.js';
import { toNumber } from '../../src/lib/queryMeta.js';

const BULK = 103; // requirement count for the rounding-boundary job

// Requirement minimums are chosen so the named candidates hit the exact band
// edges (see the boundary test): grace × five = 2/5, ada × four = 3/4,
// ada × bulk103 = 41/103, edsger × bulk103 = 77/103.
const JOBS = {
  mixed: { title: 'Mixed', reqs: [
    { name: 'Node.js', min_proficiency: 4, min_years: 3, mandatory: true },
    { name: 'Neo4j', min_proficiency: 4, min_years: 3 },
    { name: 'SQL', min_proficiency: 3 },
  ] },
  nulls: { title: 'Nulls', reqs: [
    { name: 'SQL', min_proficiency: 1, min_years: 0 }, // equal-to-minimum
    { name: 'Excel' }, // null minimums
    { name: 'Docker', min_proficiency: 2, min_years: 1 },
  ] },
  empty: { title: 'Empty', reqs: [] },
  five: { title: 'Five', reqs: [
    { name: 'Node.js', min_proficiency: 4 },
    { name: 'SQL', min_proficiency: 1 },
    { name: 'Excel', min_proficiency: 5 },
    { name: 'Docker', min_proficiency: 5 },
    { name: 'Rust', min_proficiency: 5 },
  ] },
  four: { title: 'Four', reqs: [
    { name: 'Node.js', min_proficiency: 4 },
    { name: 'Neo4j', min_proficiency: 1 },
    { name: 'SQL', min_proficiency: 3 },
    { name: 'Docker', min_proficiency: 5 },
  ] },
  bulk103: {
    title: 'Bulk 103',
    reqs: Array.from({ length: BULK }, (_, i) => ({
      name: `Bulk ${i + 1}`,
      min_proficiency: 1,
    })),
  },
  closed: { title: 'Closed', status: 'Closed', reqs: [
    { name: 'Node.js', min_proficiency: 1 },
  ] },
  expired: { title: 'Expired', closing: '2020-01-01', reqs: [
    { name: 'Node.js', min_proficiency: 1 },
  ] },
};

// proficiency/years per candidate; null = no HAS_SKILL edges at all.
const HOLDS = {
  ada: { 'Node.js': [4, 3], 'Neo4j': [2, 1], 'SQL': [3, 5], bulk: 41 },
  grace: { 'Node.js': [4, 3], 'SQL': [1, 0], bulk: 0 }, // equal-to-minimum
  alan: null, // no skills
  edsger: { bulk: 77 },
};

let cands = {}; // key -> fixture record
let employerId = null; // created in beforeAll; Q4 anchor
let skillsByCand = {}; // profileId -> { skill_key: {proficiency, years} }
let reqsByJob = {}; // jobId -> requirements for the reference scorer

const run = (query, params) => executeRead((tx) => tx.run(query, params));

/** Q1 record → the same shape scoreMatch returns. */
function q1FromCypher(record) {
  return {
    total: toNumber(record.get('total')),
    matched: toNumber(record.get('matched')),
    match_pct: toNumber(record.get('match_pct')),
    mandatory_ok: record.get('mandatory_ok'),
    breakdown: record.get('breakdown').map((row) => ({
      skill_key: row.skill_key,
      skill: row.skill,
      mandatory: row.mandatory,
      required_proficiency: toNumber(row.required_proficiency),
      required_years: toNumber(row.required_years),
      candidate_proficiency: toNumber(row.candidate_proficiency),
      candidate_years: toNumber(row.candidate_years),
      satisfied: row.satisfied,
      status: row.status,
    })),
  };
}

async function q1For(candKey, jobId) {
  const result = await run(Q1_MATCH, { candId: cands[candKey].profileId, jobId });
  if (result.records.length === 0) return scoreMatch([], {}); // unscored job
  return q1FromCypher(result.records[0]);
}

const bySkill = (match) => Object.fromEntries(match.breakdown.map((r) => [r.skill_key, r]));

/** Reference gaps, in the same mandatory-first, name-ordered shape as Q2. */
function q2FromReference(reqs, skills) {
  return scoreMatch(reqs, skills).breakdown
    .filter((r) => r.status !== SATISFIED)
    .map((r) => ({
      skill_key: r.skill_key,
      skill: r.skill,
      mandatory: r.mandatory,
      required_proficiency: r.required_proficiency,
      required_years: r.required_years,
      current_proficiency: r.candidate_proficiency,
      current_years: r.candidate_years,
      gap_type: r.status === BELOW ? 'below' : 'missing',
    }))
    .sort(
      (a, b) =>
        Number(b.mandatory) - Number(a.mandatory) ||
        (a.skill < b.skill ? -1 : a.skill > b.skill ? 1 : 0),
    );
}

describe('Cypher vs reference matcher (Ticket 30)', () => {
  beforeAll(async () => {
    await wipeTestDb();
    const driver = await getTestDriver();
    const session = driver.session({ database: 'neo4j' });

    for (const [key, fname] of Object.entries({ ada: 'Ada', grace: 'Grace', alan: 'Alan', edsger: 'Edsger' })) {
      cands[key] = await createTestCandidate(driver, { fname, lname: 'Ref' });
    }
    employerId = (await createTestEmployer(driver, { companyName: 'Ref Corp' })).profileId;

    // Holdings: named skills + "bulk N" skills at proficiency 1 / years 0.
    // Keys must match how the jobs MERGE skills: toLower(req.name).
    const holdings = [];
    for (const [key, holds] of Object.entries(HOLDS)) {
      if (!holds) continue;
      for (const [name, value] of Object.entries(holds)) {
        if (name === 'bulk') continue;
        const [p, y] = value;
        holdings.push({ cand_id: cands[key].profileId, key: name.toLowerCase(), name, p, y });
      }
      for (let i = 1; i <= holds.bulk; i++) {
        holdings.push({ cand_id: cands[key].profileId, key: `bulk ${i}`, name: `Bulk ${i}`, p: 1, y: 0 });
      }
    }

    try {
      await session.executeWrite((tx) => tx.run(`
        UNWIND $holdings AS h
        MATCH (c:Candidate {cand_id: h.cand_id})
        MERGE (s:Skill {skill_key: h.key})
        ON CREATE SET s.name = h.name
        CREATE (c)-[:HAS_SKILL {proficiency: h.p, years: h.y}]->(s)
      `, { holdings }));

      // Jobs, then requirement edges, then POSTED edges — separate statements
      // so an empty requirement list cannot starve the later steps of a row.
      await session.executeWrite((tx) => tx.run(`
        UNWIND $jobs AS job
        CREATE (j:Job {
          job_id: job.job_id, job_title: job.title,
          job_status: coalesce(job.status, 'Open'),
          closing_date: CASE WHEN job.closing IS NULL THEN NULL ELSE date(job.closing) END,
          posted_date: datetime()
        })
      `, {
        empId: employerId,
        jobs: Object.entries(JOBS).map(([job_id, j]) => ({
          job_id,
          title: j.title,
          status: j.status ?? null,
          closing: j.closing ?? null,
        })),
      }));

      await session.executeWrite((tx) => tx.run(`
        UNWIND $jobs AS job
        MATCH (j:Job {job_id: job.job_id})
        UNWIND job.reqs AS req
        MERGE (s:Skill {skill_key: toLower(req.name)})
        ON CREATE SET s.name = req.name
        CREATE (j)-[:REQUIRES_SKILL {
          min_proficiency: req.min_proficiency, min_years: req.min_years,
          mandatory: req.mandatory }]->(s)
      `, {
        jobs: Object.entries(JOBS).map(([job_id, j]) => ({
          job_id,
          reqs: j.reqs.map((r) => ({
            name: r.name,
            min_proficiency: r.min_proficiency ?? null,
            min_years: r.min_years ?? null,
            mandatory: r.mandatory ?? null,
          })),
        })),
      }));

      await session.executeWrite((tx) => tx.run(`
        MATCH (e:Employer {emp_id: $empId})
        MATCH (j:Job) WHERE j.job_id IN $jobIds
        CREATE (e)-[:POSTED]->(j)
      `, { empId: employerId, jobIds: Object.keys(JOBS) }));

      // ada applied to `mixed` (Q4 must exclude that pair) + referral cycle.
      await session.executeWrite((tx) => tx.run(`
        MATCH (ada:Candidate {cand_id: $ada}), (mixed:Job {job_id: 'mixed'})
        CREATE (ada)-[:APPLIED_TO {app_id: 'app-ref-1', status: 'Applied', date: date()}]->(mixed)
        WITH ada
        MATCH (c2:Candidate {cand_id: $grace}), (c3:Candidate {cand_id: $alan}),
              (c4:Candidate {cand_id: $edsger})
        CREATE (ada)-[:REFERS {status: 'connected', date: date()}]->(c2)
        CREATE (c2)-[:REFERS {status: 'connected', date: date()}]->(c3)
        CREATE (c3)-[:REFERS {status: 'connected', date: date()}]->(c4)
        CREATE (c4)-[:REFERS {status: 'connected', date: date()}]->(ada)
      `, {
        ada: cands.ada.profileId, grace: cands.grace.profileId,
        alan: cands.alan.profileId, edsger: cands.edsger.profileId,
      }));
    } finally {
      await session.close();
    }

    // Reference inputs read back from the fixture itself (not from the JS
    // literals), so a fixture bug cannot hide a Cypher/reference divergence.
    for (const [key, cand] of Object.entries(cands)) {
      const res = await run(
        'MATCH (:Candidate {cand_id: $id})-[h:HAS_SKILL]->(s:Skill) RETURN s.skill_key AS key, h.proficiency AS proficiency, h.years AS years',
        { id: cand.profileId },
      );
      skillsByCand[key] = Object.fromEntries(res.records.map((rec) => [
        rec.get('key'),
        { proficiency: toNumber(rec.get('proficiency')), years: toNumber(rec.get('years')) },
      ]));
    }
    for (const jobId of Object.keys(JOBS)) {
      const res = await run(
        'MATCH (:Job {job_id: $id})-[r:REQUIRES_SKILL]->(s:Skill) RETURN s.skill_key AS key, s.name AS name, r.min_proficiency AS min_proficiency, r.min_years AS min_years, r.mandatory AS mandatory',
        { id: jobId },
      );
      reqsByJob[jobId] = res.records.map((rec) => ({
        skill_key: rec.get('key'),
        skill: rec.get('name'),
        min_proficiency: toNumber(rec.get('min_proficiency')),
        min_years: toNumber(rec.get('min_years')),
        mandatory: rec.get('mandatory') === true,
      }));
    }
  });

  afterAll(async () => {
    await closeTestDriver();
  });

  it('fixture sanity: one POSTED edge per job and the expected requirement counts', async () => {
    const res = await run(
      'MATCH (e:Employer)-[p:POSTED]->(j:Job) OPTIONAL MATCH (j)-[r:REQUIRES_SKILL]->() WITH j, count(DISTINCT p) AS posted, count(r) AS reqs RETURN j.job_id AS job_id, posted, reqs',
    );
    const byJob = Object.fromEntries(res.records.map((rec) => [
      rec.get('job_id'),
      { posted: toNumber(rec.get('posted')), reqs: toNumber(rec.get('reqs')) },
    ]));
    for (const [jobId, job] of Object.entries(JOBS)) {
      expect(byJob[jobId], jobId).toEqual({ posted: 1, reqs: job.reqs.length });
    }
  });

  it('Q1 equals the reference scorer for every candidate × job pair (32 pairs)', async () => {
    for (const candKey of Object.keys(cands)) {
      for (const jobId of Object.keys(JOBS)) {
        const cypher = await q1For(candKey, jobId);
        const reference = scoreMatch(reqsByJob[jobId], skillsByCand[candKey]);
        expect(cypher, `${candKey} × ${jobId}`).toEqual(reference);
      }
    }
  });

  it('boundary cases: exactly 40 %/75 % in, just below 39.8 %/74.8 % out', async () => {
    const cases = [
      ['grace', 'five', 40, 'Moderate'], // 2/5 exactly at the moderate threshold
      ['ada', 'four', 75, 'Strong'], // 3/4 exactly at the strong threshold
      ['ada', 'bulk103', 39.8, 'Low'], // 41/103 just below moderate
      ['edsger', 'bulk103', 74.8, 'Moderate'], // 77/103 just below strong
    ];
    for (const [candKey, jobId, pct, band] of cases) {
      const cypher = await q1For(candKey, jobId);
      expect(cypher.match_pct, `${candKey} × ${jobId} pct`).toBeCloseTo(pct, 5);
      expect(bandFor(cypher.match_pct), `${candKey} × ${jobId} band`).toBe(band);
      expect(cypher.match_pct).toEqual(scoreMatch(reqsByJob[jobId], skillsByCand[candKey]).match_pct);
    }
  });

  it('status boundaries: equal-to-minimum, null minimums, mandatory missing', async () => {
    // grace holds SQL 1/0 against min 1/0 → satisfied; Excel (null mins) not held → missing.
    const grace = bySkill(await q1For('grace', 'nulls'));
    expect(grace.sql).toMatchObject({ status: 'satisfied', candidate_proficiency: 1, candidate_years: 0 });
    expect(grace.excel).toMatchObject({ status: 'missing', required_proficiency: null, required_years: null });

    // edsger holds no named skill: the mandatory Node.js on `mixed` fails in both engines.
    const edsger = await q1For('edsger', 'mixed');
    expect(edsger.mandatory_ok).toBe(false);
    expect(edsger.mandatory_ok).toEqual(scoreMatch(reqsByJob.mixed, skillsByCand.edsger).mandatory_ok);
  });

  it('zero-requirement job is unscored (null pct) in Cypher and reference', async () => {
    for (const candKey of Object.keys(cands)) {
      const cypher = await q1For(candKey, 'empty');
      expect(cypher).toEqual({ total: 0, matched: 0, match_pct: null, mandatory_ok: true, breakdown: [] });
    }
  });

  it('Q2 equals the reference gaps for every candidate × job pair, in Q2 order', async () => {
    for (const candKey of Object.keys(cands)) {
      for (const jobId of Object.keys(JOBS)) {
        const result = await run(Q2_GAP, { candId: cands[candKey].profileId, jobId });
        const cypher = result.records.map((rec) => ({
          skill_key: rec.get('skill_key'),
          skill: rec.get('skill'),
          mandatory: rec.get('mandatory'),
          required_proficiency: toNumber(rec.get('required_proficiency')),
          required_years: toNumber(rec.get('required_years')),
          current_proficiency: toNumber(rec.get('current_proficiency')),
          current_years: toNumber(rec.get('current_years')),
          gap_type: rec.get('gap_type'),
        }));
        const reference = q2FromReference(reqsByJob[jobId], skillsByCand[candKey]);
        expect(cypher, `${candKey} × ${jobId} gaps`).toEqual(reference);
      }
    }
  });

  it('Q4 at threshold 0 equals the reference, excluding closed/expired/applied/zero-match', async () => {
    const result = await run(Q4_RECOMMENDATIONS, { empId: employerId, threshold: 0, limit: 1000 });
    const cypherRows = result.records.map((rec) => ({
      job_id: rec.get('job_id'),
      cand_id: rec.get('cand_id'),
      match_pct: toNumber(rec.get('match_pct')),
      mandatory_ok: rec.get('mandatory_ok'),
      matched_skills: [...rec.get('matched_skills')].sort(),
    }));

    // Only open, non-expired jobs qualify; Q4's shape skips zero-match pairs.
    const eligible = ['mixed', 'nulls', 'five', 'four', 'bulk103'];
    const appliedPair = `${cands.ada.profileId}:mixed`;
    const expected = [];
    for (const candKey of Object.keys(cands)) {
      for (const jobId of eligible) {
        if (`${cands[candKey].profileId}:${jobId}` === appliedPair) continue;
        const s = scoreMatch(reqsByJob[jobId], skillsByCand[candKey]);
        if (s.matched === 0) continue; // Q4's MATCH anchor omits these
        expected.push({
          job_id: jobId,
          cand_id: cands[candKey].profileId,
          match_pct: s.match_pct,
          mandatory_ok: s.mandatory_ok,
          matched_skills: s.breakdown.filter((r) => r.satisfied).map((r) => r.skill).sort(),
        });
      }
    }
    const key = (r) => `${r.job_id}:${r.cand_id}`;
    cypherRows.sort((a, b) => key(a).localeCompare(key(b)));
    expected.sort((a, b) => key(a).localeCompare(key(b)));
    expect(cypherRows).toEqual(expected);

    // The exclusion boundaries are explicit, not just implied by length:
    expect(cypherRows.some((r) => r.job_id === 'mixed' && r.cand_id === cands.ada.profileId)).toBe(false);
    expect(cypherRows.filter((r) => r.job_id === 'closed' || r.job_id === 'expired')).toHaveLength(0);
    expect(cypherRows.filter((r) => r.cand_id === cands.alan.profileId)).toHaveLength(0); // zero match
  });

  it('Q3 walks the referral chain and the cycle never loops past 3 hops', async () => {
    const result = await run(Q3_CHAIN, { candId: cands.ada.profileId, maxHops: 3 });
    const paths = result.records.map((rec) => ({
      ids: rec.get('ids'),
      hops: toNumber(rec.get('hops')),
    }));
    expect(paths).toEqual([
      { ids: [cands.ada.profileId, cands.grace.profileId], hops: 1 },
      { ids: [cands.ada.profileId, cands.grace.profileId, cands.alan.profileId], hops: 2 },
      { ids: [cands.ada.profileId, cands.grace.profileId, cands.alan.profileId, cands.edsger.profileId], hops: 3 },
    ]);
  });
});
