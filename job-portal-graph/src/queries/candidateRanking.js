/**
 * src/queries/candidateRanking.js — candidate-centric ranking (plan §8.3, Ticket 23).
 *
 * Open, non-expired jobs with requirements; a job appears only when at least
 * one requirement is satisfied. Jobs with zero requirements are a separate
 * "unscored" list. Pinned to Neo4j 5 syntax.
 */

import { effectiveProficiency } from './decay.js';

export const RANKED_JOBS = `
MATCH (c:Candidate {cand_id: $candId})
MATCH (j:Job {job_status: 'Open'})-[r:REQUIRES_SKILL]->(:Skill)
WHERE j.closing_date IS NULL OR date(j.closing_date) >= date()
WITH c, j, count(r) AS total,
     sum(CASE WHEN coalesce(r.mandatory, false) THEN 1 ELSE 0 END) AS mand_total
MATCH (j)-[r2:REQUIRES_SKILL]->(s:Skill)<-[h:HAS_SKILL]-(c)
WHERE ${effectiveProficiency('h')} >= coalesce(r2.min_proficiency, 1)
  AND coalesce(h.years, 0) >= coalesce(r2.min_years, 0)
WITH c, j, total, mand_total, count(r2) AS matched,
     sum(CASE WHEN coalesce(r2.mandatory, false) THEN 1 ELSE 0 END) AS mand_matched,
     collect(s.name) AS matched_skills, collect(s.skill_key) AS matched_skill_keys
MATCH (j)
OPTIONAL MATCH (e:Employer)-[:POSTED]->(j)
RETURN j.job_id AS job_id, j.job_title AS job_title,
       e.emp_id AS emp_id, e.company_name AS employer,
       j.source AS source, j.source_url AS source_url,
       total, matched, round(100.0 * matched / total, 1) AS match_pct,
       mand_matched = mand_total AS mandatory_ok,
       matched_skills, matched_skill_keys
ORDER BY mandatory_ok DESC, match_pct DESC, j.job_title ASC, j.job_id ASC
SKIP toInteger($skip) LIMIT toInteger($limit)
`;

export const UNSCORED_JOBS = `
MATCH (j:Job {job_status: 'Open'})
WHERE (j.closing_date IS NULL OR date(j.closing_date) >= date())
  AND NOT EXISTS { MATCH (j)-[:REQUIRES_SKILL]->(:Skill) }
OPTIONAL MATCH (e:Employer)-[:POSTED]->(j)
RETURN j.job_id AS job_id, j.job_title AS job_title,
       e.emp_id AS emp_id, e.company_name AS employer,
       j.source AS source, j.source_url AS source_url
ORDER BY j.posted_date DESC, j.job_id ASC
LIMIT toInteger($limit)
`;
