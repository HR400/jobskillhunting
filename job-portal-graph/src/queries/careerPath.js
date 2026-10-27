/**
 * src/queries/careerPath.js — data for the career-path engine (Ticket 53, plan §11.2).
 *
 * The co-requirement graph is derived from real `REQUIRES_SKILL` edges: two
 * skills that appear in the same job are connected with weight 1/co-occurrence,
 * so rarer pairings are cheaper to traverse. No hand-written curriculum.
 */

export const CAREER_HELD_SKILLS = `
MATCH (c:Candidate {cand_id: $candId})-[:HAS_SKILL]->(s:Skill)
RETURN id(s) AS id, s.skill_key AS skill_key, s.name AS name
ORDER BY name
`;

export const CAREER_MISSING_SKILLS = `
MATCH (c:Candidate {cand_id: $candId})
MATCH (:Job {job_id: $jobId})-[:REQUIRES_SKILL]->(s:Skill)
WHERE NOT EXISTS { MATCH (c)-[:HAS_SKILL]->(s) }
RETURN id(s) AS id, s.skill_key AS skill_key, s.name AS name
ORDER BY name
`;

export const PROJECT_CO_REQUIREMENT_GRAPH = `
CALL gds.graph.project.cypher(
  $name,
  'MATCH (s:Skill) RETURN id(s) AS id',
  'MATCH (j:Job)-[:REQUIRES_SKILL]->(a:Skill), (j)-[:REQUIRES_SKILL]->(b:Skill)
   WHERE a.skill_key < b.skill_key
   WITH a, b, count(DISTINCT j) AS co
   WITH a, b, 1.0 / co AS weight
   UNWIND [[id(a), id(b)], [id(b), id(a)]] AS pair
   RETURN pair[0] AS source, pair[1] AS target, weight'
)
`;

export const DIJKSTRA_PATH = `
CALL gds.shortestPath.dijkstra.stream($name, {
  sourceNode: $source,
  targetNode: $target,
  relationshipWeightProperty: 'weight'
})
YIELD nodeIds, totalCost
RETURN [n IN nodeIds | gds.util.asNode(n).name] AS path, totalCost
`;
