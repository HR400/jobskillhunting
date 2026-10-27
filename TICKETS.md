# TICKETS.md — job-portal-graph

Build order for `plan.md`. One ticket per chat session; do not start ticket N+1 until N's
done-when check has run and its result is in `job-portal-graph/docs/PROGRESS.md`.

## Rules for every ticket

- Target ≤ **100 hand-written changed lines**. If it does not fit, split the ticket and
  renumber the rest.
- `plan.md` wins on behaviour, `DESIGN.md` wins on visual style. No fake data (R1): no seeds,
  no demo rows, no random values in a data path.
- Parameterised Cypher only; labels/relationship types are literals in `src/queries/`.
- The pinned server is **Neo4j 5**. Do not use Cypher 25-only clauses (`LET`, `FILTER`,
  `FINISH`, `INSERT`, `SEARCH`, `USE`): the installed Neo4j skills assume 2025.x and will
  suggest them. Verify anything unusual on the running instance.
- Stack actually installed: Express **5**, zod **4**, `neo4j-driver` **6**, Node **26**
  (>=20 required). Express 5 changes wildcard route syntax (`/*splat`) and forwards async
  errors to the error middleware.
- New non-trivial logic gets one small test. Tests use the throwaway instance only.
- Every ticket appends one line to `docs/PROGRESS.md`: what passed, what was skipped, why.

## Phase 0 — scaffolding

- [x] **01 Workspace scaffold.** `job-portal-graph/` with `package.json`, `.gitignore`,
  `.env.example`, `docker-compose.yml`, deps installed, `docs/PROGRESS.md`.
  Done when `npm ls --depth=0` and `docker compose config -q` are clean. *(done)*
- [ ] **02 Neo4j running.** `docker compose up -d neo4j`; wait for healthy; `RETURN 1` via
  `cypher-shell`; confirm the GDS plugin loaded (`RETURN gds.version()`); start the `test`
  profile on 7688 and repeat. Done when both instances answer and the version is recorded in
  `PROGRESS.md`. *(done)*
- [ ] **03 Fail-fast config + boot.** `src/config.js` (dotenv + zod, readable errors),
  `src/lib/logger.js` (pino), `server.js` (config → listen → log).
  Done when a missing `NEO4J_PASSWORD` or `JWT_SECRET` exits 1 with a readable message, and a
  valid `.env` starts and shuts down on SIGINT. *(done)*
- [ ] **04 DESIGN.md + tokens.** `npx getdesign@latest add apple`, read it, extract colour /
  type / spacing / radius / elevation into `public/css/tokens.css`.
  Done when `DESIGN.md` exists and `tokens.css` contains only variables (no component rules).
  *(done)*

## Phase 1 — data layer, auth, CRUD

- [ ] **05 Driver + transactions.** `src/db/driver.js` (single driver, bounded pool,
  `verifyConnectivity`, `QUERY_TIMEOUT_MS`), `src/db/tx.js` (`executeRead` / `executeWrite`
  wrappers, session closed in `finally`).
  Done when a smoke script returns `RETURN 1` and the driver closes cleanly.
- [ ] **06 Migrations.** `src/db/migrate.js`: every constraint/index from plan §7.1, tracked as
  `(:Migration {id, applied_at})`, run on boot.
  Done when two consecutive runs succeed and create nothing twice.
- [ ] **07 Error contract.** `src/lib/errors.js` (code → status table of §9.1),
  `middleware/requestId.js`, `middleware/errors.js`, `asyncHandler`, JSON 404 for `/api/*`,
  `pino-http` with no PII.
  Done when unit tests cover every code→status row and unknown `/api/x` returns the contract
  with a `requestId`.
- [ ] **08 Hardening.** `helmet` (CSP self-only, inline SVG allowed), CORS, rate limits
  (global + stricter `/api/auth/*`), `compression`, 100 kB JSON limit.
  Done when headers are present, an oversized body returns 413, and the limiter returns 429
  `RATE_LIMITED` with `Retry-After`.
- [ ] **09 Health + shutdown.** `GET /healthz`, `GET /readyz` (`RETURN 1` through the driver),
  SIGTERM/SIGINT drain, `unhandledRejection` / `uncaughtException` log-and-exit.
  Done when `readyz` is 200 with Neo4j up, 503 `DB_UNAVAILABLE` with it stopped, and the
  process exits 0 on SIGINT.
- [ ] **10 Auth primitives.** argon2id hash/verify, JWT cookie sign/verify, `authenticate`,
  `requireRole`, and an `OWNS_PROFILE` ownership check helper.
  Done when unit tests cover hash round-trip, expired/bad token → 401, wrong role → 403.
- [ ] **11 Register.** `POST /api/auth/register` in one write transaction: `Account` + profile
  + `OWNS_PROFILE`, role-specific fields, zod `.strict()`.
  Done when a duplicate email is 409 `CONFLICT`, an invalid role is 400, and a failed profile
  write leaves no `Account` behind.
- [ ] **12 Login / logout / me.** Cookie (`httpOnly`, `SameSite=Lax`, `Secure` from env),
  generic 401 message, `GET /api/auth/me` returning role + profile id.
  Done when a wrong password is 401 and `me` works after restart (stateless token).
- [x] **13 Test harness.** `vitest.config.js`, a guard that refuses to run when
  `NEO4J_TEST_URI` equals `NEO4J_URI`, `tests/helpers/app.js` (supertest factory), fixture
  builder whose header says `TEST ONLY`.
  Done when `npm test` runs one trivial test against 7688 and refuses the runtime URI.
- [x] **14 Candidate profile.** `GET/PUT /api/candidates/me`,
  `DELETE /api/candidates/me` (`DETACH DELETE` profile, education, `Account`).
  Done when another account gets 403, and delete leaves no orphan nodes or edges.
- [x] **15 Candidate skills + education.** `PUT /api/candidates/me/skills` (atomic replace,
  proficiency 1–5, years 0–60, optional `last_used_year`), `POST/DELETE .../education`.
  Done when an out-of-range value returns 400 with the field path and a replace leaves no
  stale `HAS_SKILL` edges.
- [x] **16 Skill catalogue.** `src/lib/skillKey.js` (lower-case, trim, collapse whitespace),
  `GET /api/skills?q=`, `POST /api/skills`.
  Done when "Node.js", " node.js " and "NODE.JS" resolve to one `Skill`, and a Cypher-injection
  string is stored as a literal name.
- [x] **17 ESCO suggestions.** `src/ingest/esco.js`: timeout, cached, results marked
  `source: "esco"`, failure never breaks local results.
  Done when ESCO is unreachable and `/api/skills?q=x` still returns local rows with
  `capabilities.esco: false`, no 500.
- [x] **18 Jobs create.** `POST /api/jobs` (employer only) with embedded requirements,
  `requirement_source`, native `DATE`/`DATETIME` conversion, ownership.
  Done when a non-employer is 403, a bad date is 400, and requirements land as
  `REQUIRES_SKILL` edges.
- [x] **19 Jobs read + edit.** `GET /api/jobs` (filters, `limit ≤ 100`, `skip`),
  `GET /api/jobs/:id`, `PATCH /api/jobs/:id` (edit/close).
  Done when closing a job makes it disappear from the ranked-match set and a non-owner gets 403.
- [x] **20 Phase 1 sweep.** A supertest sweep that reaches every code in §9.1, an empty-DB CRUD
  walkthrough, and `npm test` green. Done when recorded in `PROGRESS.md`.

## Phase 2 — matching engine

- [x] **21 Reference matcher.** `src/services/matching.js` implementing §8.1 exactly, plus
  unit tests: equal-to-minimum, null minimums, zero requirements, mandatory missing, band edges.
  Done when tests cover 39.9 / 40 / 74.9 / 75.
- [x] **22 Q1.** `src/queries/q1Match.js` (plan §8.2 Q1), `GET /api/match/:candId/:jobId`,
  `GET .../subgraph`, 404 when the candidate or job is missing, `PROFILE` it.
  Done when a missing id returns 404 (not 0 %) and the plan uses the id indexes.
- [x] **23 Candidate ranking.** §8.3 query + `GET /api/match/candidate/:candId/jobs`,
  unscored bucket kept separate, pagination.
  Done when a candidate with no skills gets an empty ranked list plus the real message, never
  100 %.
- [x] **24 Q2 skill gap.** Query + `GET /api/gap/:candId/:jobId`, ordered mandatory first.
  Done when `below` and `missing` are both represented in a fixture.
- [x] **25 Q3 referrals.** Query + `POST /api/referrals`, `GET /api/referrals/:candId/chain`
  (`maxHops` clamped 1–3), cycle-safe.
  Done when a 3-hop chain returns once and a cycle does not loop.
- [x] **26 Q4 recruiter recommendations.** Query + `GET /api/recruiter/:empId/recommendations`,
  threshold from env, excludes applicants and closed/expired jobs.
  Done when an applicant never appears and a 39.9 % candidate is filtered at 40.
- [x] **27 Apply + screening.** `POST /api/applications` in one write tx: Q1 inside the tx,
  threshold 422, mandatory 422, `MERGE` dedupe → 409, snapshot `MATCHED_TO` + one
  `ASSESSED_FOR` per requirement.
  Done when 20 parallel applies yield exactly one 201 and the rest 409.
- [x] **28 Application read/update.** `GET /api/applications/me`,
  `PATCH /api/applications/:id` (employer status/`final_result`, ownership).
  Done when a candidate cannot patch status and an unrelated employer gets 403.
- [ ] **29 What-if.** `src/services/whatIf.js` (`max(stored, hypothetical)` per skill) +
  `POST /api/match/what-if` in `executeRead`, returning deltas and band changes.
  Done when node/edge counts are unchanged after the call.
- [ ] **30 Cypher-vs-reference suite.** TEST ONLY fixtures for Q1–Q4, asserting Cypher equals
  `matching.js` for every candidate/job pair in the fixture.
  Done when the suite is green and boundary cases are explicit.

## Phase 3 — frontend foundation

- [ ] **31 API client + store.** `public/js/api.js` (fetch wrapper, error contract, request id),
  `public/js/store.js` (`selection`, `hover`, `filters`, `hypothetical`, `mode`).
  Done when a page can register, log in, and read the ranked list through the client.
- [ ] **32 Layout shell.** `public/index.html`, `public/style.css`, `public/js/app.js` — the
  three-column layout and tabs of §10.2 on `tokens.css` only, responsive to 360 px, visible
  focus, reduced-motion media query.
  Done when light/dark and 360 px render without overflow and the tab order is keyboard-usable.
- [x] **33 Wizard: account + basics.** `public/js/forms.js` steps 1–2 (account, basics,
  freelancer/fresher/experienced extras), no default values that look like data.
  Done when server validation errors map back onto the exact field. *(done)*
- [x] **34 Wizard: skills.** Typeahead against `/api/skills?q=`, 1–5 control with labels, years,
  optional last-used year, confirm-to-add for unknown skills.
  Done when a skill typed with different case attaches to the existing `Skill` node. *(done)*
- [x] **35 Wizard: education, location, review.** Steps 4–5 + submit; atomic profile write.
  Done when the review step shows only entered values and submit lands one profile. *(done)*
- [x] **36 Canvas + inspector.** `public/js/canvas.js` (vis-network, stabilise then freeze,
  ~300-node cap), `inspector.js` (real node/edge props, per-skill breakdown, employer).
  Done when clicking a job shows numbers equal to `/api/match/:candId/:jobId`. *(done)*
- [x] **37 Charts.** `public/js/charts/bars.js` (ranked bars) and `radar.js` (candidate vs
  required), D3 SVG, table fallback.
  Done when every value matches the API payload and the table toggle exposes the same rows. *(done)*
- [x] **38 Phase 3 smoke.** Playwright: register → skills → education → review → canvas,
  plus no-jobs and no-skills empty states.
  Done when the run is green and the screenshots show real entered data. *(done)*

## Phase 4 — reveal and linked views

- [x] **39 SSE stream.** `GET /api/match/stream` per §9.3: flush per record, 15 s heartbeat,
  2 streams per user, abort on `req.close`, `error` event never a 500 page.
  Done when curling it shows ordered events and dropping the client frees the transaction. *(done)*
- [x] **40 Reveal.** `public/js/reveal.js`: seed → skills → demand wave → edge states → verdict
  strip; reduced-motion renders instantly in the same order.
  Done when every drawn element exists in a stream event and reduced motion loses no information. *(done)*
- [ ] **41 Linked views.** Brushing both ways through the store: radar ↔ canvas ↔ gap ↔ bars.
  Done when hovering a skill highlights all three views and selecting a node filters the charts.
- [ ] **42 Query drawer.** Name, Cypher, params, row count, `dbTimeMs` from the driver summary.
  Done when the drawer's number equals the server-reported `dbTimeMs`.
- [ ] **43 What-if tab.** Hypothetical skills, labelled numbers, newly unlocked jobs outlined,
  reset.
  Done when the delta matches `/api/match/what-if` and no write occurs.
- [ ] **44 Gap + referral views.** Gap list with `satisfied/below/missing` states and the
  referral chain from Q3, blind-safe names.
  Done when the gap list matches Q2's order and a cycle-free chain renders.
- [ ] **45 Recruiter view.** Job picker → Q4 matrix + canvas rings, blind masking until 75.
  Done when an unmasked candidate has no name/DOB/contact and an unmask is logged.
- [ ] **46 Phase 4 e2e.** Playwright: reveal completes, inspector equals API, links work both
  ways, reduced motion, keyboard-only, SSE reconnect fallback.
  Done when green on the test stack.

## Phase 5 — real data ingestion

- [ ] **47 Ingest core.** Adapter registry, `POST /api/ingest/:adapter/run` (admin),
  dedupe by `external_ref`, `source`/`source_url`/`fetched_at`, capabilities flag.
  Done when running one adapter twice creates no duplicate job.
- [ ] **48 Arbeitnow + Adzuna + ATS adapters.** Cache, rate limits, attribution, deterministic
  requirement extraction (`requirement_source: "extracted"`, null minimums).
  Done when a re-run is idempotent and extracted requirements are exact-name/alias matches only.
- [ ] **49 Ingest UI.** Source link on every ingested job, unscored handling, *Import real jobs*
  only when an adapter is configured.

## Phase 6 — advanced features (each flag-gated with an honest unavailable state)

- [ ] **50 Capabilities + GDS probe.** `GET /api/meta/capabilities`, `gds.version()` at boot,
  `capabilities.{esco,feeds,gds,vector}`.
- [ ] **51 PageRank.** Endpoint + UI field `referrer_authority`, never folded into `match_pct`.
- [ ] **52 Louvain communities.** Candidate–skill projection, labels from top skills in the data.
- [ ] **53 Career path.** Real co-requirement `Skill–Skill` weights + GDS Dijkstra to a target
  job's missing skills.
- [ ] **54 Blind hiring.** Redaction projection for employer/recruiter views, unmask threshold,
  server-side log.
- [ ] **55 Vector search.** Embeddings from the configured provider, index, semantic endpoint;
  provider missing → `unavailable: <reason>`, no pseudo-embeddings.
- [ ] **56 Skill decay.** Configurable λ, default off, always displayed when on.

## Phase 7 — report, benchmarks, QA

- [ ] **57 `/api/report/data`.** Real counts and subgraphs; says "no data" instead of a mock.
- [ ] **58 `public/report.html`.** Print-to-PDF A4, figures from live endpoints, analysis
  labelled "analytical, not measured", DA-1/DA-2 reconciliations.
- [ ] **59 Benchmarks.** `benchmarks/run.js` runs Q1–Q4 N times on the real DB, writes p50/p95/
  max + DB size + Neo4j version to `benchmarks/results/*.json`.
- [ ] **60 `audit:nofake`.** `scripts/audit-nofake.js` per §15, wired to `npm run audit:nofake`.
- [ ] **61 README + lint + final checklist.** Setup, env vars, test-DB instructions, every box
  in §15 ticked or honestly not.
