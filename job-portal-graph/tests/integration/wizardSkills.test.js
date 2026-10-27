/**
 * TEST ONLY — tests/integration/wizardSkills.test.js (Ticket 34)
 *
 * Verifies Ticket 34:
 *   - A skill typed with different case attaches to the existing Skill node.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, wipeTestDb, closeTestDriver } from '../helpers/db.js';
import { createTestCandidate } from '../helpers/fixtures.js';
import { signToken } from '../../src/lib/auth.js';

describe('Wizard Skills (Ticket 34)', () => {
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

  it('a skill typed with different case attaches to the existing Skill node', async () => {
    // 1. Existing Skill node in DB: "Node.js" with skill_key "node.js"
    const session = driver.session({ database: 'neo4j' });
    try {
      await session.run(`
        CREATE (:Skill {skill_key: 'node.js', name: 'Node.js', skill_category: 'Backend'})
      `);
    } finally {
      await session.close();
    }

    // 2. Candidate registers and submits skills using different case "NODE.JS"
    const cand = await createTestCandidate(driver);
    const token = signToken({ accountId: cand.accountId, role: cand.role });

    const res = await app
      .put('/api/candidates/me/skills')
      .set('Cookie', [`auth=${token}`])
      .send({
        skills: [
          { name: 'NODE.JS', proficiency: 4, years: 3, last_used_year: 2025 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.skills).toHaveLength(1);
    expect(res.body.skills[0].skill_key).toBe('node.js');

    // 3. Verify exactly ONE Skill node exists with skill_key: 'node.js'
    const verifySession = driver.session({ database: 'neo4j' });
    try {
      const skillCountRes = await verifySession.run(
        'MATCH (s:Skill {skill_key: $key}) RETURN count(s) AS total',
        { key: 'node.js' },
      );
      expect(skillCountRes.records[0].get('total').toNumber()).toBe(1);

      // Verify the candidate's HAS_SKILL edge points to this existing node
      const edgeRes = await verifySession.run(`
        MATCH (c:Candidate {cand_id: $candId})-[r:HAS_SKILL]->(s:Skill {skill_key: 'node.js'})
        RETURN r.proficiency AS proficiency, r.years AS years, s.name AS skillName
      `, { candId: cand.profileId });

      expect(edgeRes.records).toHaveLength(1);
      expect(Number(edgeRes.records[0].get('proficiency'))).toBe(4);
      expect(Number(edgeRes.records[0].get('years'))).toBe(3);
      // The original Skill node name is preserved
      expect(edgeRes.records[0].get('skillName')).toBe('Node.js');
    } finally {
      await verifySession.close();
    }
  });
});
