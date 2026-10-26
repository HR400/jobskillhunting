/**
 * TEST ONLY — tests/unit/skillKey.test.js (Ticket 16)
 *
 * Verifies canonical skillKey normalisation:
 *   - Lowercasing
 *   - Trimming leading and trailing whitespace
 *   - Collapsing multiple whitespace characters
 */
import { describe, it, expect } from 'vitest';
import { skillKey } from '../../src/lib/skillKey.js';

describe('skillKey canonical normalization', () => {
  it('converts Node.js, " node.js ", and NODE.JS to the same canonical key', () => {
    expect(skillKey('Node.js')).toBe('node.js');
    expect(skillKey(' node.js ')).toBe('node.js');
    expect(skillKey('NODE.JS')).toBe('node.js');
  });

  it('collapses multiple spaces, tabs, and newlines', () => {
    expect(skillKey('  Machine    Learning  ')).toBe('machine learning');
    expect(skillKey('Full\t\tStack\n\nDeveloper')).toBe('full stack developer');
  });

  it('handles non-string or empty inputs safely', () => {
    expect(skillKey('')).toBe('');
    expect(skillKey(null)).toBe('');
    expect(skillKey(undefined)).toBe('');
  });
});
