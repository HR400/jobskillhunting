/**
 * src/queries/candidates.js — Cypher queries for candidate profile management (Ticket 14).
 *
 * All operations enforce ownership through (:Account)-[:OWNS_PROFILE]->(:Candidate).
 * Pinned to Neo4j 5 syntax.
 */

export const GET_CANDIDATE_PROFILE = `
MATCH (a:Account {account_id: $accountId})-[:OWNS_PROFILE]->(c:Candidate)
RETURN c, labels(c) AS labels
`;

export const UPDATE_CANDIDATE_PROFILE = `
MATCH (a:Account {account_id: $accountId})-[:OWNS_PROFILE]->(c:Candidate)
SET c += $updates
RETURN c, labels(c) AS labels
`;

export const DELETE_CANDIDATE_PROFILE = `
MATCH (a:Account {account_id: $accountId})-[:OWNS_PROFILE]->(c:Candidate)
OPTIONAL MATCH (c)-[:HAS_EDUCATION]->(e:Education)
DETACH DELETE c, e, a
RETURN count(c) AS deleted
`;

export function formatCandidateNode(rawProps, labels = []) {
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

  let candidate_type = 'experienced';
  if (labels.includes('Freelancer')) {
    candidate_type = 'freelancer';
  } else if (labels.includes('Fresher')) {
    candidate_type = 'fresher';
  }
  formatted.candidate_type = candidate_type;

  return formatted;
}
