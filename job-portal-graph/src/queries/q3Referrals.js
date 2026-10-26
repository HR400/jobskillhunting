/**
 * src/queries/q3Referrals.js — Q3 multi-hop referral network (plan §8.2).
 *
 * Hop range is literal *1..3 (Neo4j 5 cannot parameterise variable length);
 * $maxHops is applied as a length filter. Relationship uniqueness makes cycles
 * finite. Pinned to Neo4j 5 syntax.
 */

export const Q3_CHAIN = `
MATCH path = (c1:Candidate {cand_id: $candId})-[:REFERS*1..3]->(c2:Candidate)
WHERE length(path) <= toInteger($maxHops)
RETURN [n IN nodes(path) | n.fname + ' ' + n.lname] AS referral_chain,
       [n IN nodes(path) | n.cand_id] AS ids, length(path) AS hops
ORDER BY hops, referral_chain
`;

export const LOOKUP_REFERRAL = `
OPTIONAL MATCH (from:Candidate {cand_id: $fromId})
OPTIONAL MATCH (to:Candidate {cand_id: $toId})
OPTIONAL MATCH (from)-[r:REFERS]->(to)
RETURN from.cand_id AS from_id, to.cand_id AS to_id, r IS NOT NULL AS exists
`;

export const CREATE_REFERRAL = `
MATCH (from:Candidate {cand_id: $fromId})
MATCH (to:Candidate {cand_id: $toId})
CREATE (from)-[r:REFERS {status: 'active', date: date()}]->(to)
RETURN from.cand_id AS from_id, to.cand_id AS to_id, r.status AS status
`;
