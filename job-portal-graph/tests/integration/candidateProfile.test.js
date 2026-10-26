/**
 * TEST ONLY — tests/integration/candidateProfile.test.js (Ticket 14)
 *
 * Verifies Ticket 14:
 *   - GET /api/candidates/me returns profile for authenticated candidate
 *   - Non-candidate (employer) gets 403 FORBIDDEN
 *   - Unauthenticated gets 401 UNAUTHENTICATED
 *   - PUT /api/candidates/me updates allowed fields and rejects unknown/invalid fields
 *   - DELETE /api/candidates/me deletes Candidate, Education, and Account, leaving no orphan nodes/edges
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, closeTestDriver, wipeTestDb } from '../helpers/db.js';
import { createTestCandidate, createTestEmployer } from '../helpers/fixtures.js';
import { signToken } from '../../src/lib/auth.js';
import { randomUUID } from 'node:crypto';

describe('Candidate Profile API (Ticket 14)', () => {
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

  it('GET /api/candidates/me returns 401 when unauthenticated', async () => {
    const res = await request.get('/api/candidates/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('GET /api/candidates/me returns 403 when authenticated as employer', async () => {
    const emp = await createTestEmployer(driver);
    const token = signToken({ accountId: emp.accountId, role: emp.role });

    const res = await request
      .get('/api/candidates/me')
      .set('Cookie', [`auth=${token}`]);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('GET /api/candidates/me returns profile for authenticated candidate', async () => {
    const cand = await createTestCandidate(driver, {
      fname: 'Alice',
      lname: 'Smith',
      candidateType: 'fresher',
      gradYear: 2025,
    });
    const token = signToken({ accountId: cand.accountId, role: cand.role });

    const res = await request
      .get('/api/candidates/me')
      .set('Cookie', [`auth=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.candidate).toBeDefined();
    expect(res.body.candidate.cand_id).toBe(cand.profileId);
    expect(res.body.candidate.fname).toBe('Alice');
    expect(res.body.candidate.lname).toBe('Smith');
    expect(res.body.candidate.candidate_type).toBe('fresher');
    expect(res.body.candidate.grad_year).toBe(2025);
  });

  it('PUT /api/candidates/me updates profile fields and rejects invalid ones', async () => {
    const cand = await createTestCandidate(driver, {
      fname: 'Bob',
      lname: 'Jones',
      candidateType: 'freelancer',
      hourlyRate: 60,
    });
    const token = signToken({ accountId: cand.accountId, role: cand.role });

    // 1. Invalid update with extra unknown field -> 400
    const failRes = await request
      .put('/api/candidates/me')
      .set('Cookie', [`auth=${token}`])
      .send({ fname: 'Bobby', malicious_field: 'hacked' });
    expect(failRes.status).toBe(400);
    expect(failRes.body.error.code).toBe('VALIDATION_FAILED');

    // 2. Valid update
    const okRes = await request
      .put('/api/candidates/me')
      .set('Cookie', [`auth=${token}`])
      .send({
        fname: 'Robert',
        phone: '+9876543210',
        hourly_rate: 85,
        house_no: '456B',
      });
    expect(okRes.status).toBe(200);
    expect(okRes.body.candidate.fname).toBe('Robert');
    expect(okRes.body.candidate.phone).toBe('+9876543210');
    expect(okRes.body.candidate.hourly_rate).toBe(85);
    expect(okRes.body.candidate.house_no).toBe('456B');
  });

  it('DELETE /api/candidates/me removes Candidate, Education, and Account with no orphan nodes', async () => {
    const cand = await createTestCandidate(driver);
    const token = signToken({ accountId: cand.accountId, role: cand.role });

    // Link an Education node directly in DB to test cascade deletion
    const eduId = randomUUID();
    const session = driver.session({ database: 'neo4j' });
    try {
      await session.executeWrite((tx) =>
        tx.run(
          `
          MATCH (c:Candidate {cand_id: $candId})
          CREATE (e:Education {
            edu_id: $eduId,
            degree: 'B.Tech',
            cgpa: 8.5,
            specialization: 'CS',
            university: 'State University',
            start_year: 2020,
            end_year: 2024
          })
          CREATE (c)-[:HAS_EDUCATION]->(e)
          `,
          { candId: cand.profileId, eduId },
        ),
      );
    } finally {
      await session.close();
    }

    // Call DELETE /api/candidates/me
    const delRes = await request
      .delete('/api/candidates/me')
      .set('Cookie', [`auth=${token}`]);

    expect(delRes.status).toBe(204);

    // Verify in DB that Account, Candidate, and Education are completely gone
    const checkSession = driver.session({ database: 'neo4j' });
    try {
      const res = await checkSession.run(
        `
        MATCH (n)
        WHERE (n:Account AND n.account_id = $accountId)
           OR (n:Candidate AND n.cand_id = $candId)
           OR (n:Education AND n.edu_id = $eduId)
        RETURN count(n) AS remaining
        `,
        { accountId: cand.accountId, candId: cand.profileId, eduId },
      );
      expect(res.records[0].get('remaining').toNumber()).toBe(0);

      // Verify no orphan relationships remain
      const edgeRes = await checkSession.run(
        `
        MATCH ()-[r]->()
        WHERE r.cand_id = $candId
        RETURN count(r) AS remainingEdges
        `,
        { candId: cand.profileId },
      );
      expect(edgeRes.records[0].get('remainingEdges').toNumber()).toBe(0);
    } finally {
      await checkSession.close();
    }
  });

  it('DELETE /api/candidates/me returns 403 when called by employer', async () => {
    const emp = await createTestEmployer(driver);
    const token = signToken({ accountId: emp.accountId, role: emp.role });

    const res = await request
      .delete('/api/candidates/me')
      .set('Cookie', [`auth=${token}`]);

    expect(res.status).toBe(403);
  });
});
