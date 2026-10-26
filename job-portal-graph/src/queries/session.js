/**
 * src/queries/session.js — login lookup and account-by-id lookup.
 *
 * Credentials stay on Account. The profile id comes from the OWNS_PROFILE edge,
 * which is also the ownership check used by profile routes.
 */
export const LOGIN = {
  name: 'auth.login',
  cypher: `MATCH (a:Account {email: $email})
OPTIONAL MATCH (a)-[:OWNS_PROFILE]->(p)
RETURN a.account_id AS accountId, a.password_hash AS passwordHash, a.role AS role,
       coalesce(p.cand_id, p.emp_id, p.rec_id) AS profileId`,
};

export const ACCOUNT_BY_ID = {
  name: 'auth.accountById',
  cypher: `MATCH (a:Account {account_id: $accountId})
OPTIONAL MATCH (a)-[:OWNS_PROFILE]->(p)
RETURN a.account_id AS accountId, a.email AS email, a.role AS role,
       coalesce(p.cand_id, p.emp_id, p.rec_id) AS profileId`,
};
