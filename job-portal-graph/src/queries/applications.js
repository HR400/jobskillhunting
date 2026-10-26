/**
 * src/queries/applications.js — applications (Tickets 27–28, plan §8.4).
 *
 * `LOCK_JOB` takes the job's write lock before the duplicate check, so a second
 * concurrent apply blocks until the first commits and then sees its
 * APPLIED_TO edge. `app_seq` is the per-job application counter.
 */

export const LOCK_JOB = `
MATCH (j:Job {job_id: $jobId})
SET j.app_seq = coalesce(j.app_seq, 0) + 1
`;

export const FIND_APPLICATION = `
MATCH (:Candidate {cand_id: $candId})-[a:APPLIED_TO]->(:Job {job_id: $jobId})
RETURN a.app_id AS app_id
`;

// Snapshot: APPLIED_TO + MATCHED_TO + one ASSESSED_FOR per requirement.
export const CREATE_APPLICATION = `
MATCH (c:Candidate {cand_id: $candId})
MATCH (j:Job {job_id: $jobId})
MERGE (c)-[a:APPLIED_TO]->(j)
ON CREATE SET a.app_id = $appId, a.status = 'Applied', a.date = date()
WITH c, j, a
CREATE (c)-[:MATCHED_TO {
  match_id: $matchId, match_date: datetime(),
  recommendation_level: $band, match_pct: $matchPct
}]->(j)
WITH c, j, a
FOREACH (row IN $assessments |
  CREATE (c)-[:ASSESSED_FOR {
    skill_key: row.skill_key,
    match_percentage: row.match_percentage,
    assess_date: date(),
    assess_score: row.assess_score
  }]->(j)
)
RETURN a.app_id AS app_id, a.status AS status, a.date AS date
`;

export const MY_APPLICATIONS = `
MATCH (:Account {account_id: $accountId})-[:OWNS_PROFILE]->(c:Candidate)
MATCH (c)-[ap:APPLIED_TO]->(j:Job)
OPTIONAL MATCH (e:Employer)-[:POSTED]->(j)
OPTIONAL MATCH (c)-[m:MATCHED_TO]->(j)
RETURN ap.app_id AS app_id, ap.status AS status, ap.final_result AS final_result,
       ap.date AS date, j.job_id AS job_id, j.job_title AS job_title,
       j.job_status AS job_status, e.company_name AS employer,
       m.match_pct AS match_pct, m.recommendation_level AS recommendation_level
ORDER BY ap.date DESC, j.job_title ASC
`;

export const GET_APPLICATION = `
MATCH (:Candidate)-[ap:APPLIED_TO {app_id: $appId}]->(j:Job)
RETURN ap.app_id AS app_id, ap.status AS status, ap.final_result AS final_result
`;

// Ownership is inside the MATCH: a foreign employer matches no rows.
export const UPDATE_APPLICATION = `
MATCH (:Account {account_id: $accountId})-[:OWNS_PROFILE]->(:Employer)
      -[:POSTED]->(:Job)<-[ap:APPLIED_TO {app_id: $appId}]-(c:Candidate)
SET ap.status = coalesce($status, ap.status),
    ap.final_result = coalesce($finalResult, ap.final_result)
RETURN ap.app_id AS app_id, ap.status AS status, ap.final_result AS final_result,
       c.cand_id AS cand_id
`;
