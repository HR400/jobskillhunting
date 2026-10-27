/**
 * TEST ONLY — tests/unit/reportPage.test.js (Ticket 58)
 *
 * Verifies that public/report.html complies with plan §12:
 * print-to-PDF A4, inline SVG, live endpoint integrations,
 * "analytical, not measured" slopegraph label, and DA-1/DA-2 reconciliations.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Research Report Page: public/report.html (Ticket 58)', () => {
  const reportPath = resolve(process.cwd(), 'public/report.html');

  it('exists in public/ directory', () => {
    expect(existsSync(reportPath)).toBe(true);
  });

  it('contains A4 print styling and tokens integration', () => {
    const html = readFileSync(reportPath, 'utf8');
    expect(html).toMatch(/@media\s+print/i);
    expect(html).toMatch(/size:\s*A4/i);
    expect(html).toContain('tokens.css');
  });

  it('contains inline SVG system topology diagram', () => {
    const html = readFileSync(reportPath, 'utf8');
    expect(html).toContain('<svg');
    expect(html).toMatch(/express/i);
    expect(html).toMatch(/neo4j/i);
    expect(html).toMatch(/bolt/i);
  });

  it('contains complexity slopegraph labelled "analytical, not measured"', () => {
    const html = readFileSync(reportPath, 'utf8');
    expect(html).toMatch(/analytical,\s*not\s*measured/i);
    expect(html).toMatch(/index-free\s+adjacency/i);
    expect(html).toMatch(/relational/i);
  });

  it('fetches from live endpoints and handles honest no-data states', () => {
    const html = readFileSync(reportPath, 'utf8');
    expect(html).toContain('/api/report/data');
    expect(html).toMatch(/no\s+data/i);
  });

  it('documents DA-1 normalisation and §3.2 reconciliations', () => {
    const html = readFileSync(reportPath, 'utf8');
    // DA-1 normalisation summary (18 entities -> 26 BCNF relations)
    expect(html).toMatch(/18\s+entities/i);
    expect(html).toMatch(/26\s+BCNF/i);
    expect(html).toContain('JOB_PRIMARY');
    expect(html).toContain('JOB_SALARY_INFO');
    expect(html).toContain('Dependent');

    // DA-1 / DA-2 reconciliations
    expect(html).toContain('ASSESSED_FOR');
    expect(html).toContain('Assured_For');
    expect(html).toMatch(/min_year|proficiency/i);
    expect(html).toMatch(/is_mandatory|mandatory/i);
    expect(html).toMatch(/40\s*%/);
    expect(html).toMatch(/TRG_SCREEN_APPLICATION/i);
    expect(html).toMatch(/recursive\s+CTE/i);
  });

  it('contains zero forbidden fake data strings', () => {
    const html = readFileSync(reportPath, 'utf8');
    expect(html).not.toMatch(/faker/i);
    expect(html).not.toMatch(/lorem\s+ipsum/i);
    expect(html).not.toMatch(/John\s+Doe/i);
    expect(html).not.toMatch(/Ram\s+Nishtha/i);
    expect(html).not.toMatch(/\bJ001\b/);
    expect(html).not.toMatch(/\bAPP001\b/);
  });
});
