/**
 * src/queries/report.js — database statistics & report subgraphs (Ticket 57).
 * Pinned to Neo4j 5 syntax.
 */

export const GET_DB_COUNTS = `
CALL {
  MATCH (n) RETURN count(n) AS nodeCount
}
CALL {
  MATCH ()-[r]->() RETURN count(r) AS relCount
}
RETURN nodeCount, relCount
`;

export const GET_LABEL_COUNTS = `
MATCH (n)
UNWIND labels(n) AS label
RETURN label, count(n) AS count
`;

export const GET_REL_TYPE_COUNTS = `
MATCH ()-[r]->()
RETURN type(r) AS type, count(r) AS count
`;

export const FIND_SAMPLE_CANDIDATE_JOB = `
MATCH (c:Candidate)
MATCH (j:Job)
RETURN c.cand_id AS candId, j.job_id AS jobId
LIMIT 1
`;

export const GET_DBMS_INFO = `
CALL dbms.components()
YIELD name, versions, edition
RETURN name, versions[0] AS version, edition
`;
