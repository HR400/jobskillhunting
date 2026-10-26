/**
 * TEST ONLY — tests/unit/matching.test.js (Ticket 21)
 *
 * Boundary cases for the reference matcher in plan §8.1:
 * equal-to-minimum, null minimums, zero requirements, mandatory missing,
 * and the band edges 39.9 / 40 / 74.9 / 75.
 */
import { describe, it, expect } from 'vitest';
import {
  bandFor,
  requirementStatus,
  scoreMatch,
  SATISFIED,
  BELOW,
  MISSING,
} from '../../src/services/matching.js';

const req = (over = {}) => ({
  skill_key: 'node.js',
  name: 'Node.js',
  min_proficiency: null,
  min_years: null,
  mandatory: false,
  ...over,
});

describe('requirementStatus (Ticket 21)', () => {
  it('treats equal-to-minimum proficiency and years as satisfied', () => {
    const r = req({ min_proficiency: 3, min_years: 2 });
    expect(
      requirementStatus(r, { proficiency: 3, years: 2 }),
    ).toBe(SATISFIED);
  });

  it('treats one unit below the minimum as below, not missing', () => {
    const r = req({ min_proficiency: 3, min_years: 2 });
    expect(requirementStatus(r, { proficiency: 2, years: 5 })).toBe(BELOW);
    expect(requirementStatus(r, { proficiency: 5, years: 1 })).toBe(BELOW);
  });

  it('coalesces null minimums to proficiency 1 and years 0', () => {
    const r = req();
    expect(requirementStatus(r, { proficiency: 1, years: 0 })).toBe(SATISFIED);
    expect(requirementStatus(r, { proficiency: 0, years: 0 })).toBe(BELOW);
    expect(requirementStatus(r, null)).toBe(MISSING);
  });

  it('returns missing when the candidate has no such skill', () => {
    expect(requirementStatus(req({ min_proficiency: 4 }), undefined)).toBe(MISSING);
  });
});

describe('scoreMatch (Ticket 21)', () => {
  it('scores zero requirements as unscored, never 100%', () => {
    const score = scoreMatch([], {});
    expect(score).toMatchObject({ total: 0, matched: 0, match_pct: null, mandatory_ok: true });
    expect(bandFor(score.match_pct)).toBe('Unscored');
  });

  it('fails mandatory_ok when a mandatory requirement is missing', () => {
    const score = scoreMatch(
      [
        req({ skill_key: 'neo4j', mandatory: true, min_proficiency: 4 }),
        req({ skill_key: 'sql' }),
      ],
      { sql: { proficiency: 3, years: 1 } },
    );
    expect(score.match_pct).toBe(50);
    expect(score.mandatory_ok).toBe(false);
    expect(score.breakdown.map((r) => r.status)).toEqual([MISSING, SATISFIED]);
  });

  it('rounds to one decimal place', () => {
    const requirements = Array.from({ length: 3 }, (_, i) =>
      req({ skill_key: `s${i}` }),
    );
    const score = scoreMatch(requirements, { s0: { proficiency: 1, years: 0 } });
    expect(score.match_pct).toBe(33.3);
  });
});

describe('bandFor (Ticket 21)', () => {
  it('places the band edges exactly', () => {
    expect(bandFor(39.9)).toBe('Low');
    expect(bandFor(40)).toBe('Moderate');
    expect(bandFor(74.9)).toBe('Moderate');
    expect(bandFor(75)).toBe('Strong');
    expect(bandFor(null)).toBe('Unscored');
  });
});
