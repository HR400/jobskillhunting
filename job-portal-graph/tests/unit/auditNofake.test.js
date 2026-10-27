/**
 * TEST ONLY — tests/unit/auditNofake.test.js (Ticket 60)
 *
 * Verifies that scripts/audit-nofake.js correctly flags prohibited patterns
 * (faker, Math.random outside allow-list, lorem, sample names, fixture leaks)
 * and passes cleanly on the current codebase.
 */
import { describe, it, expect } from 'vitest';
import { auditFileContent, auditNoFake } from '../../scripts/audit-nofake.js';

describe('audit:nofake (Ticket 60, Plan §15)', () => {
  it('flags faker usage', () => {
    const violations = auditFileContent('src/fake.js', "import faker from 'faker';");
    expect(violations.some((v) => v.rule.includes('faker'))).toBe(true);
  });

  it('flags Math.random in non-allow-listed file', () => {
    const violations = auditFileContent('src/calc.js', 'const x = Math.random();');
    expect(violations.some((v) => v.rule.includes('Math.random'))).toBe(true);
  });

  it('allows Math.random in allow-listed animation file', () => {
    const violations = auditFileContent('public/js/reveal.js', 'const x = Math.random();');
    expect(violations.some((v) => v.rule.includes('Math.random'))).toBe(false);
  });

  it('flags lorem ipsum text', () => {
    const violations = auditFileContent('public/view.js', 'const text = "Lorem ipsum dolor";');
    expect(violations.some((v) => v.rule.includes('lorem'))).toBe(true);
  });

  it('flags sample names from DA-1 and placeholder names', () => {
    expect(auditFileContent('src/user.js', 'name = "John Doe"').length).toBeGreaterThan(0);
    expect(auditFileContent('src/user.js', 'name = "Ram Nishtha"').length).toBeGreaterThan(0);
    expect(auditFileContent('src/job.js', 'code = "J001"').length).toBeGreaterThan(0);
  });

  it('flags imports of test fixtures in runtime files', () => {
    const violations = auditFileContent('src/routes/jobs.js', "import { createTestCandidate } from '../../tests/helpers/fixtures.js';");
    expect(violations.some((v) => v.rule.includes('test fixture'))).toBe(true);
  });

  it('passes cleanly on the active project directory', () => {
    const result = auditNoFake();
    expect(result.violations).toHaveLength(0);
    expect(result.passed).toBe(true);
  });
});
