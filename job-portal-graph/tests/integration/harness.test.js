/**
 * TEST ONLY — tests/integration/harness.test.js (Ticket 13)
 *
 * Verifies Ticket 13 acceptance:
 *   - Guard refuses to run when NEO4J_TEST_URI equals NEO4J_URI
 *   - Runs one trivial test against 7688
 *   - Supertest factory connects and returns valid responses
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { assertTestInstance } from '../helpers/guard.js';
import { getTestDriver, closeTestDriver } from '../helpers/db.js';
import { getTestApp } from '../helpers/app.js';

describe('Test harness guard (Rule R4)', () => {
  it('refuses to run when NEO4J_TEST_URI equals NEO4J_URI', () => {
    expect(() => {
      assertTestInstance('bolt://localhost:7687', 'bolt://localhost:7687');
    }).toThrow(/Refusing to run tests against the runtime Neo4j instance/);
  });

  it('refuses to run when NEO4J_TEST_URI is missing or blank', () => {
    expect(() => {
      assertTestInstance('', 'bolt://localhost:7687');
    }).toThrow(/NEO4J_TEST_URI is required/);
  });

  it('allows running when NEO4J_TEST_URI differs from NEO4J_URI', () => {
    expect(() => {
      assertTestInstance('bolt://localhost:7688', 'bolt://localhost:7687');
    }).not.toThrow();
  });
});

describe('Test harness DB connectivity on port 7688', () => {
  let driver;

  beforeAll(async () => {
    driver = await getTestDriver();
  });

  afterAll(async () => {
    await closeTestDriver();
  });

  it('runs one trivial test against 7688 (RETURN 1)', async () => {
    const session = driver.session({ database: 'neo4j' });
    try {
      const result = await session.run('RETURN 1 AS val');
      expect(result.records.length).toBe(1);
      expect(result.records[0].get('val').toNumber()).toBe(1);
    } finally {
      await session.close();
    }
  });

  it('supertest factory connects to test app successfully', async () => {
    const request = await getTestApp();
    const res = await request.get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
