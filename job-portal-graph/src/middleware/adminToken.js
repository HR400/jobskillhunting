/**
 * src/middleware/adminToken.js — operator-token guard (Tickets 47 / 55).
 *
 * There is no admin role in the account model, so ops endpoints are guarded by
 * `INGEST_ADMIN_TOKEN`. Without it the endpoint reports unavailable; a wrong
 * token is forbidden. Comparison is constant-time.
 */
import { timingSafeEqual } from 'node:crypto';
import { Errors } from '../lib/errors.js';
import { config } from '../config.js';

function tokenMatches(given) {
  const a = Buffer.from(String(given ?? ''));
  const b = Buffer.from(config.INGEST_ADMIN_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireAdminToken(req, res, next) {
  if (!config.INGEST_ADMIN_TOKEN) {
    return next(Errors.unavailable('Ingest is disabled: set INGEST_ADMIN_TOKEN.'));
  }
  if (!tokenMatches(req.get('x-ingest-token'))) {
    return next(Errors.forbidden('A valid ingest token is required.'));
  }
  return next();
}
