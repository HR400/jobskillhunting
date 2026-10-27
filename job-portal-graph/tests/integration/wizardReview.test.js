/**
 * TEST ONLY — tests/integration/wizardReview.test.js (Ticket 35)
 *
 * Verifies Ticket 35:
 *   - The review step shows only entered values and submit lands one profile.
 *   - No fake or synthetic data is created in the database.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, wipeTestDb, closeTestDriver } from '../helpers/db.js';

describe('Wizard Review & Profile Land (Ticket 35)', () => {
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

  it('lands exactly one profile with only entered values and linked education', async () => {
    const email = 'candidate.review@example.com';
    const password = 'password123456789';

    // 1. Step 1: Register
    const regRes = await app
      .post('/api/auth/register')
      .send({
        email,
        password,
        role: 'candidate',
        profile: {
          candidate_type: 'freelancer',
          fname: 'Alice',
          lname: 'Smith',
        },
      });
    expect(regRes.status).toBe(201);
    const { accountId, profileId } = regRes.body;

    // Login to get cookie
    const loginRes = await app
      .post('/api/auth/login')
      .send({ email, password });
    expect(loginRes.status).toBe(200);
    const cookie = loginRes.headers['set-cookie'];

    // 2. Step 2: Basics update with only entered values
    const updateRes = await app
      .put('/api/candidates/me')
      .set('Cookie', cookie)
      .send({
        phone: '+1-555-0199',
        gender: 'female',
        hourly_rate: 85,
        portfolio_url: 'https://alicesmith.dev',
      });
    expect(updateRes.status).toBe(200);

    // 3. Step 3: Skills
    const skillsRes = await app
      .put('/api/candidates/me/skills')
      .set('Cookie', cookie)
      .send({
        skills: [
          { name: 'GraphQL', proficiency: 4, years: 2 },
        ],
      });
    expect(skillsRes.status).toBe(200);

    // 4. Step 4: Education
    const eduRes = await app
      .post('/api/candidates/me/education')
      .set('Cookie', cookie)
      .send({
        degree: 'B.S. Software Engineering',
        university: 'MIT',
        start_year: 2018,
        end_year: 2022,
        cgpa: 3.9,
      });
    expect(eduRes.status).toBe(201);

    // 5. Step 5: Read back profile — verify only entered values exist (no fake data)
    const profileRes = await app
      .get('/api/candidates/me')
      .set('Cookie', cookie);
    expect(profileRes.status).toBe(200);
    const prof = profileRes.body.candidate;

    expect(prof.cand_id).toBe(profileId);
    expect(prof.fname).toBe('Alice');
    expect(prof.lname).toBe('Smith');
    expect(prof.phone).toBe('+1-555-0199');
    expect(prof.gender).toBe('female');
    expect(prof.hourly_rate).toBe(85);
    expect(prof.portfolio_url).toBe('https://alicesmith.dev');
    // Non-entered fields must not exist / be falsy (no fake data)
    expect(prof.house_no).toBeFalsy();
    expect(prof.street).toBeFalsy();
    expect(prof.dob).toBeFalsy();

    // Verify in database that exactly ONE Candidate node exists for this account
    const session = driver.session({ database: 'neo4j' });
    try {
      const dbRes = await session.run(`
        MATCH (a:Account {email: $email})-[:OWNS_PROFILE]->(c:Candidate)
        OPTIONAL MATCH (c)-[:HAS_EDUCATION]->(e:Education)
        OPTIONAL MATCH (c)-[:HAS_SKILL]->(s:Skill)
        RETURN count(DISTINCT c) AS candidateCount,
               count(DISTINCT e) AS eduCount,
               count(DISTINCT s) AS skillCount
      `, { email });

      expect(dbRes.records[0].get('candidateCount').toNumber()).toBe(1);
      expect(dbRes.records[0].get('eduCount').toNumber()).toBe(1);
      expect(dbRes.records[0].get('skillCount').toNumber()).toBe(1);
    } finally {
      await session.close();
    }
  });
});
