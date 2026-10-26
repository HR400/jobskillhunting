/**
 * TEST ONLY — tests/integration/referrals.test.js (Ticket 25)
 *
 * A 3-hop chain is returned once; a cycle yields a finite set of paths.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, closeTestDriver, wipeTestDb } from '../helpers/db.js';
import { createTestCandidate } from '../helpers/fixtures.js';
import { signToken } from '../../src/lib/auth.js';

describe('referrals Q3 (Ticket 25)', () => {
  let driver;
  let request;

  beforeAll(async () => {
    driver = await getTestDriver();
    request = await getTestApp();
  });

  afterAll(async () => {
    await closeTestDriver();
  });

  beforeEach(async () => {
    await wipeTestDb();
  });

  async function person(fname) {
    const c = await createTestCandidate(driver, { fname, lname: 'Ref' });
    return { ...c, token: signToken({ accountId: c.accountId, role: 'candidate' }) };
  }

  async function refer(from, to) {
    const res = await request
      .post('/api/referrals')
      .set('Cookie', [`auth=${from.token}`])
      .send({ candId: to.profileId });
    expect(res.status).toBe(201);
  }

  it('returns a 3-hop chain once and does not loop on a cycle', async () => {
    const a = await person('Ada');
    const b = await person('Bea');
    const c = await person('Cyd');
    const d = await person('Dee');
    await refer(a, b);
    await refer(b, c);
    await refer(c, d);

    const chain = await request.get(`/api/referrals/${a.profileId}/chain?maxHops=3`);
    expect(chain.status).toBe(200);
    const threeHop = chain.body.chains.filter((x) => x.hops === 3);
    expect(threeHop).toHaveLength(1);
    expect(threeHop[0].ids).toEqual([a.profileId, b.profileId, c.profileId, d.profileId]);
    expect(threeHop[0].referral_chain).toEqual(['Ada Ref', 'Bea Ref', 'Cyd Ref', 'Dee Ref']);

    await refer(d, a);
    const cycled = await request.get(`/api/referrals/${a.profileId}/chain?maxHops=99`);
    expect(cycled.status).toBe(200);
    expect(cycled.body.maxHops).toBe(3);
    expect(cycled.body.chains.every((x) => x.hops >= 1 && x.hops <= 3)).toBe(true);
    const threeHopIds = cycled.body.chains.filter((x) => x.hops === 3).map((x) => x.ids.join('>'));
    expect(new Set(threeHopIds).size).toBe(threeHopIds.length);
  });

  it('rejects a self-referral and a missing candidate', async () => {
    const a = await person('Ada');
    const self = await request
      .post('/api/referrals')
      .set('Cookie', [`auth=${a.token}`])
      .send({ candId: a.profileId });
    expect(self.status).toBe(400);
    const missing = await request.get('/api/referrals/00000000-0000-4000-8000-000000000000/chain');
    expect(missing.status).toBe(404);
  });
});
