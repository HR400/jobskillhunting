/**
 * TEST ONLY — tests/integration/careerPath.test.js (Ticket 53)
 *
 * Real candidate/job requirements drive the missing-skill list; GDS either
 * returns weighted steps or an honest unavailable reason. The no-missing-skills
 * case needs no GDS at all.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, closeTestDriver, wipeTestDb } from '../helpers/db.js';
import { createTestCandidate, createTestEmployer } from '../helpers/fixtures.js';

describe('GET /api/career-path/:candId/:jobId (Ticket 53)', () => {
  let driver;
  let request;
  let candId;
  let jobId;
  let caps;

  beforeAll(async () => {
    driver = await getTestDriver();
    request = await getTestApp();
    caps = (await request.get('/api/meta/capabilities')).body.capabilities;
  });

  beforeEach(async () => {
    await wipeTestDb();
    const candidate = await createTestCandidate(driver);
    const employer = await createTestEmployer(driver);
    candId = candidate.profileId;
    jobId = randomUUID();

    const session = driver.session({ database: 'neo4j' });
    try {
      await session.run(
        `MERGE (js:Skill {skill_key: 'javascript'}) SET js.name = 'JavaScript'
         MERGE (neo:Skill {skill_key: 'neo4j'}) SET neo.name = 'Neo4j'
         WITH js, neo
         MATCH (c:Candidate {cand_id: $candId}), (e:Employer {emp_id: $empId})
         MERGE (c)-[:HAS_SKILL {proficiency: 4, years: 3}]->(js)
         CREATE (e)-[:POSTED]->(j:Job {
           job_id: $jobId, job_title: 'Graph Engineer', job_status: 'Open',
           posted_date: datetime()
         })
         CREATE (j)-[:REQUIRES_SKILL {mandatory: false}]->(js)
         CREATE (j)-[:REQUIRES_SKILL {mandatory: false}]->(neo)`,
        { candId, jobId, empId: employer.profileId },
      );
    } finally {
      await session.close();
    }
  });

  afterAll(async () => {
    await closeTestDriver();
  });

  it('404s for an unknown candidate or job', async () => {
    expect((await request.get(`/api/career-path/${randomUUID()}/${jobId}`)).status).toBe(404);
    expect((await request.get(`/api/career-path/${candId}/${randomUUID()}`)).status).toBe(404);
  });

  it('reports the real missing skill, then paths or an honest unavailable', async () => {
    const res = await request.get(`/api/career-path/${candId}/${jobId}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ candId, jobId, held_skills: ['javascript'] });
    expect(res.body.missing_skills).toEqual(['neo4j']);

    if (!caps.gds) {
      expect(res.body.unavailable).toEqual(expect.any(String));
      expect(res.body.steps).toEqual([]);
      return;
    }
    expect(res.body.steps).toHaveLength(1);
    expect(res.body.steps[0]).toMatchObject({ skill_key: 'neo4j', reachable: true });
    expect(res.body.steps[0].path[0]).toBe('JavaScript');
    expect(typeof res.body.steps[0].weight).toBe('number');
  });

  it('says so when nothing is missing, without consulting GDS', async () => {
    const session = driver.session({ database: 'neo4j' });
    try {
      await session.run(
        `MATCH (c:Candidate {cand_id: $candId}), (neo:Skill {skill_key: 'neo4j'})
         MERGE (c)-[:HAS_SKILL {proficiency: 3, years: 1}]->(neo)`,
        { candId },
      );
    } finally {
      await session.close();
    }

    const res = await request.get(`/api/career-path/${candId}/${jobId}`);
    expect(res.status).toBe(200);
    expect(res.body.missing_skills).toEqual([]);
    expect(res.body.steps).toEqual([]);
    expect(res.body.message).toMatch(/already hold every skill/i);
  });
});
