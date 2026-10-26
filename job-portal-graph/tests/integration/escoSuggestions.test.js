/**
 * TEST ONLY — tests/integration/escoSuggestions.test.js (Ticket 17)
 *
 * Verifies Ticket 17:
 *   - ESCO suggestions are appended, marked source: "esco"
 *   - ESCO failures leave local results intact, capabilities.esco: false, no 500
 *   - Responses are cached
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, closeTestDriver, wipeTestDb } from '../helpers/db.js';
import { createTestCandidate } from '../helpers/fixtures.js';
import { signToken } from '../../src/lib/auth.js';

describe('ESCO skill suggestions (Ticket 17)', () => {
  let driver;
  let request;
  let token;

  beforeAll(async () => {
    driver = await getTestDriver();
    request = await getTestApp();
  });

  afterAll(async () => {
    await closeTestDriver();
  });

  beforeEach(async () => {
    await wipeTestDb();
    const user = await createTestCandidate(driver);
    token = signToken({ accountId: user.accountId, role: user.role });
    await request
      .post('/api/skills')
      .set('Cookie', [`auth=${token}`])
      .send({ name: 'Node.js' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('appends ESCO suggestions marked as esco and caches them', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        _embedded: {
          results: [
            { title: 'Node.js', uri: 'http://data.europa.eu/esco/skill/1' }, // local wins
            { title: 'Develop Node.js applications', uri: 'http://data.europa.eu/esco/skill/2' },
          ],
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = await request.get('/api/skills?q=node');
    const second = await request.get('/api/skills?q=node');

    expect(first.status).toBe(200);
    expect(first.body.capabilities).toEqual({ esco: true });
    expect(first.body.skills).toEqual([
      expect.objectContaining({ skill_key: 'node.js', source: 'local' }),
      expect.objectContaining({ skill_key: 'develop node.js applications', source: 'esco' }),
    ]);
    expect(second.body.skills).toEqual(first.body.skills);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps local rows when ESCO is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    // Different query text from the cached test above, but still matches the local row.
    const res = await request.get('/api/skills?q=node.');

    expect(res.status).toBe(200);
    expect(res.body.capabilities).toEqual({ esco: false });
    expect(res.body.skills).toEqual([
      expect.objectContaining({ skill_key: 'node.js', source: 'local' }),
    ]);
  });
});
