/**
 * src/queries/matchStream.js — queries for the SSE match stream (Ticket 39).
 *
 * Plan §9.3: candidate node, then skills, then job_scored per job.
 * Pinned to Neo4j 5 syntax. No Cypher 25-only clauses.
 */

/** Fetch the candidate node fields needed for the seed event. */
export const STREAM_CANDIDATE = `
MATCH (c:Candidate {cand_id: $candId})
RETURN c.cand_id AS cand_id, c.fname AS fname, c.lname AS lname,
       c.candidate_type AS candidate_type
`;

/**
 * Fetch candidate skills for the "fan-out" phase.
 * Returns one row per skill held.
 */
export const STREAM_SKILLS = `
MATCH (c:Candidate {cand_id: $candId})-[h:HAS_SKILL]->(s:Skill)
RETURN s.skill_key AS skill_key, s.name AS name,
       h.proficiency AS proficiency, h.years AS years,
       h.last_used_year AS last_used_year
ORDER BY s.name ASC
`;

/**
 * Fetch ranked scored jobs for the "demand wave" phase.
 * Returns one row per job (Q1-compatible scoring).
 * Mirrors RANKED_JOBS but carries per-requirement breakdown.
 */
export const STREAM_SCORED_JOBS = `
MATCH (c:Candidate {cand_id: $candId})
MATCH (j:Job {job_status: 'Open'})-[r:REQUIRES_SKILL]->(s:Skill)
WHERE j.closing_date IS NULL OR date(j.closing_date) >= date()
MATCH (e:Employer)-[:POSTED]->(j)
WITH c, j, e, count(r) AS total,
     sum(CASE WHEN coalesce(r.mandatory, false) THEN 1 ELSE 0 END) AS mand_total,
     collect({ skill_key: s.skill_key, name: s.name,
               min_proficiency: r.min_proficiency, min_years: r.min_years,
               mandatory: coalesce(r.mandatory, false) }) AS reqs
OPTIONAL MATCH (j)-[r2:REQUIRES_SKILL]->(s2:Skill)<-[h:HAS_SKILL]-(c)
WHERE h.proficiency >= coalesce(r2.min_proficiency, 1)
  AND coalesce(h.years, 0) >= coalesce(r2.min_years, 0)
WITH c, j, e, total, mand_total, reqs, count(r2) AS matched,
     sum(CASE WHEN coalesce(r2.mandatory, false) THEN 1 ELSE 0 END) AS mand_matched,
     collect(s2.name) AS matched_skills
RETURN j.job_id AS job_id, j.job_title AS job_title,
       e.emp_id AS emp_id, e.company_name AS employer,
       total, matched, round(100.0 * matched / total, 1) AS match_pct,
       mand_matched = mand_total AS mandatory_ok,
       matched_skills, reqs
ORDER BY mandatory_ok DESC, match_pct DESC, j.job_title ASC, j.job_id ASC
LIMIT 100
`;
