/**
 * TEST ONLY — tests/unit/decay.test.js (Ticket 56)
 *
 * λ = 0 leaves proficiency untouched (the default), λ > 0 applies
 * proficiency × exp(−λ × years_since_last_used), and a skill with no
 * last-used year has no evidence of staleness, so it does not decay.
 */
import { describe, it, expect } from 'vitest';
import { effectiveProficiency, yearsSinceLastUsed } from '../../src/services/decay.js';
import { requirementStatus } from '../../src/services/matching.js';
import { config } from '../../src/config.js';

describe('skill decay (Ticket 56)', () => {
  it('is off by default and at λ = 0', () => {
    expect(config.SKILL_DECAY_LAMBDA).toBe(0);
    expect(effectiveProficiency({ proficiency: 4, lastUsedYear: 2000 }, 0)).toBe(4);
  });

  it('applies proficiency × exp(−λ × years since last used)', () => {
    const now = new Date().getFullYear();
    expect(yearsSinceLastUsed(now - 10)).toBe(10);

    const decayed = effectiveProficiency({ proficiency: 5, lastUsedYear: now - 10 }, 0.1);
    expect(decayed).toBeCloseTo(5 * Math.exp(-1), 2);
  });

  it('treats a missing or future last-used year as no decay', () => {
    expect(effectiveProficiency({ proficiency: 3, lastUsedYear: null }, 0.1)).toBe(3);
    expect(yearsSinceLastUsed(new Date().getFullYear() + 5)).toBe(0);
  });

  it('makes the reference matcher agree with the formula', () => {
    const requirement = { min_proficiency: 4, min_years: 0 };
    const now = new Date().getFullYear();
    const skill = { proficiency: 4, years: 3, last_used_year: now - 10 };
    const original = config.SKILL_DECAY_LAMBDA;
    try {
      config.SKILL_DECAY_LAMBDA = 0.1;
      expect(requirementStatus(requirement, skill)).toBe('below');
      expect(
        requirementStatus(requirement, { ...skill, last_used_year: now }),
      ).toBe('satisfied');
    } finally {
      config.SKILL_DECAY_LAMBDA = original;
    }
  });
});
