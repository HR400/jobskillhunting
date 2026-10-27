/**
 * TEST ONLY — tests/integration/reportData.test.js (Ticket 57)
 *
 * Asserts real database counts and subgraphs from /api/report/data;
 * confirms it says 'no data' when empty and never presents a mock.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, closeTestDriver } from '../helpers/db.js';
import { wipeTestDb, createTestCandidate, createTestEmployer } from '../helpers/fixtures.js';

describe('GET /api/report/data (Ticket 57)', () => {
  let request;
  let driver;

  beforeAll(async () => {
    driver = await getTestDriver();
    request = await getTestApp();
  });

  afterAll(async () => {
    await closeTestDriver();
  });

  it('returns honest no-data state when the database is empty', async () => {
    await wipeTestDb();
    const res = await request.get('/api/report/data');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      has_data: false,
      counts: {
        nodes: 0,
        relationships: 0,
        labels: expect.any(Object),
        types: expect.any(Object),
      },
      subgraph: null,
    });
    expect(res.body.message).toMatch(/no data/i);
    expect(res.body.db_info).toBeDefined();
    expect(typeof res.body.db_info.version).toBe('string');
  });

  it('returns real counts and subgraph when data exists without mocks', async () => {
    await wipeTestDb();
    const candidate = await createTestCandidate(driver);
    const employer = await createTestEmployer(driver);

    // Create a job with requirements and attach a skill to the candidate
    const session = driver.session({ database: 'neo4j' });
    try {
      await session.executeWrite((tx) =>
        tx.run(`
          MATCH (c:Candidate {cand_id: $candId})
          MATCH (e:Employer {emp_id: $empId})
          CREATE (j:Job {
            job_id: 'job-rep-1',
            job_title: 'Graph Engineer',
            job_status: 'Open',
            closing_date: date('2027-01-01'),
            posted_date: datetime(),
            source: 'employer'
          })
          CREATE (e)-[:POSTED]->(j)
          MERGE (s:Skill {skill_key: 'cypher'})
          ON CREATE SET s.name = 'Cypher'
          CREATE (j)-[:REQUIRES_SKILL {min_proficiency: 3, min_years: 1, mandatory: true}]->(s)
          CREATE (c)-[:HAS_SKILL {proficiency: 4, years: 2}]->(s)
        `, { candId: candidate.profileId, empId: employer.profileId }),
      );
    } finally {
      await session.close();
    }

    const res = await request.get('/api/report/data');
    expect(res.status).toBe(200);
    expect(res.body.has_data).toBe(true);
    expect(res.body.counts.nodes).toBeGreaterThan(0);
    expect(res.body.counts.relationships).toBeGreaterThan(0);
    expect(res.body.counts.labels.Candidate).toBeGreaterThanOrEqual(1);
    expect(res.body.counts.labels.Job).toBeGreaterThanOrEqual(1);
    expect(res.body.counts.labels.Skill).toBeGreaterThanOrEqual(1);

    expect(res.body.subgraph).not.toBeNull();
    expect(Array.isArray(res.body.subgraph.nodes)).toBe(true);
    expect(Array.isArray(res.body.subgraph.edges)).toBe(true);
    expect(res.body.subgraph.nodes.length).toBeGreaterThan(0);

    // Privacy check: candidate node must not leak PII in graph payload
    const candNode = res.body.subgraph.nodes.find((n) => n.type === 'Candidate');
    if (candNode) {
      expect(candNode.props.email).toBeUndefined();
      expect(candNode.props.phone).toBeUndefined();
      expect(candNode.props.dob).toBeUndefined();
    }
  });
});
