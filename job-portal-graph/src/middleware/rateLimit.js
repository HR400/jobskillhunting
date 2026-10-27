/**
 * src/middleware/rateLimit.js
 *
 * Global + /api/auth/* rate limiters using express-rate-limit.
 * Both return the plan §9.1 error contract on 429.
 */
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

/** Shared 429 handler that returns the project error contract. */
function rateLimitedHandler(req, res) {
  const requestId = req.id ?? 'unknown';
  res
    .status(429)
    .setHeader('Retry-After', String(Math.ceil((res.getHeader('Retry-After') ?? 60))))
    .json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please wait before retrying.',
        requestId,
      },
    });
}

/**
 * Global limiter: 300 requests per 1-minute window per IP.
 * Applied to every route.
 */
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.NODE_ENV === 'development' ? 2000 : 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitedHandler,
});

/**
 * Auth limiter: 15 requests per 15-minute window per IP (relaxed in dev).
 * Applied to /api/auth/* to slow brute-force attacks on login/register.
 * Skips GET requests so /api/auth/me session checks are never blocked.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.NODE_ENV === 'development' ? 500 : 15,
  skip: (req) => req.method === 'GET',
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitedHandler,
});

