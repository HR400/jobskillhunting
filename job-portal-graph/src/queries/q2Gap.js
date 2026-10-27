/**
 * src/queries/q2Gap.js — Q2, skill gap / exclusion (plan §8.2, Ticket 24).
 *
 * Returns only unsatisfied requirements: `below` when the skill is held but
 * under the bar, `missing` when it is not held at all. Ordered mandatory first.
 */
import { effectiveProficiency } from './decay.js';

export const Q2_GAP = `
MATCH (j:Job {job_id: $jobId})-[r:REQUIRES_SKILL]->(s:Skill)
WHERE NOT EXISTS {
  MATCH (:Candidate {cand_id: $candId})-[h:HAS_SKILL]->(s)
  WHERE ${effectiveProficiency('h')} >= coalesce(r.min_proficiency, 1) AND coalesce(h.years, 0) >= coalesce(r.min_years, 0)
}
OPTIONAL MATCH (:Candidate {cand_id: $candId})-[h2:HAS_SKILL]->(s)
RETURN s.skill_key AS skill_key, s.name AS skill, coalesce(r.mandatory, false) AS mandatory,
       r.min_proficiency AS required_proficiency, r.min_years AS required_years,
       h2.proficiency AS current_proficiency, h2.years AS current_years,
       CASE WHEN h2 IS NULL THEN 'missing' ELSE 'below' END AS gap_type
ORDER BY mandatory DESC, skill
`;
