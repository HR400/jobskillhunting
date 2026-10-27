/**
 * TEST ONLY — tests/integration/analyticsPagerank.test.js (Ticket 51)
 *
 * The endpoint either returns real GDS scores or an honest `unavailable`
 * reason. It never approximates authority in application code.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, closeTestDriver } from '../helpers/db.js';

describe('GET /api/analytics/pagerank (Ticket 51)', () => {
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
    const res = await request.get('/api/analytics/pagerank');
    expect(res.status).toBe(200);

    if (!caps.gds) {
      expect(res.body.unavailable).toEqual(expect.any(String));
      expect(res.body.candidates).toEqual([]);
      return;
    }

    expect(res.body.method).toBe('gds.pageRank');
    for (const candidate of res.body.candidates) {
      expect(candidate.cand_id).toEqual(expect.any(String));
      expect(candidate.referrer_authority).toEqual(expect.any(Number));
      expect(candidate).not.toHaveProperty('match_pct');
    }
  });
});
