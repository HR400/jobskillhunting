/**
 * src/queries/whatIf.js — What-If scorer (plan §8.5, Ticket 29). Read-only.
 *
 * Scores every open, non-expired job with requirements twice in one pass:
 * once with the stored HAS_SKILL edges and once with the effective skill
 * `max(stored, hypothetical)` per field ($hyp keyed by skill_key). Deltas,
 * bands and rank changes are computed in src/services/whatIf.js.
 * Pinned to Neo4j 5 syntax (no LET/FILTER/SEARCH).
 */

export const WHAT_IF_RANKING = `
MATCH (c:Candidate {cand_id: $candId})
MATCH (e:Employer)-[:POSTED]->(j:Job {job_status: 'Open'})
WHERE j.closing_date IS NULL OR date(j.closing_date) >= date()
MATCH (j)-[r:REQUIRES_SKILL]->(s:Skill)
OPTIONAL MATCH (c)-[h:HAS_SKILL]->(s)
WITH j, e, r, s, h, $hyp AS hypMap
WITH j, e, r, s, h, hypMap[s.skill_key] AS hyp
WITH j, e, r, s, h, hyp,
     CASE WHEN coalesce(h.proficiency, 0) > coalesce(hyp.proficiency, 0)
          THEN coalesce(h.proficiency, 0) ELSE coalesce(hyp.proficiency, 0) END AS eff_p,
     CASE WHEN coalesce(h.years, 0) > coalesce(hyp.years, 0)
          THEN coalesce(h.years, 0) ELSE coalesce(hyp.years, 0) END AS eff_y
WITH j, e, r, s, h,
     (h IS NOT NULL
      AND h.proficiency >= coalesce(r.min_proficiency, 1)
      AND coalesce(h.years, 0) >= coalesce(r.min_years, 0)) AS stored_ok,
     (eff_p >= coalesce(r.min_proficiency, 1)
      AND eff_y >= coalesce(r.min_years, 0)) AS eff_ok,
     coalesce(r.mandatory, false) AS mandatory
WITH j, e, collect({stored: stored_ok, eff: eff_ok, mandatory: mandatory}) AS rows
WITH j, e, rows, size(rows) AS total,
     size([x IN rows WHERE x.stored]) AS stored_matched,
     size([x IN rows WHERE x.eff]) AS eff_matched
RETURN j.job_id AS job_id, j.job_title AS job_title,
       e.emp_id AS emp_id, e.company_name AS employer,
       total, stored_matched, eff_matched,
       round(100.0 * stored_matched / total, 1) AS stored_pct,
       round(100.0 * eff_matched / total, 1) AS eff_pct,
       all(x IN rows WHERE NOT x.mandatory OR x.stored) AS stored_mandatory_ok,
       all(x IN rows WHERE NOT x.mandatory OR x.eff) AS eff_mandatory_ok
ORDER BY eff_mandatory_ok DESC, eff_pct DESC, j.job_title ASC, j.job_id ASC
`;
