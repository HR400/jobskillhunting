/**
 * Ticket 05 smoke test — run RETURN 1 through the driver and close cleanly.
 * Usage: node scripts/smoke-driver.js
 * Requires: .env in job-portal-graph/ with valid NEO4J_* vars.
 */
import { executeRead } from '../src/db/tx.js';
import { closeDriver } from '../src/db/driver.js';

try {
  const result = await executeRead((tx) => tx.run('RETURN 1 AS n'));
  const n = result.records[0].get('n');
  if (Number(n) !== 1) throw new Error(`Expected 1, got ${n}`);
  console.log('smoke: RETURN 1 OK');
} finally {
  await closeDriver();
  console.log('smoke: driver closed');
}
