/**
 * TEST ONLY — tests/unit/benchmarkRunner.test.js (Ticket 59)
 *
 * Asserts statistical calculation functions (p50, p95, max)
 * and verifies that /api/report/benchmarks reports honest benchmark availability.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { calculateStats } from '../../benchmarks/stats.js';
import { getTestApp } from '../helpers/app.js';
import { getTestDriver, closeTestDriver } from '../helpers/db.js';

describe('Benchmark Statistics & Endpoint (Ticket 59)', () => {
  let request;

  beforeAll(async () => {
    await getTestDriver();
    request = await getTestApp();
  });

  afterAll(async () => {
    await closeTestDriver();
  });

  it('calculates min, p50, p95, max, and mean correctly', () => {
    // 100 sample sorted values from 1 to 100
    const latencies = Array.from({ length: 100 }, (_, i) => i + 1);
    const stats = calculateStats(latencies);

    expect(stats.min).toBe(1);
    expect(stats.max).toBe(100);
    expect(stats.p50).toBe(50.5); // median of 1..100
    expect(stats.p95).toBe(95.05); // 95th percentile
    expect(stats.mean).toBe(50.5);
  });

  it('handles small sample sizes gracefully', () => {
    const stats = calculateStats([10, 20, 30]);
    expect(stats.min).toBe(10);
    expect(stats.max).toBe(30);
    expect(stats.p50).toBe(20);
    expect(stats.p95).toBeGreaterThanOrEqual(20);
    expect(stats.mean).toBe(20);
  });

  it('GET /api/report/benchmarks returns honest response format', async () => {
    const res = await request.get('/api/report/benchmarks');
    expect(res.status).toBe(200);
    expect(typeof res.body.available).toBe('boolean');
    if (!res.body.available) {
      expect(res.body.message).toMatch(/no benchmark results/i);
    } else {
      expect(res.body.benchmarks).toBeDefined();
      expect(res.body.db_size).toBeDefined();
    }
  });
});
