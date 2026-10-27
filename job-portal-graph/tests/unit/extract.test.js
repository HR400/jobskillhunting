/** TEST ONLY — deterministic extraction rules (Ticket 48). */
import { describe, it, expect } from 'vitest';
import { extractRequirements } from '../../src/ingest/extract.js';

const skills = [
  { skill_key: 'java', name: 'Java', aliases: [] },
  { skill_key: 'javascript', name: 'JavaScript', aliases: ['JS'] },
  { skill_key: 'node.js', name: 'Node.js', aliases: ['nodejs'] },
];

describe('extractRequirements (Ticket 48)', () => {
  it('matches exact names and aliases case-insensitively', () => {
    const out = extractRequirements('We use javascript and nodejs daily.', skills);
    expect(out.map((r) => r.skill_key)).toEqual(['javascript', 'node.js']);
  });

  it('does not match a skill name inside a longer word', () => {
    expect(extractRequirements('Javaish scripting, javascripts everywhere', skills)).toEqual([]);
  });

  it('returns a stable order and nothing invented', () => {
    const out = extractRequirements('JavaScript, Java and Kubernetes', skills);
    expect(out).toEqual([
      { skill_key: 'java', name: 'Java' },
      { skill_key: 'javascript', name: 'JavaScript' },
    ]);
  });

  it('handles empty text and short aliases', () => {
    expect(extractRequirements('', skills)).toEqual([]);
    expect(
      extractRequirements('c and go', [{ skill_key: 'c', name: 'C', aliases: [] }]),
    ).toEqual([]);
  });
});
