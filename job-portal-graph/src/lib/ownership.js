/**
 * src/lib/ownership.js — the OWNS_PROFILE ownership check (plan §9.1).
 *
 * Every profile read/write goes through this: an Account may only touch the
 * Candidate / Employer / Recruiter node it created.
 */
import { executeRead } from '../db/tx.js';
import { Errors } from './errors.js';

/** @throws {AppError} 403 FORBIDDEN when the profile is not owned by the account. */
export async function assertOwnsProfile(accountId, profileId) {
  const records = await executeRead((tx) =>
    tx.run(
      `MATCH (:Account {account_id: $accountId})-[:OWNS_PROFILE]->(p)
       WHERE p.cand_id = $profileId OR p.emp_id = $profileId OR p.rec_id = $profileId
       RETURN p IS NOT NULL AS owned`,
      { accountId, profileId },
    ),
  );
  if (records.records.length === 0) throw Errors.forbidden();
  return true;
}
