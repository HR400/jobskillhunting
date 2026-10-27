/**
 * src/middleware/errors.js
 *
 * Central error middleware and helpers for the Express application.
 *
 * Exports:
 *   asyncHandler  — wraps an async route handler, forwarding rejections to next()
 *   notFoundHandler — JSON 404 for unmatched /api/* routes
 *   errorHandler  — final four-argument Express error middleware
 */
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

/**
 * Wrap an async route handler so that any rejected promise is forwarded to
 * Express's error pipeline instead of causing an unhandled rejection.
 *
 * @param {import('express').RequestHandler} fn
 * @returns {import('express').RequestHandler}
 */
export function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * JSON 404 for any unmatched route under /api.
 * Register after all /api routes.
 */
export function notFoundHandler(req, res) {
  const requestId = req.id ?? 'unknown';
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
      requestId,
    },
  });
}

/**
 * Central error handler. Must be registered last (four arguments).
 *
 * - Converts AppError → structured JSON response.
 * - Converts neo4j ServiceUnavailableError → 503 DB_UNAVAILABLE.
 * - Converts neo4j DatabaseError with query timeout → 504 QUERY_TIMEOUT.
 * - Everything else → 500 INTERNAL (details in log only, never in response).
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const requestId = req.id ?? 'unknown';

  // Known application errors
  if (err instanceof AppError) {
    const body = {
      error: { code: err.code, message: err.message, requestId },
    };
    if (err.details !== undefined) body.error.details = err.details;
    if (err.status === 429) res.setHeader('Retry-After', '60');
    if (err.status === 503) res.setHeader('Retry-After', '10');
    return res.status(err.status).json(body);
  }

  // body-parser PayloadTooLargeError
  if (err?.status === 413 || err?.type === 'entity.too.large') {
    return res.status(413).json({
      error: { code: 'VALIDATION_FAILED', message: 'Request body exceeds the 100 kB limit.', requestId },
    });
  }

  // Neo4j driver errors — map without leaking driver internals
  const errName = err?.name ?? '';
  const errMsg = err?.message ?? '';

  if (
    errName === 'ServiceUnavailableError' ||
    err?.code === 'ServiceUnavailable' ||
    err?.code === 'SessionExpired' ||
    errMsg.includes('ServiceUnavailable')
  ) {
    res.setHeader('Retry-After', '10');
    return res.status(503).json({
      error: { code: 'DB_UNAVAILABLE', message: 'Database is temporarily unavailable.', requestId },
    });
  }

  // Query timeout (Neo4j client timeout or driver deadline exceeded)
  if (errName === 'Neo4jError' && (errMsg.includes('timeout') || errMsg.includes('Timeout'))) {
    return res.status(504).json({
      error: { code: 'QUERY_TIMEOUT', message: 'Query timed out.', requestId },
    });
  }

  // Neo4j constraint violation → conflict
  if (errName === 'Neo4jError' && err?.code === 'Neo.ClientError.Schema.ConstraintValidationFailed') {
    return res.status(409).json({
      error: { code: 'CONFLICT', message: 'A resource with those details already exists.', requestId },
    });
  }

  // Fallback: log full error, return generic 500
  logger.error({ err, requestId }, 'unhandled error');
  return res.status(500).json({
    error: { code: 'INTERNAL', message: 'An unexpected error occurred.', requestId },
  });
}
