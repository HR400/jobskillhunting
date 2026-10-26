/**
 * TEST ONLY — tests/unit/whatIf.test.js (Ticket 29)
 *
 * Pure parts of the What-If simulator: entry merging (max wins per field),
 * per-job deltas, band changes and rank changes.
 */
import { describe, it, expect } from 'vitest';
import { buildHypotheticalMap, describeWhatIf, whatIfRow } from '../../src/services/whatIf.js';

describe('buildHypotheticalMap', () => {
  it('keys entries by skill_key and takes the max on duplicates', () => {
    expect(
      buildHypotheticalMap([
        { skill_key: 'node.js', proficiency: 3, years: 2 },
        { skill_key: 'sql', proficiency: 4, years: 0 },
        { skill_key: 'node.js', proficiency: 5, years: 1 },
      ]),
    ).toEqual({
      'node.js': { proficiency: 5, years: 2 },
      sql: { proficiency: 4, years: 0 },
    });
  });

  it('accepts an empty list', () => {
    expect(buildHypotheticalMap([])).toEqual({});
  });
});

const ROW = (over = {}) => ({
  job_id: 'j1',
  job_title: 'Job 1',
  emp_id: 'e1',
  employer: 'Acme',
  total: 4,
  stored_matched: 2,
  eff_matched: 3,
  stored_pct: 50,
  eff_pct: 75,
  stored_mandatory_ok: false,
  eff_mandatory_ok: true,
  ...over,
});

describe('describeWhatIf', () => {
  it('reports band changes, deltas, unlocks and mandatory-ok changes', () => {
    const { jobs, summary } = describeWhatIf([
      // 50 Moderate → 75 Strong, mandatory-ok turns true.
      ROW(),
      // Unchanged job (50 → 50, mandatory-ok already true): delta 0, no flags.
      ROW({ job_id: 'j3', eff_matched: 2, eff_pct: 50, stored_mandatory_ok: true }),
      // 0 % Low → 50 Moderate: newly unlocked.
      ROW({
        job_id: 'j2',
        stored_matched: 0,
        eff_matched: 1,
        stored_pct: 0,
        eff_pct: 50,
        total: 2,
        eff_mandatory_ok: false,
      }),
    ]);
    expect(jobs[0]).toMatchObject({
      job_id: 'j1',
      stored: { match_pct: 50, band: 'Moderate', mandatory_ok: false },
      hypothetical: { match_pct: 75, band: 'Strong', mandatory_ok: true },
      delta_pct: 25,
      band_changed: true,
      newly_above_band: true,
      newly_unlocked: false,
      newly_mandatory_ok: true,
      // j3 ranked first while j1's mandatory requirement failed; it overtakes.
      rank_change: 1,
    });
    expect(jobs[1]).toMatchObject({
      job_id: 'j3',
      delta_pct: 0,
      band_changed: false,
      rank_change: -1,
    });
    expect(jobs[2]).toMatchObject({
      job_id: 'j2',
      newly_unlocked: true,
      band_changed: true,
      delta_pct: 50,
    });
    expect(summary).toMatchObject({
      jobs_scored: 3,
      jobs_improved: 2,
      // j1 Low→...→Strong and j2 Low→Moderate both cross a band threshold upward.
      newly_above_band: 2,
      newly_mandatory_ok: 1,
      newly_unlocked: 1,
      rank_changed: 2,
    });
  });

  it('computes rank changes between the stored and hypothetical ordering', () => {
    const { jobs } = describeWhatIf([
      ROW({ job_id: 'a', stored_pct: 80, eff_pct: 20 }),
      ROW({ job_id: 'b', stored_pct: 20, eff_pct: 80 }),
    ]);
    // a was first with the stored scores, drops behind b afterwards.
    expect(jobs.find((j) => j.job_id === 'a').rank_change).toBe(-1);
    expect(jobs.find((j) => j.job_id === 'b').rank_change).toBe(1);
  });

  it('whatIfRow keeps a downward band move out of newly_above_band', () => {
    const row = whatIfRow(
      ROW({ eff_pct: 30 }),
      { j1: 1 },
      { j1: 1 },
    );
    expect(row.band_changed).toBe(true);
    expect(row.newly_above_band).toBe(false);
  });
});
