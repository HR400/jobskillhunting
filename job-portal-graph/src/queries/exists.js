/**
 * src/queries/exists.js — existence checks for profile-scoped handlers
 * (plan §9.1). Missing ids must become 404, never a 0 % match.
 */

export const EXISTS_CANDIDATE_JOB = `
OPTIONAL MATCH (c:Candidate {cand_id: $candId})
OPTIONAL MATCH (j:Job {job_id: $jobId})
RETURN c.cand_id AS cand_id, j.job_id AS job_id, j.job_title AS job_title
`;

export const EXISTS_CANDIDATE = `
MATCH (c:Candidate {cand_id: $candId})
RETURN c.cand_id AS cand_id
`;

export const EXISTS_EMPLOYER = `
MATCH (e:Employer {emp_id: $empId})
RETURN e.emp_id AS emp_id
`;
