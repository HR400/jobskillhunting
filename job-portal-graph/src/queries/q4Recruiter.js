/**
 * src/queries/q4Recruiter.js — Q4 recruiter recommendations (plan §8.2).
 *
 * Open, non-expired jobs only; applicants excluded; match_pct >= $threshold.
 * Pinned to Neo4j 5 syntax.
 */
import { effectiveProficiency } from './decay.js';

export const Q4_RECOMMENDATIONS = `
MATCH (e:Employer {emp_id: $empId})-[:POSTED]->(j:Job {job_status: 'Open'})-[r:REQUIRES_SKILL]->(:Skill)
WHERE j.closing_date IS NULL OR date(j.closing_date) >= date()
WITH j, count(r) AS total, sum(CASE WHEN coalesce(r.mandatory,false) THEN 1 ELSE 0 END) AS mand_total
MATCH (j)-[r2:REQUIRES_SKILL]->(s:Skill)<-[h:HAS_SKILL]-(c:Candidate)
WHERE ${effectiveProficiency('h')} >= coalesce(r2.min_proficiency, 1)
  AND coalesce(h.years, 0) >= coalesce(r2.min_years, 0)
  AND NOT (c)-[:APPLIED_TO]->(j)
WITH j, c, total, mand_total, count(r2) AS matched,
     sum(CASE WHEN coalesce(r2.mandatory,false) THEN 1 ELSE 0 END) AS mand_matched,
     collect(s.name) AS matched_skills
WITH j, c, total, matched, matched_skills, mand_matched = mand_total AS mandatory_ok,
     round(100.0 * matched / total, 1) AS match_pct
WHERE match_pct >= $threshold
RETURN j.job_id AS job_id, j.job_title AS job_title,
       c.cand_id AS cand_id, c.fname AS fname, c.lname AS lname, c.dob AS dob,
       c.gender AS gender, c.email AS email, c.phone AS phone,
       match_pct, mandatory_ok, matched_skills
ORDER BY job_id, match_pct DESC
LIMIT toInteger($limit)
`;
