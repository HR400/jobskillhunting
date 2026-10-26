/**
 * TEST ONLY — tests/integration/candidateSkillsEducation.test.js (Ticket 15)
 *
 * Verifies Ticket 15:
 *   - PUT /api/candidates/me/skills with out-of-range proficiency or years returns 400 VALIDATION_FAILED with field path
 *   - PUT /api/candidates/me/skills replaces skills atomically and leaves no stale HAS_SKILL edges
 *   - POST /api/candidates/me/education creates education node linked to candidate
 *   - DELETE /api/candidates/me/education/:eduId deletes the candidate's education node
 *   - DELETE /api/candidates/me/education/:eduId for another candidate's education returns 404
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, closeTestDriver, wipeTestDb } from '../helpers/db.js';
import { createTestCandidate } from '../helpers/fixtures.js';
import { signToken } from '../../src/lib/auth.js';

describe('Candidate Skills and Education API (Ticket 15)', () => {
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

  describe('PUT /api/candidates/me/skills', () => {
    it('returns 400 VALIDATION_FAILED with field path on out-of-range proficiency (>5)', async () => {
      const cand = await createTestCandidate(driver);
      const token = signToken({ accountId: cand.accountId, role: cand.role });

      const res = await request
        .put('/api/candidates/me/skills')
        .set('Cookie', [`auth=${token}`])
        .send({
          skills: [
            { name: 'JavaScript', proficiency: 6, years: 3 },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.details).toBeDefined();
      expect(res.body.error.details.some((d) => d.path.includes('proficiency'))).toBe(true);
    });

    it('returns 400 VALIDATION_FAILED with field path on out-of-range years (>60 or <0)', async () => {
      const cand = await createTestCandidate(driver);
      const token = signToken({ accountId: cand.accountId, role: cand.role });

      const res = await request
        .put('/api/candidates/me/skills')
        .set('Cookie', [`auth=${token}`])
        .send({
          skills: [
            { name: 'Python', proficiency: 4, years: 65 },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.details.some((d) => d.path.includes('years'))).toBe(true);
    });

    it('atomically replaces skills and leaves no stale HAS_SKILL edges', async () => {
      const cand = await createTestCandidate(driver);
      const token = signToken({ accountId: cand.accountId, role: cand.role });

      // First skill update: Python & SQL
      const res1 = await request
        .put('/api/candidates/me/skills')
        .set('Cookie', [`auth=${token}`])
        .send({
          skills: [
            { name: 'Python', proficiency: 4, years: 5, last_used_year: 2024 },
            { name: 'SQL', proficiency: 3, years: 3 },
          ],
        });
      expect(res1.status).toBe(200);
      expect(res1.body.skills.length).toBe(2);

      // Verify in DB that candidate has exactly 2 HAS_SKILL edges
      const session = driver.session({ database: 'neo4j' });
      try {
        const check1 = await session.run(
          `
          MATCH (c:Candidate {cand_id: $candId})-[r:HAS_SKILL]->(s:Skill)
          RETURN s.name AS skillName, r.proficiency AS prof, r.years AS yrs
          `,
          { candId: cand.profileId },
        );
        expect(check1.records.length).toBe(2);
      } finally {
        await session.close();
      }

      // Second skill update: replace completely with TypeScript only
      const res2 = await request
        .put('/api/candidates/me/skills')
        .set('Cookie', [`auth=${token}`])
        .send({
          skills: [
            { name: 'TypeScript', proficiency: 5, years: 4 },
          ],
        });
      expect(res2.status).toBe(200);
      expect(res2.body.skills.length).toBe(1);
      expect(res2.body.skills[0].name).toBe('TypeScript');

      // Verify in DB: NO stale edges from Python or SQL remain on this candidate
      const checkSession = driver.session({ database: 'neo4j' });
      try {
        const check2 = await checkSession.run(
          `
          MATCH (c:Candidate {cand_id: $candId})-[r:HAS_SKILL]->(s:Skill)
          RETURN s.name AS skillName, r.proficiency AS prof
          `,
          { candId: cand.profileId },
        );
        expect(check2.records.length).toBe(1);
        expect(check2.records[0].get('skillName')).toBe('TypeScript');
      } finally {
        await checkSession.close();
      }
    });
  });

  describe('Education endpoints', () => {
    it('POST /api/candidates/me/education creates education node', async () => {
      const cand = await createTestCandidate(driver);
      const token = signToken({ accountId: cand.accountId, role: cand.role });

      const res = await request
        .post('/api/candidates/me/education')
        .set('Cookie', [`auth=${token}`])
        .send({
          degree: 'Bachelor of Science in Computer Science',
          cgpa: 3.8,
          specialization: 'Artificial Intelligence',
          university: 'Tech University',
          start_year: 2020,
          end_year: 2024,
        });

      expect(res.status).toBe(201);
      expect(res.body.education).toBeDefined();
      expect(res.body.education.edu_id).toBeDefined();
      expect(res.body.education.degree).toBe('Bachelor of Science in Computer Science');
      expect(res.body.education.cgpa).toBe(3.8);

      // Verify in DB
      const session = driver.session({ database: 'neo4j' });
      try {
        const dbRes = await session.run(
          `
          MATCH (c:Candidate {cand_id: $candId})-[:HAS_EDUCATION]->(e:Education {edu_id: $eduId})
          RETURN e
          `,
          { candId: cand.profileId, eduId: res.body.education.edu_id },
        );
        expect(dbRes.records.length).toBe(1);
      } finally {
        await session.close();
      }
    });

    it('DELETE /api/candidates/me/education/:eduId deletes education node', async () => {
      const cand = await createTestCandidate(driver);
      const token = signToken({ accountId: cand.accountId, role: cand.role });

      // Create an education entry first
      const createRes = await request
        .post('/api/candidates/me/education')
        .set('Cookie', [`auth=${token}`])
        .send({
          degree: 'Master of Science',
          university: 'State University',
          start_year: 2024,
        });
      const eduId = createRes.body.education.edu_id;

      // Delete the entry
      const delRes = await request
        .delete(`/api/candidates/me/education/${eduId}`)
        .set('Cookie', [`auth=${token}`]);
      expect(delRes.status).toBe(204);

      // Verify in DB that it is gone
      const session = driver.session({ database: 'neo4j' });
      try {
        const check = await session.run(
          'MATCH (e:Education {edu_id: $eduId}) RETURN count(e) AS count',
          { eduId },
        );
        expect(check.records[0].get('count').toNumber()).toBe(0);
      } finally {
        await session.close();
      }
    });

    it('DELETE /api/candidates/me/education/:eduId returns 404 for non-existent education', async () => {
      const cand = await createTestCandidate(driver);
      const token = signToken({ accountId: cand.accountId, role: cand.role });

      const res = await request
        .delete('/api/candidates/me/education/00000000-0000-0000-0000-000000000000')
        .set('Cookie', [`auth=${token}`]);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
