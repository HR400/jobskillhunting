/**
 * TEST ONLY — tests/integration/analyticsCommunities.test.js (Ticket 52)
 *
 * Louvain output is either unavailable with a reason, or real clusters whose
 * labels come from the skills present in that cluster's data.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, closeTestDriver } from '../helpers/db.js';

describe('GET /api/analytics/communities (Ticket 52)', () => {
  let request;
  let caps;

  beforeAll(async () => {
    await getTestDriver();
    request = await getTestApp();
    caps = (await request.get('/api/meta/capabilities')).body.capabilities;
  });

  afterAll(async () => {
    await closeTestDriver();
  });

  it('reports unavailable with a reason when GDS is missing', async () => {
    const res = await request.get('/api/analytics/communities');
    expect(res.status).toBe(200);

    if (!caps.gds) {
      expect(res.body.unavailable).toEqual(expect.any(String));
      expect(res.body.clusters).toEqual([]);
      return;
    }

    expect(res.body.method).toBe('gds.louvain');
    for (const cluster of res.body.clusters) {
      expect(cluster.label).toBe(cluster.skills[0] ?? 'No shared skills');
      expect(cluster.candidate_count).toBe(cluster.candidates.length);
      expect(cluster.skills.length).toBeGreaterThan(0);
    }
  });
});
