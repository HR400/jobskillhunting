/**
 * src/queries/q1Match.js — Q1, real-time skill match score (plan §8.2, Ticket 22).
 *
 * Q1 returns zero rows when the candidate or the job is missing; the route maps
 * that to 404 NOT_FOUND. Pinned to Neo4j 5 syntax.
 */

export const Q1_MATCH = `
MATCH (c:Candidate {cand_id: $candId})
MATCH (j:Job {job_id: $jobId})-[r:REQUIRES_SKILL]->(s:Skill)
OPTIONAL MATCH (c)-[h:HAS_SKILL]->(s)
WITH j, r, s, h,
     (h IS NOT NULL
      AND h.proficiency >= coalesce(r.min_proficiency, 1)
      AND coalesce(h.years, 0) >= coalesce(r.min_years, 0)) AS satisfied
WITH j, collect({
       skill_key: s.skill_key, skill: s.name,
       mandatory: coalesce(r.mandatory, false),
       required_proficiency: r.min_proficiency, required_years: r.min_years,
       candidate_proficiency: h.proficiency, candidate_years: h.years,
       satisfied: satisfied,
       status: CASE WHEN satisfied THEN 'satisfied' WHEN h IS NULL THEN 'missing' ELSE 'below' END
     }) AS rows
WITH j, rows, size(rows) AS total, size([x IN rows WHERE x.satisfied]) AS matched
RETURN j.job_id AS job_id, j.job_title AS job_title, total, matched,
       CASE WHEN total = 0 THEN null ELSE round(100.0 * matched / total, 1) END AS match_pct,
       all(x IN rows WHERE NOT x.mandatory OR x.satisfied) AS mandatory_ok,
       rows AS breakdown
`;

// Same scoring as Q1, shaped for the §9.4 node/edge payload.
export const Q1_SUBGRAPH = `
MATCH (c:Candidate {cand_id: $candId})
MATCH (e:Employer)-[:POSTED]->(j:Job {job_id: $jobId})
OPTIONAL MATCH (j)-[r:REQUIRES_SKILL]->(s:Skill)
OPTIONAL MATCH (c)-[h:HAS_SKILL]->(s)
RETURN c, j, e, collect({ skill: s, req: r, held: h }) AS rows
`;
