/**
 * src/queries/skills.js — Cypher queries for skill catalogue (Ticket 16).
 *
 * Pinned to Neo4j 5 syntax.
 */

export const SEARCH_SKILLS = `
MATCH (s:Skill)
WHERE s.skill_key CONTAINS $qLower OR toLower(s.name) CONTAINS $qLower
RETURN s.skill_key AS skill_key, s.name AS name, s.skill_category AS skill_category, s.description AS description
ORDER BY s.name ASC
LIMIT toInteger($limit)
`;

export const UPSERT_SKILL = `
OPTIONAL MATCH (existing:Skill {skill_key: $skillKey})
WITH existing IS NULL AS isNew
MERGE (s:Skill {skill_key: $skillKey})
  ON CREATE SET
    s.name = $name,
    s.skill_category = $skillCategory,
    s.description = $description,
    s.created_at = datetime()
RETURN s.skill_key AS skill_key, s.name AS name, s.skill_category AS skill_category, s.description AS description, isNew
`;
