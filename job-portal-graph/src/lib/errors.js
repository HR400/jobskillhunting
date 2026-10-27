/**
 * src/lib/errors.js
 *
 * Defines the AppError class and the code→status mapping from plan §9.1.
 * Every route/middleware that wants to signal an API error should throw (or
 * pass) an AppError. Central error middleware converts it to the contract:
 *   { "error": { "code", "message", "details?", "requestId" } }
 */

/** @type {Record<string, number>} */
export const ERROR_STATUS = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  ALREADY_APPLIED: 409,
  MATCH_BELOW_THRESHOLD: 422,
  MANDATORY_SKILLS_MISSING: 422,
  RATE_LIMITED: 429,
  DB_UNAVAILABLE: 503,
  UNAVAILABLE: 503,
  QUERY_TIMEOUT: 504,
  INTERNAL: 500,
};

export class AppError extends Error {
  /**
   * @param {keyof typeof ERROR_STATUS} code
   * @param {string} message
   * @param {{ details?: unknown }} [opts]
   */
  constructor(code, message, opts = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_STATUS[code] ?? 500;
    this.details = opts.details ?? undefined;
  }
}

/**
 * Convenience factory for common errors.
 */
export const Errors = {
  notFound: (msg = 'Resource not found') => new AppError('NOT_FOUND', msg),
  forbidden: (msg = 'Access denied') => new AppError('FORBIDDEN', msg),
  unauthenticated: (msg = 'Authentication required') =>
    new AppError('UNAUTHENTICATED', msg),
  validation: (msg, details) =>
    new AppError('VALIDATION_FAILED', msg, { details }),
  conflict: (msg = 'Resource already exists') => new AppError('CONFLICT', msg),
  alreadyApplied: () =>
    new AppError('ALREADY_APPLIED', 'You have already applied to this job.'),
  matchBelowThreshold: (msg, details) =>
    new AppError('MATCH_BELOW_THRESHOLD', msg, { details }),
  mandatorySkillsMissing: (msg, details) =>
    new AppError('MANDATORY_SKILLS_MISSING', msg, { details }),
  dbUnavailable: () =>
    new AppError('DB_UNAVAILABLE', 'Database is temporarily unavailable.'),
  unavailable: (msg = 'Feature unavailable') => new AppError('UNAVAILABLE', msg),
  queryTimeout: () =>
    new AppError('QUERY_TIMEOUT', 'Query timed out.'),
  internal: () => new AppError('INTERNAL', 'An unexpected error occurred.'),
};
