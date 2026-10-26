/**
 * TEST ONLY — unit tests for src/lib/errors.js (Ticket 07)
 *
 * Covers every code→status mapping in ERROR_STATUS and verifies the contract
 * structure. Does NOT connect to Neo4j.
 */
import { describe, it, expect } from 'vitest';
import { AppError, ERROR_STATUS, Errors } from '../../src/lib/errors.js';

describe('ERROR_STATUS — code to HTTP status mapping', () => {
  const cases = [
    ['VALIDATION_FAILED', 400],
    ['UNAUTHENTICATED', 401],
    ['FORBIDDEN', 403],
    ['NOT_FOUND', 404],
    ['CONFLICT', 409],
    ['ALREADY_APPLIED', 409],
    ['MATCH_BELOW_THRESHOLD', 422],
    ['MANDATORY_SKILLS_MISSING', 422],
    ['RATE_LIMITED', 429],
    ['DB_UNAVAILABLE', 503],
    ['QUERY_TIMEOUT', 504],
    ['INTERNAL', 500],
  ];

  for (const [code, expectedStatus] of cases) {
    it(`${code} → ${expectedStatus}`, () => {
      expect(ERROR_STATUS[code]).toBe(expectedStatus);
    });
  }
});

describe('AppError', () => {
  it('sets code, status and message', () => {
    const err = new AppError('NOT_FOUND', 'Thing not found');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Thing not found');
    expect(err instanceof Error).toBe(true);
  });

  it('carries details when provided', () => {
    const details = [{ path: 'email', message: 'invalid' }];
    const err = new AppError('VALIDATION_FAILED', 'bad input', { details });
    expect(err.details).toEqual(details);
  });

  it('details is undefined by default', () => {
    const err = new AppError('FORBIDDEN', 'nope');
    expect(err.details).toBeUndefined();
  });

  it('unknown code falls back to status 500', () => {
    const err = new AppError('TOTALLY_UNKNOWN', 'oops');
    expect(err.status).toBe(500);
  });
});

describe('Errors convenience factories', () => {
  it('notFound returns 404 AppError', () => {
    const e = Errors.notFound();
    expect(e.status).toBe(404);
    expect(e.code).toBe('NOT_FOUND');
  });

  it('validation returns 400 with details', () => {
    const e = Errors.validation('bad', [{ path: 'x' }]);
    expect(e.status).toBe(400);
    expect(e.details).toEqual([{ path: 'x' }]);
  });

  it('alreadyApplied returns 409 ALREADY_APPLIED', () => {
    const e = Errors.alreadyApplied();
    expect(e.status).toBe(409);
    expect(e.code).toBe('ALREADY_APPLIED');
  });

  it('dbUnavailable returns 503', () => {
    expect(Errors.dbUnavailable().status).toBe(503);
  });

  it('queryTimeout returns 504', () => {
    expect(Errors.queryTimeout().status).toBe(504);
  });
});
