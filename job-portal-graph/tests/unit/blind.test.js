/**
 * tests/unit/blind.test.js — blind-hiring redaction (Tickets 45 / 54).
 *
 * The masked branch must never carry identity fields, and unmasking happens
 * only strictly above the threshold and is logged.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { blindCandidate, blindRef } from '../../src/lib/blind.js';
import { logger } from '../../src/lib/logger.js';

const candidate = {
  cand_id: '1234abcd-0000-4000-8000-000000000000',
  fname: 'Asha',
  lname: 'Rao',
  dob: new Date('2001-02-03'),
  gender: 'female',
  email: 'asha@example.com',
  phone: '+9112345',
  house_no: '12',
  street: 'MG Road',
};

afterEach(() => vi.restoreAllMocks());

describe('blindCandidate', () => {
  it('masks at exactly the threshold', () => {
    const out = blindCandidate(candidate, 75, 75, { viewerId: 'a', jobId: 'j' });
    expect(out).toEqual({ cand_id: candidate.cand_id, ref: blindRef(candidate.cand_id), unmasked: false });
    expect(Object.keys(out)).not.toContain('name');
    expect(JSON.stringify(out)).not.toMatch(/Asha|Rao|asha@example|9112345|2001/);
  });

  it('unmasks strictly above the threshold and keeps identity fields', () => {
    const out = blindCandidate(candidate, 76.1, 75, { viewerId: 'acc', jobId: 'job' });
    expect(out.unmasked).toBe(true);
    expect(out.name).toBe('Asha Rao');
    expect(out.email).toBe('asha@example.com');
    expect(out.dob).toBe('2001-02-03');
  });

  it('logs the unmask with the viewer and job', () => {
    const spy = vi.spyOn(logger, 'info').mockImplementation(() => {});
    blindCandidate(candidate, 100, 75, { viewerId: 'account-1', jobId: 'job-1' });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'blind unmask', candId: candidate.cand_id, viewerId: 'account-1', jobId: 'job-1' }),
      'blind unmask',
    );
  });

  it('does not log when masked and handles a null score', () => {
    const spy = vi.spyOn(logger, 'info').mockImplementation(() => {});
    expect(blindCandidate(candidate, null, 75).unmasked).toBe(false);
    expect(blindCandidate(candidate, 40, 75).unmasked).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('builds a stable anonymous ref', () => {
    expect(blindRef('1234abcd-0000-4000-8000-000000000000')).toBe('Candidate #1234');
  });
});
