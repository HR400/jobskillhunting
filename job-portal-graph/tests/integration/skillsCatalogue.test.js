/**
 * TEST ONLY — tests/integration/skillsCatalogue.test.js (Ticket 16)
 *
 * Verifies Ticket 16:
 *   - "Node.js", " node.js " and "NODE.JS" resolve to one Skill
 *   - A Cypher-injection string is stored as a literal name
 *   - GET /api/skills?q= searches local skill catalogue
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, closeTestDriver, wipeTestDb } from '../helpers/db.js';
import { createTestCandidate } from '../helpers/fixtures.js';
import { signToken } from '../../src/lib/auth.js';

describe('Skill Catalogue API (Ticket 16)', () => {
  let driver;
  let request;

  beforeAll(async () => {
    driver = await getTestDriver();
    request = await getTestApp();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await closeTestDriver();
  });

  beforeEach(async () => {
    // Local-catalogue assertions must not depend on the live ESCO service.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await wipeTestDb();
  });

  it('"Node.js", " node.js " and "NODE.JS" resolve to one Skill node', async () => {
    const user = await createTestCandidate(driver);
    const token = signToken({ accountId: user.accountId, role: user.role });

    // 1. Post "Node.js"
    const res1 = await request
      .post('/api/skills')
      .set('Cookie', [`auth=${token}`])
      .send({ name: 'Node.js', skill_category: 'Backend' });
    expect(res1.status).toBe(201);
    expect(res1.body.skill.skill_key).toBe('node.js');

    // 2. Post " node.js "
    const res2 = await request
      .post('/api/skills')
      .set('Cookie', [`auth=${token}`])
      .send({ name: ' node.js ' });
    expect(res2.status).toBe(200);
    expect(res2.body.skill.skill_key).toBe('node.js');

    // 3. Post "NODE.JS"
    const res3 = await request
      .post('/api/skills')
      .set('Cookie', [`auth=${token}`])
      .send({ name: 'NODE.JS' });
    expect(res3.status).toBe(200);
    expect(res3.body.skill.skill_key).toBe('node.js');

    // Verify in database that exactly ONE Skill node exists with skill_key: 'node.js'
    const session = driver.session({ database: 'neo4j' });
    try {
      const dbRes = await session.run(
        'MATCH (s:Skill {skill_key: $key}) RETURN count(s) AS total',
        { key: 'node.js' },
      );
      expect(dbRes.records[0].get('total').toNumber()).toBe(1);
    } finally {
      await session.close();
    }
  });

  it('stores a Cypher-injection string as a literal name without executing it', async () => {
    const user = await createTestCandidate(driver);
    const token = signToken({ accountId: user.accountId, role: user.role });

    const injectionPayload = "SQL'; MATCH (n) DETACH DELETE n; //";

    const res = await request
      .post('/api/skills')
      .set('Cookie', [`auth=${token}`])
      .send({ name: injectionPayload });

    expect(res.status).toBe(201);
    expect(res.body.skill.name).toBe(injectionPayload);

    // Verify that the user node and account STILL exist (DETACH DELETE was NOT executed)
    const session = driver.session({ database: 'neo4j' });
    try {
      const checkUser = await session.run(
        'MATCH (a:Account {account_id: $accountId}) RETURN count(a) AS total',
        { accountId: user.accountId },
      );
      expect(checkUser.records[0].get('total').toNumber()).toBe(1);

      // Verify skill was stored with literal name
      const checkSkill = await session.run(
        'MATCH (s:Skill {name: $name}) RETURN s.name AS storedName',
        { name: injectionPayload },
      );
      expect(checkSkill.records.length).toBe(1);
      expect(checkSkill.records[0].get('storedName')).toBe(injectionPayload);
    } finally {
      await session.close();
    }
  });

  it('GET /api/skills?q= searches local skill catalogue', async () => {
    const user = await createTestCandidate(driver);
    const token = signToken({ accountId: user.accountId, role: user.role });

    // Seed skills
    await request
      .post('/api/skills')
      .set('Cookie', [`auth=${token}`])
      .send({ name: 'JavaScript', skill_category: 'Frontend' });
    await request
      .post('/api/skills')
      .set('Cookie', [`auth=${token}`])
      .send({ name: 'TypeScript', skill_category: 'Frontend' });
    await request
      .post('/api/skills')
      .set('Cookie', [`auth=${token}`])
      .send({ name: 'Python', skill_category: 'Backend' });

    // Search for "script"
    const searchRes = await request.get('/api/skills?q=script');
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.skills).toBeDefined();
    expect(searchRes.body.skills.length).toBe(2);
    const names = searchRes.body.skills.map((s) => s.name);
    expect(names).toContain('JavaScript');
    expect(names).toContain('TypeScript');

    // Missing query param returns 400 VALIDATION_FAILED
    const emptyRes = await request.get('/api/skills?q=');
    expect(emptyRes.status).toBe(400);
    expect(emptyRes.body.error.code).toBe('VALIDATION_FAILED');
  });
});
