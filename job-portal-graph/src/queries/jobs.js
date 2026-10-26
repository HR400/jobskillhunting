/**
 * src/queries/jobs.js — Cypher for job postings (Tickets 18–19).
 *
 * Ownership always goes through (:Account)-[:OWNS_PROFILE]->(:Employer)->[:POSTED]->(:Job).
 * Dates are converted at the boundary so Cypher compares native DATE/DATETIME.
 * Pinned to Neo4j 5 syntax.
 */

export const CREATE_JOB = `
MATCH (a:Account {account_id: $accountId})-[:OWNS_PROFILE]->(e:Employer)
CREATE (j:Job {
  job_id: $jobId,
  job_title: $jobTitle,
  job_status: 'Open',
  salary: $salary,
  posted_date: datetime(),
  closing_date: CASE WHEN $closingDate IS NULL THEN null ELSE date($closingDate) END,
  descriptive: $descriptive,
  source: 'employer',
  source_url: null,
  external_ref: null,
  fetched_at: null,
  requirement_source: $requirementSource
})
CREATE (e)-[:POSTED]->(j)
FOREACH (req IN $requirements |
  MERGE (s:Skill {skill_key: req.skill_key})
    ON CREATE SET s.name = req.name, s.skill_category = 'General'
  CREATE (j)-[:REQUIRES_SKILL {
    min_proficiency: req.min_proficiency,
    min_years: req.min_years,
    mandatory: req.mandatory
  }]->(s)
)
RETURN j, e.emp_id AS emp_id, e.company_name AS company_name
`;

export const LIST_JOBS = `
MATCH (e:Employer)-[:POSTED]->(j:Job)
WHERE ($status IS NULL OR j.job_status = $status)
  AND ($q IS NULL OR toLower(j.job_title) CONTAINS $q)
  AND ($employerId IS NULL OR e.emp_id = $employerId)
  AND ($skillKey IS NULL OR EXISTS { MATCH (j)-[:REQUIRES_SKILL]->(:Skill {skill_key: $skillKey}) })
RETURN j, e.emp_id AS emp_id, e.company_name AS company_name,
       COUNT { (j)-[:REQUIRES_SKILL]->(:Skill) } AS requirement_count
ORDER BY j.posted_date DESC, j.job_id ASC
SKIP toInteger($skip) LIMIT toInteger($limit)
`;

export const GET_JOB_BY_ID = `
MATCH (e:Employer)-[:POSTED]->(j:Job {job_id: $jobId})
OPTIONAL MATCH (j)-[r:REQUIRES_SKILL]->(s:Skill)
WITH j, e, collect(
  CASE WHEN s IS NULL THEN null ELSE {
    skill_key: s.skill_key, name: s.name,
    min_proficiency: r.min_proficiency, min_years: r.min_years,
    mandatory: coalesce(r.mandatory, false)
  } END
) AS requirements
RETURN j, e.emp_id AS emp_id, e.company_name AS company_name,
       [req IN requirements WHERE req IS NOT NULL] AS requirements
`;

// Ownership is part of the MATCH: a foreign job returns no rows -> 403.
export const UPDATE_JOB = `
MATCH (a:Account {account_id: $accountId})-[:OWNS_PROFILE]->(:Employer)-[:POSTED]->(j:Job {job_id: $jobId})
SET j.job_title = coalesce($jobTitle, j.job_title),
    j.salary = coalesce($salary, j.salary),
    j.descriptive = coalesce($descriptive, j.descriptive),
    j.job_status = coalesce($jobStatus, j.job_status),
    j.closing_date = CASE WHEN $closingDate IS NULL THEN j.closing_date ELSE date($closingDate) END
RETURN j
`;

/** Driver Integers -> JS numbers for a REQUIRES_SKILL map. */
export function formatRequirement(raw) {
  const num = (v) => (typeof v?.toNumber === 'function' ? v.toNumber() : (v ?? null));
  return {
    skill_key: raw.skill_key,
    name: raw.name,
    min_proficiency: num(raw.min_proficiency),
    min_years: num(raw.min_years),
    mandatory: raw.mandatory === true,
  };
}

export function formatJobNode(rawProps, extra = {}) {
  if (!rawProps) return null;
  const formatted = {};
  for (const [k, v] of Object.entries(rawProps)) {
    if (v === null || v === undefined) {
      formatted[k] = null;
    } else if (typeof v === 'object' && typeof v.toNumber === 'function') {
      formatted[k] = v.toNumber();
    } else if (typeof v === 'object' && typeof v.toString === 'function' && ('year' in v || 'hour' in v)) {
      formatted[k] = v.toString();
    } else {
      formatted[k] = v;
    }
  }
  return { ...formatted, ...extra };
}
