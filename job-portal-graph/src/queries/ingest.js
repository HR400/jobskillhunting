/**
 * src/queries/ingest.js — idempotent upsert for feed jobs (Ticket 47).
 *
 * `external_ref` is the dedupe key (unique constraint `job_ext_ref`). The row
 * timestamp is the run's `fetched_at`, so `created_at` identifies rows this
 * run actually inserted. Pinned to Neo4j 5 syntax.
 */
export const UPSERT_INGESTED_JOB = `
UNWIND $jobs AS row
MERGE (j:Job {external_ref: row.external_ref})
ON CREATE SET j.job_id = randomUUID(), j.created_at = $fetchedAt
SET j.job_title = row.job_title,
    j.job_status = coalesce(row.job_status, 'Open'),
    j.descriptive = row.descriptive,
    j.source = row.source,
    j.source_url = row.source_url,
    j.fetched_at = $fetchedAt,
    j.requirement_source = 'extracted'
RETURN count(j) AS total,
       sum(CASE WHEN j.created_at = $fetchedAt THEN 1 ELSE 0 END) AS created
`;

/** Replace extracted requirements so a re-run is idempotent (Ticket 48). */
export const UPSERT_INGESTED_REQUIREMENTS = `
UNWIND $jobs AS row
MATCH (j:Job {external_ref: row.external_ref})
OPTIONAL MATCH (j)-[old:REQUIRES_SKILL]->()
WITH j, row, collect(old) AS olds
FOREACH (old IN olds | DELETE old)
FOREACH (req IN row.requirements |
  MERGE (s:Skill {skill_key: req.skill_key})
    ON CREATE SET s.name = req.name, s.skill_category = 'General'
  CREATE (j)-[:REQUIRES_SKILL {
    min_proficiency: null, min_years: null, mandatory: false,
    requirement_source: 'extracted'
  }]->(s)
)
`;

/** The whole catalogue is small; matching happens in JS (Ticket 48). */
export const SKILL_CATALOGUE = `
MATCH (s:Skill)
RETURN s.skill_key AS skill_key, s.name AS name, coalesce(s.aliases, []) AS aliases
`;
