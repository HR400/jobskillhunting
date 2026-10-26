/**
 * src/queries/candidateSkillsEducation.js — Cypher queries for candidate skills and education (Ticket 15).
 *
 * Pinned to Neo4j 5 syntax.
 */

export const DELETE_CANDIDATE_SKILL_EDGES = `
MATCH (a:Account {account_id: $accountId})-[:OWNS_PROFILE]->(c:Candidate)
OPTIONAL MATCH (c)-[r:HAS_SKILL]->(:Skill)
DELETE r
RETURN c.cand_id AS cand_id
`;

export const INSERT_CANDIDATE_SKILLS = `
MATCH (a:Account {account_id: $accountId})-[:OWNS_PROFILE]->(c:Candidate)
UNWIND $skills AS item
MERGE (s:Skill {skill_key: item.skill_key})
  ON CREATE SET s.name = item.name, s.skill_category = 'General'
CREATE (c)-[:HAS_SKILL {
  proficiency: item.proficiency,
  years: item.years,
  last_used_year: item.last_used_year,
  source: 'self'
}]->(s)
RETURN s.name AS name, s.skill_key AS skill_key, item.proficiency AS proficiency, item.years AS years, item.last_used_year AS last_used_year
`;

export const GET_CANDIDATE_SKILLS = `
MATCH (a:Account {account_id: $accountId})-[:OWNS_PROFILE]->(c:Candidate)-[r:HAS_SKILL]->(s:Skill)
RETURN s.name AS name, s.skill_key AS skill_key, r.proficiency AS proficiency, r.years AS years, r.last_used_year AS last_used_year
ORDER BY s.name ASC
`;

export const CREATE_CANDIDATE_EDUCATION = `
MATCH (a:Account {account_id: $accountId})-[:OWNS_PROFILE]->(c:Candidate)
CREATE (e:Education {
  edu_id: $eduId,
  degree: $degree,
  cgpa: $cgpa,
  specialization: $specialization,
  university: $university,
  start_year: $start_year,
  end_year: $end_year
})
CREATE (c)-[:HAS_EDUCATION]->(e)
RETURN e
`;

export const DELETE_CANDIDATE_EDUCATION = `
MATCH (a:Account {account_id: $accountId})-[:OWNS_PROFILE]->(c:Candidate)-[:HAS_EDUCATION]->(e:Education {edu_id: $eduId})
DETACH DELETE e
RETURN count(e) AS deleted
`;

export function formatEducationNode(rawProps) {
  if (!rawProps) return null;
  const formatted = {};
  for (const [k, v] of Object.entries(rawProps)) {
    if (v === null || v === undefined) {
      formatted[k] = null;
    } else if (typeof v === 'object' && typeof v.toNumber === 'function') {
      formatted[k] = v.toNumber();
    } else {
      formatted[k] = v;
    }
  }
  return formatted;
}
