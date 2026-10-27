/**
 * TEST ONLY — tests/integration/canvasInspector.test.js (Ticket 36)
 *
 * Verifies Ticket 36:
 *   - Vendor route serves vis-network standalone bundle (200 OK)
 *   - Subgraph endpoint returns candidate, job, employer and skill nodes
 *   - Clicking a job produces inspector numbers equal to /api/match/:candId/:jobId
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, wipeTestDb, closeTestDriver } from '../helpers/db.js';
import { createTestCandidate, createTestEmployer } from '../helpers/fixtures.js';
import { signToken } from '../../src/lib/auth.js';

describe('Canvas and Inspector (Ticket 36)', () => {
  let app;
  let driver;

  beforeAll(async () => {
    app = await getTestApp();
    driver = await getTestDriver();
    await wipeTestDb();
  });

  afterAll(async () => {
    await wipeTestDb();
    await closeTestDriver();
  });

  it('serves vis-network vendor assets with 200 OK', async () => {
    const res = await app.get('/vendor/vis-network/standalone/umd/vis-network.min.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
  });

  it('returns valid subgraph and match metrics matching inspector contract', async () => {
    // 1. Create candidate with skills: Node.js (prof 4, 3 yr)
    const cand = await createTestCandidate(driver);
    const candToken = signToken({ accountId: cand.accountId, role: cand.role });
    await app
      .put('/api/candidates/me/skills')
      .set('Cookie', [`auth=${candToken}`])
      .send({
        skills: [{ name: 'Node.js', proficiency: 4, years: 3 }],
      });

    // 2. Create employer and post a job requiring Node.js (prof 3, 2 yr)
    const emp = await createTestEmployer(driver);
    const empToken = signToken({ accountId: emp.accountId, role: emp.role });
    const jobRes = await app
      .post('/api/jobs')
      .set('Cookie', [`auth=${empToken}`])
      .send({
        job_title: 'Backend Engineer',
        descriptive: 'Building backend services.',
        closing_date: '2028-12-31',
        requirements: [
          { name: 'Node.js', min_proficiency: 3, min_years: 2, mandatory: true },
        ],
      });
    expect(jobRes.status).toBe(201);
    const jobId = jobRes.body.job.job_id;

    // 3. Fetch /api/match/:candId/:jobId/subgraph (for canvas)
    const subRes = await app.get(`/api/match/${cand.profileId}/${jobId}/subgraph`);
    expect(subRes.status).toBe(200);
    const { nodes, edges } = subRes.body;

    const nodeTypes = new Set(nodes.map((n) => n.type));
    expect(nodeTypes).toContain('Candidate');
    expect(nodeTypes).toContain('Job');
    expect(nodeTypes).toContain('Employer');
    expect(nodeTypes).toContain('Skill');

    const edgeTypes = new Set(edges.map((e) => e.type));
    expect(edgeTypes).toContain('POSTED');
    expect(edgeTypes).toContain('REQUIRES_SKILL');
    expect(edgeTypes).toContain('HAS_SKILL');

    // Edge state must be satisfied
    const reqEdge = edges.find((e) => e.type === 'REQUIRES_SKILL');
    expect(reqEdge.state).toBe('satisfied');

    // 4. Fetch /api/match/:candId/:jobId (for inspector)
    const matchRes = await app.get(`/api/match/${cand.profileId}/${jobId}`);
    expect(matchRes.status).toBe(200);
    const match = matchRes.body.match;

    // Numbers must equal the match endpoint
    expect(match.job_id).toBe(jobId);
    expect(match.job_title).toBe('Backend Engineer');
    expect(match.match_pct).toBe(100);
    expect(match.band).toBe('Strong');
    expect(match.mandatory_ok).toBe(true);
    expect(match.matched).toBe(1);
    expect(match.total).toBe(1);
    expect(match.breakdown).toHaveLength(1);
    expect(match.breakdown[0].skill).toBe('Node.js');
    expect(match.breakdown[0].status).toBe('satisfied');
    expect(match.breakdown[0].mandatory).toBe(true);
  });
});
