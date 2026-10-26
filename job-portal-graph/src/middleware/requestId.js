/**
 * src/middleware/requestId.js
 *
 * Attaches a UUID-based request ID to `req.id` and echoes it in
 * `X-Request-Id` response header. Must be the first middleware registered.
 */
import { randomUUID } from 'node:crypto';

export function requestId(req, res, next) {
  req.id = randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}
