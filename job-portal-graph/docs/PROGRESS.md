# Progress

Format: `## YYYY-MM-DD: <phase/ticket>` then what passed, what was skipped and why.

## 2026-10-27: Ticket 01 — workspace scaffold (Phase 0)

- Created `job-portal-graph/` with `package.json`, `.gitignore`, `.env.example`, `docker-compose.yml`.
- Installed runtime deps (express, neo4j-driver, zod, helmet, express-rate-limit, pino, pino-http, argon2, jsonwebtoken, cookie-parser, compression, dotenv, vis-network, vis-data, d3) and dev deps (vitest, supertest, playwright, eslint). `npm ls --depth=0` clean, 0 vulnerabilities.
- `docker compose config -q` parses.
- Skipped: Playwright browser download (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`). Browsers are only needed from Phase 4; install with `npx playwright install`.
- Decision: app lives in `job-portal-graph/` (plan §5–6). `plan.md` stays only at the repo root — not duplicated — to keep one source of truth; `job-portal-graph/` reads `../plan.md`.
- Not done yet: no app code, no Docker container running, no `DESIGN.md`.

## 2026-10-27: Ticket 02 — Neo4j running (Phase 0)

- `docker compose up -d neo4j` → healthy; `cypher-shell "RETURN 1"` returns 1. `RETURN gds.version()` → `2.6.9`.
- `dbms.components()` → **5.20.0 community**, both instances.
- `docker compose --profile test up -d neo4j-test` on 7688 → healthy; `RETURN 1` returns 1.
- Blocked and worked around: the `neo4j:5` image (JDK 21) dies with `SIGSEGV` in C1 JIT under this machine's **x86_64 colima VM** (Apple M3, QEMU). Pinned both services to `neo4j:5.20` (JDK 17), which boots fine. Still Neo4j 5, still pinned.
- Healthcheck is a Bash `/dev/tcp` probe on 7687: a `cypher-shell` healthcheck needs ~25 s of JVM startup under emulation and timed out at 10 s (leaving probe JVMs stacked up and slowing boot). `start_period: 180s`; boot takes ~90–180 s.
- Heap pinned to 1G (`AlwaysPreTouch` on the default quarter-of-VM heap made boot slower).
- Skipped: GDS plugin on the test instance — plan §6 only asks for it on the main instance (Phase 6 analytics). Skipped: `Testcontainers`/native install; Docker is what the plan specifies.
- Not done yet: no `src/`, no `.env` validation, no `DESIGN.md`.

## 2026-10-27: Ticket 03 — fail-fast config + boot (Phase 0)

- `src/config.js`: `dotenv/config` + zod schema; missing/blank `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `JWT_SECRET` exit 1 with `Invalid configuration:` and one line per field. `JWT_SECRET` must be ≥ 32 chars. `PORT` coerced to an int 1–65535, defaults 3000; `NODE_ENV` enum, defaults `development`.
- `src/lib/logger.js`: pino, `debug` outside production / `info` in it.
- `server.js`: config → `app.listen` → one log line; `SIGINT`/`SIGTERM` close the listener and exit 0.
- Checked: no `.env` → 4 readable missing-field lines, exit 1; blank and short `JWT_SECRET` → exit 1; `PORT=abc` / `99999` → exit 1; valid `.env` → listens on 3000, logs, `SIGINT` → exit 0.
- Skipped: unit tests — vitest harness is ticket 13, and these checks are process-level exit codes. No routes yet (JSON 404 is ticket 07); Express default 404 until then. `COOKIE_SECURE`, thresholds and the rest of `.env` are not validated until the ticket that uses them.

## 2026-10-27: Ticket 04 — DESIGN.md + tokens (Phase 0)

- `npx getdesign@latest add apple` wrote `DESIGN.md` (37 kB) at `job-portal-graph/DESIGN.md`; read in full.
- `public/css/tokens.css`: 91 custom properties — colour, type (family + size/weight/line/tracking per style), spacing, radius, elevation — plus a `prefers-color-scheme: dark` block that only re-points variables.
- Checked: only selectors are `:root` and the dark `@media`; every declaration is a `--token` (no component rules).
- Skipped: `public/` has no HTML/CSS beyond tokens yet (layout shell is ticket 32); no Apple icons, logos or SF Pro files — the stack is `system-ui`/`-apple-system` as DESIGN.md prescribes. Radius `md`/`pill` both kept because DESIGN.md uses `md` for Pearl capsules only. DESIGN.md documents no form error states, so error styling has no token precedent — will follow §10.7 UI states when built.
- Not done yet: no `src/db`, no app UI, no vitest harness.

## 2026-10-27: Ticket 05 — Driver + Transactions (Phase 1)

- `src/db/driver.js`: singleton neo4j driver, bounded pool (maxConnectionPoolSize 50), `verifyConnectivity()` at boot, `closeDriver()` for graceful shutdown.
- `src/db/tx.js`: `executeRead` / `executeWrite` wrappers; session always closed in `finally`; passes `QUERY_TIMEOUT_MS` to every managed transaction.
- `src/config.js` expanded with `QUERY_TIMEOUT_MS`, `COOKIE_SECURE`, threshold env vars, and optional ESCO/Adzuna/embedding vars — all with safe defaults.
- `server.js` updated: `verifyConnectivity()` runs before the server starts listening.
- Smoke script (`scripts/smoke-driver.js`): `RETURN 1` → 1, driver closes cleanly. Exit 0.
- Skipped: none.

## 2026-10-27: Ticket 06 — Migrations (Phase 1)

- `src/db/migrate.js`: runs all 14 constraints/indexes from plan §7.1 (`IF NOT EXISTS`). Tracks each as `(:Migration {id, applied_at})`. Schema commands run in a regular (auto-commit) session because DDL cannot run inside managed transactions.
- `server.js` updated: `runMigrations()` called after `verifyConnectivity()` on boot.
- Done-when check: Run 1 → `applied: 14, skipped: 0`. Run 2 → `applied: 0, skipped: 14`. Exit 0 both times. No duplicate nodes or constraints created.
- Skipped: none.

## 2026-10-27: Ticket 07 — Error Contract (Phase 1)

- `src/lib/errors.js`: `AppError` class, `ERROR_STATUS` table (all 12 codes from §9.1), `Errors` convenience factories.
- `src/middleware/requestId.js`: UUID attached to `req.id` and `X-Request-Id` response header.
- `src/middleware/errors.js`: `asyncHandler`, `notFoundHandler` (JSON 404 for `/api/*`), `errorHandler` (maps AppError, body-parser 413, Neo4j driver errors; no details leak on 500).
- `vitest.config.js` added; `pino-http` wired into `server.js` with PII redaction.
- Tests (28 total): 12 code→status rows, AppError properties, Errors factories, JSON 404 contract with matching `X-Request-Id` header. All green.
- Skipped: API integration tests — full supertest harness is ticket 13.

## 2026-10-27: Ticket 08 — Hardening (Phase 1)

- `src/middleware/rateLimit.js`: `globalLimiter` (300/min) + `authLimiter` (15/15 min), both returning `RATE_LIMITED` contract with `Retry-After`.
- `server.js` wired: helmet (CSP self-only + inline SVG/canvas allowed), CORS (localhost in dev, same-origin in prod), global+auth rate limiters, compression, 100 kB JSON body limit.
- `errorHandler` extended to handle `PayloadTooLargeError` → 413.
- Tests: helmet CSP + X-Frame-Options headers present; 413 on >100 kB body; 429 RATE_LIMITED with `RateLimit-Reset` when limit exceeded. All 28 tests green.
- Skipped: browser-level CSP validation and authenticated CORS — no routes yet. Will be covered in Phase 3 e2e.

## 2026-10-27: Ticket 09 — health + shutdown (Phase 1)

- `src/routes/health.js`: `GET /healthz` (200, no DB) and `GET /readyz` (`RETURN 1` through `executeRead`). Health routes mount before the rate limiters so probes are never throttled.
- `server.js`: SIGINT/SIGTERM stop the listener, drain in-flight requests, close the driver, exit 0; a 10 s force-exit guards a stuck client. `unhandledRejection` / `uncaughtException` log at fatal and exit 1.
- Done-when checked against 7688: `readyz` 200, then `docker compose stop neo4j-test` → 503 `DB_UNAVAILABLE` with `Retry-After`, SIGINT → exit 0. Unit test mocks the tx module for the 200/503 paths.
- Fixed while checking: driver 6 reports an unreachable server as `Neo4jError` with `code: "ServiceUnavailable"`, not a `ServiceUnavailableError`. `middleware/errors.js` now checks the code too — it returned 500 before.

## 2026-10-27: Ticket 10 — auth primitives (Phase 1)

- `src/lib/auth.js`: argon2id hash/verify (malformed hash → false, never throws), HS256 JWT sign/verify (7 d, `sub` + `role`), cookie helpers (`httpOnly`, `SameSite=Lax`, `Secure` from `COOKIE_SECURE`, `Path=/`).
- `src/middleware/auth.js`: `authenticate` (missing/bad/expired token → 401 `UNAUTHENTICATED`), `requireRole(...roles)` → 403 `FORBIDDEN`. `src/lib/ownership.js`: `assertOwnsProfile(accountId, profileId)` checks the `OWNS_PROFILE` edge.
- Tests: 9 new unit tests — hash round-trip, wrong password, malformed hash, no/bad/expired token 401s, wrong role 403, cookie flags. 40 total green.
- Skipped: `assertOwnsProfile` has no test yet — it needs the DB-backed harness that ticket 13 builds; first exercised by ticket 14. Token revocation/refresh is out of scope (stateless by design).

## 2026-10-27: Ticket 11 — register (Phase 1)

- `POST /api/auth/register` with a strict zod body `{ email, password, role, profile }`; `role` discriminates candidate/employer/recruiter, `candidate_type` discriminates freelancer/fresher/experienced. Email is trimmed and lower-cased; unknown fields are rejected. `middleware/validate.js` maps failures to 400 with `details[{path,message}]`.
- One Cypher statement per role kind (`src/queries/register.js`) creates `Account` + role profile + `OWNS_PROFILE` in a single write transaction, so a profile-stage failure cannot leave an `Account`. `dob`/`reg_date` are stored with Cypher `date()`, `created_at` with `datetime()`.
- Done-when checked against 7688: 201 with `{accountId, role, profileId}`, same email again → 409 `CONFLICT`, unknown role → 400. Atomicity: ran the fresher query with a deliberately invalid date → 0 `Account` rows for that email.
- Skipped: auto-login after register (login is ticket 12), email verification, password-strength rules beyond 8–128 chars. Test rows created on the throwaway instance only.

## 2026-10-27: Ticket 12 — login / logout / me (Phase 1)

- `POST /api/auth/login`: one read returns the account + profile id from `OWNS_PROFILE`; argon2 verify; 401 with the same `Invalid email or password.` for unknown email and wrong password. Sets the `auth` cookie (7 d).
- `POST /api/auth/logout` clears the cookie (204). `GET /api/auth/me` returns `{accountId, email, role, profileId}` from the token's account id.
- Done-when checked against 7688: wrong password 401, correct login 200 with `HttpOnly; SameSite=Lax`, `/me` 200 after a server restart (stateless JWT), logout clears the cookie and `/me` then 401.
- Skipped: server-side session revocation and refresh tokens (stateless by design); rate limiting on auth was already wired in ticket 08. 50 unit tests green.

## 2026-10-27: Ticket 13 — test harness (Phase 1)

- `src/app.js`: extracted `createApp()` factory from `server.js` so supertest can instantiate the application without binding to the runtime port.
- `src/db/driver.js`: added `setDriver()` hook allowing the test harness to redirect queries to the test driver.
- `tests/helpers/guard.js`: enforces Rule R4 (`assertTestInstance()`), throwing when `NEO4J_TEST_URI` is blank or equals `NEO4J_URI`.
- `tests/helpers/setup.js`: wired into `vitest.config.js` via `setupFiles` to assert guard on test suite startup.
- `tests/helpers/db.js`: manages connection to `NEO4J_TEST_URI` (7688), applies migrations to test DB on initialization, and provides `wipeTestDb()` and `closeTestDriver()`.
- `tests/helpers/app.js`: supertest factory (`getTestApp()`) backed by the 7688 instance.
- `tests/helpers/fixtures.js`: fixture builders (`createTestCandidate`, `createTestEmployer`, `wipeTestDb`) marked with `// TEST ONLY` header.
- `tests/integration/harness.test.js`: verified guard refuses runtime URI, verified trivial test (`RETURN 1`) passes against port 7688, and verified supertest factory. 55 total tests green.
- Skipped: none.

## 2026-10-27: Ticket 14 — candidate profile (Phase 1)

- `src/queries/candidates.js`: parameterized Cypher queries `GET_CANDIDATE_PROFILE`, `UPDATE_CANDIDATE_PROFILE` (using `SET c += $updates`), `DELETE_CANDIDATE_PROFILE` (`DETACH DELETE c, e, a`), plus `formatCandidateNode` (unwrapping neo4j integers/dates and deriving `candidate_type`).
- `src/routes/candidates.js`: `GET /api/candidates/me`, `PUT /api/candidates/me` with strict zod schema validation, and `DELETE /api/candidates/me`. Protected by `authenticate` and `requireRole('candidate')`.
- `src/app.js`: mounted `candidatesRouter` under `/api/candidates`.
- `tests/integration/candidateProfile.test.js`: verified unauthenticated gets 401, employer gets 403, candidate reads/updates own profile, and DELETE removes Candidate, Education, and Account leaving 0 orphan nodes and 0 edges. 61 total tests green.
- Skipped: none.

## 2026-10-27: Ticket 15 — candidate skills + education (Phase 1)

- `src/lib/skillKey.js`: canonical skill key normalizer (trim, lowercase, whitespace collapse).
- `src/queries/candidateSkillsEducation.js`: atomic skill queries (`DELETE_CANDIDATE_SKILL_EDGES`, `INSERT_CANDIDATE_SKILLS` with `MERGE (s:Skill {skill_key})`), education creation and deletion queries, `formatEducationNode`.
- `src/routes/candidates.js`: expanded with `PUT /me/skills` (proficiency 1–5, years 0–60, atomic delete-and-replace in a single managed write transaction), `POST /me/education` (creates linked `Education` node with UUID), and `DELETE /me/education/:eduId`.
- `vitest.config.js`: added `fileParallelism: false` to eliminate database concurrency race conditions across test suites.
- `tests/integration/candidateSkillsEducation.test.js`: verified out-of-range proficiency (>5) and years (>60) return 400 with exact field paths, verified atomic replacement leaves no stale `HAS_SKILL` edges, and verified education CRUD. 67 total tests green.
- Skipped: none.

## 2026-10-27: Ticket 16 — skill catalogue (Phase 1)

- `src/lib/skillKey.js`: canonical skillKey utility with full whitespace collapsing and lowercasing.
- `src/queries/skills.js`: `SEARCH_SKILLS` (searches `skill_key` and `name` with `LIMIT toInteger($limit)`), `UPSERT_SKILL` (`MERGE (s:Skill {skill_key})` with `isNew` detection).
- `src/routes/skills.js`: `GET /api/skills?q=` (searches local catalogue, validates query with zod), `POST /api/skills` (authenticated, strict schema, canonicalizes name, returns 201 for newly created or 200 for existing).
- `src/app.js`: mounted `skillsRouter` under `/api/skills`.
- `tests/unit/skillKey.test.js`: verified canonical normalization, handling of whitespace, tabs, newlines, and non-string inputs.
- `tests/integration/skillsCatalogue.test.js`: verified "Node.js", " node.js " and "NODE.JS" resolve to a single unique `Skill` node; verified Cypher injection string is safely stored as a literal name; verified search and query validation. 73 total tests green.
- Skipped: none (ESCO external suggestion integration is Ticket 17).

## 2026-10-27: Ticket 17 — ESCO suggestions (Phase 1)

- `src/ingest/esco.js`: `searchEsco(q, limit)` with a 3 s `AbortSignal.timeout`, in-memory cache (1 h for successes, 30 s for failures so a dead service is not retried on every keystroke), and `escoAvailable()`; it never throws.
- `GET /api/skills?q=`: local rows first, then ESCO suggestions marked `source: "esco"`; a local `skill_key` wins over an ESCO suggestion with the same key. The response gained `capabilities: { esco }` so the UI can hide the suggestion group honestly.
- Done-when checked (stubbed fetch): unreachable ESCO → 200 with local rows and `capabilities.esco: false`, no 500; reachable → suggestion appended once and cached (one fetch for two identical searches). A live call to `ec.europa.eu/esco/api/search` returned 3 suggestions with URIs.
- Tests: `tests/integration/escoSuggestions.test.js` (2). `skillsCatalogue.test.js` now stubs `fetch` so its local-only counts do not depend on the network.
- Skipped: storing `Skill.esco_uri` / importing ESCO trees (suggestions only, plan §4), and the typeahead UI (Phase 3).

## 2026-10-27: Ticket 18 — jobs create (Phase 1)

- `src/queries/jobs.js`: `CREATE_JOB` anchors ownership on `(:Account)-[:OWNS_PROFILE]->(:Employer)`, creates the `Job`, the `POSTED` edge and one `REQUIRES_SKILL` edge per requirement in a single statement (`FOREACH … MERGE Skill`). `posted_date` is `datetime()`, `closing_date` a native `date()`; `source: 'employer'`, `requirement_source` from the body (default `employer`).
- `src/routes/jobs.js`: `POST /api/jobs` — employer only, strict zod body (200-char title, 5000-char description, closing date `z.iso.date()`, ≤100 requirements with proficiency 1–5 / years 0–60, duplicate skill keys rejected).
- Done-when checked: candidate → 403; `2026-02-30` → 400 with `details[].path: closing_date`; requirements land as `REQUIRES_SKILL` edges with `min_proficiency`/`min_years`/`mandatory`; Cypher reads `.year` / `.epochSeconds`, proving native DATE/DATETIME.
- Tests: `tests/integration/jobsCreate.test.js` (4).
- Skipped: `Company`/`Location` links on create (not in this ticket), requirement editing (see ticket 19), recruiter posting on behalf of an employer.

## 2026-10-27: Ticket 19 — jobs read + edit (Phase 1)

- `src/queries/jobs.js`: `LIST_JOBS` (filters `status`, `q`, `employerId`, `skill_key`, `SKIP`/`LIMIT`), `GET_JOB_BY_ID` (job + employer + requirements), `UPDATE_JOB` (ownership inside the `MATCH`, so a foreign job yields no rows → 403).
- `src/routes/jobs.js`: `GET /api/jobs?status=&q=&employerId=&skill_key=&limit=&skip=` (limit ≤ 100 → else 400), `GET /api/jobs/:id` (404 when unknown), `PATCH /api/jobs/:id` (owner only; partial fields, `job_status` Open/Closed, empty body 400, unknown 404, foreign 403).
- Done-when checked: closing a job removes it from the open set used by the ranker; the ranked matcher itself is ticket 23, so `GET /api/jobs?status=Open` is the stand-in check now. Non-owner PATCH → 403.
- Tests: `tests/integration/jobsReadEdit.test.js` (3).
- Skipped: replacing requirements on PATCH (create-only for now), total-count metadata in the list response, role-specific visibility filtering.

## 2026-10-27: Ticket 20 — Phase 1 sweep (Phase 1)

- `tests/integration/phase1Sweep.test.js`: empty-DB walkthrough over HTTP — empty `/api/jobs`, employer register → duplicate 409, wrong password 401, login → `/me`, post job, candidate register → 403 on job post, invalid skills 400, valid skills, skill search, read job, unknown route 404, delete profile → `/me` 404, logout clears the cookie → `/me` 401.
- Code coverage: live sweep reaches `VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`; the deferred set is declared with the ticket that will produce each code, and an assertion fails if a new §9.1 code appears in neither list. A second test throws every `ERROR_STATUS` code through the real error handler and checks status + contract.
- Done-when checked: `npm test` → 16 files, 84 tests green.
- Skipped: live 429/503/504 in the sweep (they need limiter or DB outages; already unit-tested in tickets 07–09), and the 422 / `ALREADY_APPLIED` paths, which do not exist until ticket 27.

## 2026-10-27: Ticket 21 — reference matcher (Phase 2)

- `src/services/matching.js`: `requirementStatus` (satisfied / below / missing, coalesced null minimums), `scoreMatch` (1-dp percentage, `match_pct: null` when unscored, `mandatory_ok`, per-requirement breakdown) and `bandFor` (Strong ≥ 75, Moderate 40–74.9, Low < 40).
- `src/config.js` + `.env.example`: band thresholds moved to env (`BAND_STRONG=75`, `BAND_MODERATE=40`).
- `tests/unit/matching.test.js` (8): equal-to-minimum satisfied, one-below → below, null minimums with proficiency 1 / years 0, equal-to-minimum, zero requirements unscored, mandatory missing → `mandatory_ok: false`, 1-dp rounding, band edges 39.9 / 40 / 74.9 / 75.
- Skipped: comparing against Cypher — that is ticket 30; band labels are not yet in any Cypher/REST payload.

## 2026-10-27: Ticket 22 — Q1 + subgraph (Phase 2)

- `src/queries/q1Match.js`: Q1 verbatim from plan §8.2, plus `Q1_SUBGRAPH` (candidate, employer, job, required skills, held skills).
- `src/routes/match.js`: `GET /api/match/:candId/:jobId` (Q1, band label, breakdown with numbers) and `GET /api/match/:candId/:jobId/subgraph` (§9.4 `{nodes, edges, meta}` with `dbTimeMs` from the driver summary). Existence is checked first (`src/queries/exists.js`), so a missing id is 404 `NOT_FOUND` and a real job with no requirements is `match_pct: null`, band `Unscored` — never 0 % or 100 %.
- `src/lib/queryMeta.js`: `toNumber`, `plain` (Integer/Date/map → JSON-safe) and `queryMeta` (`queryName`, `cypher`, `params`, `dbTimeMs`, `rowCount`, `generatedAt`).
- Privacy: the subgraph drops `email`, `phone`, `dob`, `house_no`, `street` from the candidate node.
- Done-when checked: `EXPLAIN Q1` → `NodeUniqueIndexSeek` twice (cand_id, job_id), no `AllNodesScan`; missing candidate/job → 404. `tests/integration/matchQ1.test.js` (5) green: satisfied/below/missing, equal-to-minimum, unscored job, 404s, subgraph shape.
- Skipped: auth/ownership on match reads (consistent with public `GET /api/jobs`); the full redaction projection is ticket 54.

## 2026-10-27: Ticket 23 — candidate ranking (Phase 2)

- `src/queries/candidateRanking.js`: `RANKED_JOBS` (§8.3 — open, non-expired jobs with requirements; satisfied count through `HAS_SKILL`/`REQUIRES_SKILL`; `rounded match_pct`; `mand_matched = mand_total AS mandatory_ok`; ordered `mandatory_ok DESC, match_pct DESC`; jobs with zero satisfied requirements excluded) and `UNSCORED_JOBS` (open, non-expired, no `REQUIRES_SKILL` edge).
- `src/routes/match.js`: `GET /api/match/candidate/:candId/jobs?limit=&skip=` returns `ranked` and `unscored` separately, 404 for a missing candidate, 400 for `limit > 100`.
- Done-when checked: a candidate with no skills returns `ranked: []` (no 100 %), `unscored` intact and `message: 'No open jobs matched your current skills.'`; closed and expired jobs never appear. `tests/integration/candidateRanking.test.js` (3) green.
- Skipped: total-count pagination metadata and ranking auth (open reads, same as `GET /api/jobs`).

## 2026-10-27: Ticket 24 — Q2 skill gap (Phase 2)

- `src/queries/q2Gap.js`: Q2 verbatim from plan §8.2 (`NOT EXISTS { ... }` exclusion, `gap_type` satisfied-vs-held, `ORDER BY mandatory DESC, skill`).
- `src/routes/gap.js`: `GET /api/gap/:candId/:jobId` returns `gaps` plus `summary {total, below, missing}` and `meta`; missing candidate/job → 404 `NOT_FOUND` before the query, so an empty list always means "no gaps".
- Done-when checked: a fixture with a mandatory `below`, a non-mandatory `below` and a non-mandatory `missing` returns `['Zebra', 'Node.js', 'SQL']` (mandatory first), both `below` and `missing` present, satisfied `Neo4j` excluded, summary `{3, 2, 1}`. `tests/integration/skillGap.test.js` (3) green; full suite 20 files / 103 tests green.
- Skipped: pagination (a gap list is one job's requirements, ≤100 by construction) and auth/ownership on the read.

## 2026-10-27: Ticket 25 — Q3 referrals (Phase 2)

- `src/queries/q3Referrals.js`: Q3 from plan §8.2 (`REFERS*1..3`); `$maxHops` is a length filter because Neo4j 5 cannot parameterise hop range. `POST` looks up then `CREATE`s `(:Candidate)-[:REFERS {status, date}]->(:Candidate)`.
- `GET /api/referrals/:candId/chain?maxHops=` clamps hops to 1–3 (non-numeric → 3). Missing candidate → 404. `POST /api/referrals` is candidate-only; self-referral is 400; duplicate is 409.
- Done-when checked: A→B→C→D yields exactly one 3-hop path; closing the cycle D→A still returns only hops 1–3 with unique id tuples (relationship uniqueness, no loop).
- Tests: `tests/integration/referrals.test.js` (2) green.
- Skipped: blind-mode name redaction (ticket 54); auth on the chain read (same open-read pattern as Q1/Q2).

## 2026-10-27: Ticket 26 — Q4 recruiter recommendations (Phase 2)

- Already present in the tree from earlier work but unrecorded; verified and recorded now. `src/queries/q4Recruiter.js` is Q4 verbatim (§8.2 — open, non-expired, applicant excluded, `match_pct >= $threshold`). `GET /api/recruiter/:empId/recommendations` takes the threshold from `SCREEN_THRESHOLD`, clamps `limit` to ≤100, and 403s an employer who does not own `empId` (recruiters must `REPRESENT` it). Each row gets a band label and `meta` with `dbTimeMs`.
- Done-when checked: `tests/integration/recruiterRecommendations.test.js` — the applicant never appears, 39.9 % (67/168) is filtered at 40, a 40 % candidate is kept, and closed/expired jobs are absent.
- Skipped: pagination (`skip`) — Q4 is one `LIMIT`ed list per employer.

## 2026-10-27: Ticket 27 — apply + screening (Phase 2)

- `src/queries/applications.js`: `LOCK_JOB` increments `Job.app_seq`, which doubles as the per-job write lock; `FIND_APPLICATION`; `CREATE_APPLICATION` writes `APPLIED_TO` (`app_id`, `status: 'Applied'`, `date`) plus one `MATCHED_TO` and one `ASSESSED_FOR` per requirement. `src/routes/applications.js`: `POST /api/applications` (candidate only, `{ jobId }`), everything in one `executeWrite`.
- Screening order follows §8.4: Q1 inside the transaction → `match_pct < 40` → `422 MATCH_BELOW_THRESHOLD` with the threshold in the message and the breakdown in `details` → `ENFORCE_MANDATORY && !mandatory_ok` → `422 MANDATORY_SKILLS_MISSING` → duplicate check → write. Zero requirements is allowed and returns `scored: false`, `match_pct: null`, band `Unscored`.
- Concurrency: the job `SET` lock is taken before the duplicate check, so a second apply waits for the first to commit and then sees its edge. Done-when checked: 20 parallel applies → exactly one 201, nineteen 409 `ALREADY_APPLIED`; one `APPLIED_TO` row remains.
- Decisions recorded: `ASSESSED_FOR.match_percentage` is 100/0 (satisfied/not) and `assess_score` is the candidate's held proficiency (0 when missing) — an audit snapshot, not a new scoring rule. `MATCHED_TO.recommendation_level` is the band label.
- Skipped: application-status transition rules (any employer status is accepted), notifying the employer, applying to closed jobs (not in the ticket).

## 2026-10-27: Ticket 28 — application read/update (Phase 2)

- `GET /api/applications/me` (candidate only): own `APPLIED_TO` rows with job title, employer name, status, `final_result`, and the `MATCHED_TO` snapshot (`match_pct`, `recommendation_level`).
- `PATCH /api/applications/:id` (employer only): `status` ∈ `Applied | Screening | Interview | Offered | Rejected`, `final_result` ∈ `Pending | Passed | Failed`, at least one field. Ownership is inside the update `MATCH` (`Account-OWNS_PROFILE->Employer-POSTED->Job<-[APPLIED_TO]`), so a foreign employer gets 403; an unknown id is 404 first.
- Done-when checked: `tests/integration/applicationsReadUpdate.test.js` — candidate PATCH → 403, unrelated employer → 403, invalid status → 400, unknown id → 404, owner PATCH → 200 and the candidate's list reflects it; another candidate's application never appears in `/me`. Full suite: 24 files / 114 tests green.
- Skipped: status history/audit trail, recruiter PATCH (recruiters `REPRESENT` an employer but the ticket names employers), candidate withdrawal.

## 2026-10-27: Ticket 29 — what-if simulator (Phase 2)

- `src/queries/whatIf.js`: `WHAT_IF_RANKING` — scores every open, non-expired job with requirements twice in one pass (stored `HAS_SKILL` vs effective `max(stored, hypothetical)` per field via a `CASE`; `$hyp` passed as a map keyed by `skill_key`, subscripted through a separate `WITH` because an alias cannot be referenced in the `WITH` that defines it, and dynamic map subscripting was verified on the running 5.20 instance).
- `src/services/whatIf.js`: `buildHypotheticalMap` (duplicate entries merge with max per field), `whatIfRow`/`describeWhatIf` — per-job stored vs hypothetical `{matched, match_pct, band, mandatory_ok}`, `delta_pct`, `band_changed`, `newly_above_band`, `newly_unlocked`, `newly_mandatory_ok`, `rank_change` (stored rank − hypothetical rank, same mandatory-first ordering as the query), plus a `summary`.
- `POST /api/match/what-if` in `src/routes/match.js`: strict zod body `{candId, hypothetical[]}` (proficiency 1–5, years 0–60, ≤100 entries), 404 before querying for a missing candidate, everything in `executeRead` — no write transaction anywhere. Hypothetical skills that no open job requires are silently inert (no `Skill` node needed).
- Done-when checked: integration test counts all nodes and edges before and after the call — unchanged; a 0 %/Low job with a mandatory-below `Node.js` requirement becomes 50 %/Moderate with `newly_mandatory_ok: true`, an empty hypothetical list reproduces the stored scores, and unknown hypothetical keys are ignored.
- Tests: `tests/unit/whatIf.test.js` (5) + `tests/integration/whatIf.test.js` (4). Full suite: 26 files / 123 tests green.
- Fixed while writing: `CASE` branches needed `coalesce(..., 0)` on both sides — a null proficiency leaked into `eff_ok`, and Cypher `all()` over a list containing null returns null instead of false.
- Skipped: jobs with zero requirements are not part of the what-if payload (they can never change score; the ranking endpoint lists them as unscored); pagination (deltas are one bounded list); auth (same open-read pattern as Q1/Q2).

## 2026-10-27: Ticket 30 — Cypher-vs-reference suite (Phase 2)

- `tests/integration/cypherVsReference.test.js` (8 tests): a TEST ONLY fixture on the throwaway instance — 4 candidates (skilled, equal-to-minimum, skill-less, bulk-skill holders), 8 jobs (mixed statuses, null minimums, zero requirements, a 103-requirement job for rounding edges, closed, expired), one applied pair and a referral chain with a cycle.
- Q1 and Q2 are asserted equal to `scoreMatch`/`q2FromReference` for **every candidate × job pair (32)**; Q4 is asserted equal at threshold 0 with closed/expired/applied/zero-match pairs excluded explicitly; Q3 walks the chain once and stops at 3 hops despite the cycle.
- Boundary cases explicit: 2/5 = exactly 40 % → Moderate, 3/4 = exactly 75 % → Strong, 41/103 = 39.8 % → Low, 77/103 = 74.8 % → Moderate (just-below values come from real rounded Cypher output, not synthetic pcts); equal-to-minimum satisfied; null minimums → missing; mandatory missing → `mandatory_ok: false` in both engines; zero requirements → unscored in both.
- Fixture inputs (held skills, requirements) are read back from the graph rather than trusted from the JS literals, so a bad fixture cannot fake an engine agreement; a sanity test pins one `POSTED` edge per job and the exact requirement counts.
- Note: this ticket is one test file by nature and lands at ~330 hand-written lines, over the ≤100 target — kept whole because the fixture and the four comparisons belong together (splitting would duplicate the fixture); the rule's split option would have renumbered tickets the user explicitly queued as 29–32.
- Fixed while writing: the fixture's job Cypher created a `POSTED` edge per requirement (inflating Q4's `count(r)` totals — pcts like 11.1 % instead of 33.3 %) and starved the zero-requirement job of its `POSTED` edge; jobs/requirements/POSTED are now three statements.
- Skipped: `RANKED_JOBS`/`UNSCORED_JOBS` in this suite (same scoring as Q4 anchored on the candidate; covered by ticket 23), Q3 name redaction (ticket 54). Full suite: 27 files / 131 tests green.

## 2026-10-27: Ticket 31 — API client + store (Phase 3)

- `public/js/api.js`: fetch wrapper — sends an `X-Request-Id` per call, `same-origin` credentials, resolves to the parsed body; failures throw `ApiError {status, code, message, details, requestId}` built from the §9.1 contract, with fallbacks for non-JSON bodies (echoed `X-Request-Id` header → `INTERNAL`) and dead networks (`code: "NETWORK"`, no response object). 204s resolve to null.
- `public/js/store.js`: pub/sub store with exactly the §10.5 keys — `mode`, `selection`, `hover`, `filters`, `hypothetical` — plus `getState`/`setState`/`subscribe` and `toggleHypothetical`/`resetHypothetical` for the What-if chip (ticket 43).
- Static serving wired in `src/app.js` (`express.static('public')` before the API routes; no path overlap). `/vendor/*` for node_modules libraries is deferred to ticket 36 when vis-network/d3 are first imported.
- Done-when checked in a real browser via a DEV SMOKE harness (`public/smoke.html` + `public/js/smoke.js`, inputs typed into the form): register → 201 `{accountId, role, profileId}`, login → cookie set (HttpOnly — `document.cookie` stays empty), `me` → account row, ranked list through the client → `RANKED_JOBS` payload with `ranked: []` and the real message on an empty profile. No console errors.
- Tests: `tests/unit/frontend.test.js` (7) — client contract paths and store merge/notify/toggle, fetch stubbed.
- Skipped: SSE client support in `api.js` (ticket 39 builds the stream consumer separately), convenience helpers for specific endpoints (routes are called directly), no retry/backoff on 503 (honest error states per §10.7).

## 2026-10-27: Ticket 32 — layout shell (Phase 3)

- `public/index.html` (81 lines): the §10.2 three-column shell — sticky top bar (brand, 7 ARIA tabs, inspector toggle, session state), left profile sheet, centre canvas slot + 2×2 charts grid, right inspector. Every mode except `match` shows a placeholder note; canvas/charts/inspector are labelled placeholders for tickets 33–37.
- `public/style.css` (216 lines): grid `minmax(240px,340px) / 1fr / minmax(280px,380px)`, collapses to 2 columns + slide-out inspector drawer below 1100 px and 1 column below 700 px; all values from `tokens.css` variables (only structural grid numbers are literal); `:focus-visible` outline, `prefers-reduced-motion` kill-switch.
- `public/js/app.js` (105 lines): tabs wired to the store's `mode` (ARIA tabs pattern, roving tabindex + Arrow/Home/End, automatic activation), inspector drawer toggle with `aria-expanded`, session state via the ticket-31 client (`/auth/me` → email + Log out, 401 → "Not signed in", other errors → "Server unreachable").
- Fixed dark mode: light surfaces leaked through — `--color-surface-pearl` (panel background), `--color-canvas` and `--color-ink-muted-48` were not re-pointed in `tokens.css`'s dark block. Three variable re-points in that block (the file's stated pattern), no component rules.
- Checks: `scripts/check-layout-shell.mjs` (Playwright, system Chrome via `channel: 'chrome'` — no browser download) — all 11 pass: no horizontal overflow at 1280 px and 360 px, 3 tracks → 1 at 360 px, keyboard Arrow/Home/End activation, dark page flips to `rgb(39, 39, 41)`, drawer opens, reduced-motion transition `1e-05s`; light/dark/360/drawer screenshots reviewed. Lighthouse: accessibility 1.0, best-practices 1.0 (SEO 0.75 → meta description added, the only flagged item). Sign-in flows exercised live through the real `/auth/me` on the smoke instance.
- Tests: no vitest additions — the shell is DOM/CSS + wiring already asserted by the check script and 7 frontend unit tests. Full suite after: 28 files / 138 tests green.
- Note: the check script runs against a live server (`node scripts/check-layout-shell.mjs [baseUrl]`) and is not wired into `npm test`; it is the reusable harness for later view tickets.
- Skipped: no content panels yet (canvas, inspector details, charts arrive with tickets 36–37); sign-in on the page itself is the wizard's job (ticket 33) — the shell links `/smoke.html` meanwhile; no favicon/robots.txt (404s in logs, cosmetic, not in the ticket).

## 2026-10-27: Ticket 33 — wizard: account + basics (Phase 3)

- `public/js/forms.js`: steps 1–2 implemented without synthetic default data (`fname`/`lname` collected directly in step 1 alongside `candidate_type`). Step 2 renders type-specific extras: `hourly_rate` and `portfolio_url` for freelancers, `grad_year` for freshers, `total_exp` and `current_company` for experienced candidates.
- Server validation error mapping: `showFieldErrors(form, details)` maps `details[].path` (with `profile.` prefix stripped) to target inputs via `[name="..."]`, applying `.field-invalid` styles and rendering `.field-error` message elements.
- Done-when checked: `tests/integration/wizardFields.test.js` verified that server validation errors from both `POST /api/auth/register` and `PUT /api/candidates/me` carry field-path details that map to exact inputs; registered candidates transition to step 2 with no fake data. 13 tests green.
- Skipped: step 3 (skills) is ticket 34, steps 4–5 are ticket 35.

## 2026-10-27: Ticket 34 — wizard: skills (Phase 3)

- `public/js/forms.js`: step 3 renders skill list with proficiency labels (`1/5 Beginner` to `5/5 Expert`), years of experience (0–60), optional `last_used_year`, and removal buttons. Typeahead queries `/api/skills?q=` with 250 ms debounce; offers `Add "..." as a new skill…` with confirm dialog when not found in catalogue.
- `PUT /api/candidates/me/skills`: canonicalizes `skillKey`, executes atomic replacement (`DELETE_CANDIDATE_SKILL_EDGES` then `INSERT_CANDIDATE_SKILLS` with `MERGE (s:Skill {skill_key})`).
- Done-when checked: `tests/integration/wizardSkills.test.js` verified that a skill entered with different case (`NODE.JS` vs existing `Node.js`) normalizes to `node.js` and attaches via `HAS_SKILL` edge to the single existing `Skill` node without creating a duplicate. Test green.
- Skipped: steps 4–5 (education, review) are ticket 35.

## 2026-10-27: Ticket 35 — wizard: education, location, review (Phase 3)

- `public/js/forms.js`: step 4 implements education management (degree, university, start/end year, cgpa, specialization) via `POST/DELETE /api/candidates/me/education`. Step 5 implements the review summary card displaying only user-entered values (no synthetic defaults) across account, basics, skills, and education. Submitting transitions to profile-ready state and fires `session-change`/`profile-ready` events.
- `public/style.css`: added styles for `.edu-row`, `.review-card`, `.review-section`, `.review-title`, and `.review-entry` adhering to `tokens.css`.
- Done-when checked: `tests/integration/wizardReview.test.js` verified that a full registration, basics update, skill submission, and education creation flow lands exactly 1 candidate profile with only entered values in Neo4j, non-entered fields remain absent/null, and education and skills edges are linked. Test green.
- Skipped: canvas & inspector are ticket 36.

## 2026-10-27: Ticket 36 — canvas + inspector (Phase 3)

- `src/app.js`: mounted static vendor assets `/vendor/vis-network` (serving vis-network standalone UMD bundle and stylesheets) and `/vendor/d3` (serving D3 bundle).
- `public/js/canvas.js`: implemented vis-network 2D canvas with physics stabilization then freeze (`network.setOptions({ physics: false })`), ~300-node safety cap, type-based node styling (Candidate, Job, Employer, Skill) and state-based edge styling (green satisfied, amber below, red dashed missing, neutral gray).
- `public/js/inspector.js`: implemented inspector panel displaying real node and edge properties, match score, band, mandatory status, matched count, per-skill breakdown table (required vs held proficiency/years and mandatory flag), and query transparency drawer (`Q1_MATCH`, `dbTimeMs`, `rowCount`).
- `public/js/app.js`: wired candidate graph loading and canvas node click to inspector (`inspectJob(candId, jobId)`).
- `public/style.css`: added styles for `.inspector-metrics`, `.metric-card`, `.inspector-table`, and status indicators adhering to `tokens.css`.
- Done-when checked: `tests/integration/canvasInspector.test.js` verified that `/vendor/vis-network/standalone/umd/vis-network.min.js` returns 200 with javascript MIME type, `/api/match/:candId/:jobId/subgraph` returns candidate/job/employer/skill nodes with satisfied edges, and `/api/match/:candId/:jobId` returns match metrics (100 %, Strong, mandatory_ok, breakdown) matching the inspector contract. Full suite: 32 files / 147 tests green.
- Skipped: charts (bars, radar) are ticket 37, Playwright browser smoke is ticket 38.

## 2026-10-27: Ticket 37 — charts (Phase 3)

- `public/js/charts/bars.js`: horizontal D3 SVG bar chart of ranked matches with `match_pct` width, color-coded by band (Strong green, Moderate amber, Low muted), mandatory flag, click selection dispatching `bars-select`, and accessible table fallback toggle.
- `public/js/charts/radar.js`: circular radar chart showing required vs held skill proficiency with closed polygonal paths, labelled axes, and accessible table fallback toggle.
- `public/js/app.js`: wired D3 chart instances into layout slots `#ranked-bars` and `#skill-radar`; updates charts when candidate ranking loads or when a job node is selected on the canvas.
- `public/style.css`: added styles for `.chart-toolbar`, `.chart-toggle-btn`, `.chart-table`, and SVG styling adhering to `tokens.css`.
- Done-when checked: `tests/integration/charts.test.js` verified that `/vendor/d3/d3.min.js` serves with JavaScript MIME type, Q1 breakdown supplies all fields bars and radar consume, and ranked list values match direct Q1 values ensuring table-toggle parity. All tests green.
- Skipped: linked brushing between charts and canvas/inspector is ticket 41.

## 2026-10-27: Ticket 38 — Phase 3 smoke (Phase 3)

- `scripts/check-phase3-smoke.mjs`: Playwright smoke script using system Chrome — tests empty-state `/api/jobs`, candidate registration, basics entry (experienced role), skill search & proficiency entry, education entry, review card validation with only real entered data (no synthetic values), submit profile, canvas rendered with candidate node, and session/ranking empty state validation.
- Fixed during check: corrected duplicate identifier `meta` in `public/js/inspector.js` causing client parse failure; corrected role selection in smoke script.
- Done-when checked: `scripts/check-phase3-smoke.mjs` executed green and saved 10 screenshots to `scripts/out-phase3/` displaying real entered data.
- Skipped: none.

## 2026-10-27: Ticket 39 — SSE stream (Phase 4)

- `src/queries/matchStream.js`: queries `STREAM_CANDIDATE`, `STREAM_SKILLS`, and `STREAM_SCORED_JOBS` pinned to Neo4j 5 syntax.
- `src/routes/match.js`: implemented `GET /api/match/stream` per plan §9.3 — authenticates candidate, limits to 2 concurrent streams per user, flushes per record, sends 15 s heartbeat comments, aborts and cleans up Neo4j session on `req.close`. Emits ordered events: `candidate` → `skill` × N → `job_scored` × N → `done`.
- Done-when checked: `tests/integration/sseStream.test.js` verified unauthenticated 401, employer 403, missing `candId` 400, and live ordered SSE event emission over HTTP. All tests green.
- Skipped: client-side animation is ticket 40.

## 2026-10-27: Ticket 40 — reveal (Phase 4)

- `public/js/reveal.js`: implemented `startReveal` consuming `GET /api/match/stream?candId=...`. Sequence:
  1. Seed: candidate node placed at canvas centre.
  2. Skills fan out: Skill nodes attached via `HAS_SKILL` edges with proficiency width and labels.
  3. Demand wave: Job nodes added connected through shared Skill nodes; node size proportional to `match_pct`, dashed border if `!mandatory_ok`.
  4. Edge states: solid green (satisfied), amber (below), red dashed (missing).
  5. Verdict strip: computed totals template rendered into `#reveal-strip`.
- Reduced-motion: when `prefers-reduced-motion: reduce` is detected, animations render instantly in the exact same sequence without omitting any stream nodes or edges.
- `public/js/app.js`: wired `startReveal` into `loadCandidateMatch` with static fallback.
- Done-when checked: `tests/integration/reveal.test.js` verified sequential ordering, accurate canvas node/edge mapping strictly from stream data, reduced-motion parity, and verdict strip summary. Full test suite: 35 files / 156 tests green.
- Skipped: linked brushing (radar ↔ canvas ↔ gap ↔ bars) is ticket 41.

