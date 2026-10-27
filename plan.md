# PLAN.md — Job Portal with Skill-Based Candidate Matching (Neo4j graph edition)

Contributors: Sambhav Pundir & Gohul Sundar · Course: DBMS (DA-1 → DA-2 → DA-3)
Target: a full-stack app (`job-portal-graph`) that an agent can build end to end, run, and verify.

---

## 0. How the agent must work

1. Execute the phases in §14 in order. Do not start a phase until the previous phase's acceptance checks pass.
2. After each phase, run its checks and write one line to `docs/PROGRESS.md`: phase, what passed, what was skipped and why.
3. If a required resource is unavailable (Neo4j, GDS plugin, API key, embedding provider), build the feature so it reports `unavailable: <reason>` in the UI and API. **Never simulate it.**
4. If this plan and `DESIGN.md` conflict, `DESIGN.md` wins on visual style and this plan wins on behaviour.
5. Cypher in this file is reference quality. Run `PROFILE` on the installed Neo4j version and fix syntax or performance issues before relying on it.
6. Ask the user only when blocked by a decision listed in §16. Otherwise choose the safer default and record it in `docs/PROGRESS.md`.

## 1. Non-negotiable rules

| # | Rule | How it is enforced |
|---|------|--------------------|
| R1 | **No fake data.** No seed scripts, no demo candidates/jobs/skills, no lorem ipsum, no `Math.random()` or faker in any data path, no invented statistics or latency numbers. The dev and prod databases start empty. The sample rows in the DA-1 report (Ram Nishtha, J001…, APP001…) are **not** loaded anywhere. | `npm run audit:nofake` (see §15) fails the build on violations |
| R2 | Every node, edge, number and chart on screen traces back to a Cypher result returned in that API response. | Graph payload contract (§9.4) carries `meta.queryName`, `meta.cypher`, `meta.dbTimeMs` |
| R3 | Honest empty and error states. Empty DB → tell the user what to do next, not placeholder content. | UI state matrix (§10.7) |
| R4 | Tests may create fixtures only in a **separate, throwaway** Neo4j instance, in files under `tests/` whose header says `TEST ONLY`. Fixtures never touch the runtime DB. | Test config refuses to run against the runtime DB URI |
| R5 | Parameterised Cypher only. Labels and relationship types are static strings in `src/queries/`. | Lint rule + code review checklist |
| R6 | Secrets live in `.env` only. `.env` is git-ignored; `.env.example` has no real values. | `.gitignore`, boot-time config validation |

## 2. Product in one paragraph

A candidate enters their real profile (skills with proficiency 1–5 and years, education, location). The app writes it into Neo4j and then **shows the graph reasoning live**: the candidate node appears, skill nodes fan out, the shared `Skill` nodes light up, jobs that require those skills are scored and positioned by match percentage, and every edge is colour-coded as satisfied, below requirement or missing. Clicking any job opens an evidence panel (per-skill breakdown, skill gap, referral path, employer, the exact Cypher that produced it, and its measured execution time). The charts beside the canvas are linked to it: hovering a skill in one view highlights it in all others. The goal is that the user can see *why* a job is or is not a match and trust the number.

## 3. Source of truth (from DA-1, DA-2, DA-3)

### 3.1 Graph entity model (DA-3)

Nodes: `Candidate`, `Job`, `Employer`, `Skill`, `Recruiter`, `Company`, `Education`, `Location`.
Support nodes added by this plan: `Account` (credentials, never sent to the graph UI), `Interview` (Phase 6), `Benchmark` is **not** a node — results are files (§12).

Relationships (core, from DA-3):

```
(:Candidate)-[:HAS_SKILL {proficiency, years}]->(:Skill)
(:Job)-[:REQUIRES_SKILL {min_proficiency, mandatory}]->(:Skill)
(:Candidate)-[:APPLIED_TO {app_id, status, date}]->(:Job)
(:Candidate)-[:REFERS {status, date}]->(:Candidate)
(:Employer)-[:POSTED]->(:Job)
(:Recruiter)-[:REPRESENTS]->(:Employer)
(:Account)-[:OWNS_PROFILE]->(:Candidate)     // exactly one of these three targets
(:Account)-[:OWNS_PROFILE]->(:Employer)
(:Account)-[:OWNS_PROFILE]->(:Recruiter)
```

Every `Account` owns exactly one profile, and every profile is owned by exactly one `Account`; the registration write transaction (§9.1) enforces this.

Relationships added from the DA-1 report's junction tables (Matched_To, Assured_For, Follows, Prefers) and entity links:

```
(:Candidate)-[:MATCHED_TO {match_id, match_date, recommendation_level, match_pct}]->(:Job)
(:Candidate)-[:ASSESSED_FOR {skill_key, match_percentage, assess_date, assess_score}]->(:Job)   // one parallel edge per skill
(:Candidate)-[:FOLLOWS]->(:Employer)
(:Candidate)-[:PREFERS]->(:Location)
(:Candidate)-[:LOCATED_IN]->(:Location)
(:Job)-[:LOCATED_IN]->(:Location)
(:Candidate)-[:HAS_EDUCATION]->(:Education)
(:Employer)-[:BELONGS_TO]->(:Company)
```

### 3.2 Reconciliations (apply these, and mention them in the report)

- The DA-1 PDF spells the assessment junction `Assured_For`; the schema list and DA-3 summary say `ASSESSED_FOR`. **Use `ASSESSED_FOR`.**
- DA-2 `REQUIRES` has a column `min_year`, but the DA-2 trigger compares `HAS_SKILL.proficiency_level >= REQUIRES.min_year` — a 1–5 proficiency against a years value. **In this app, proficiency and years are separate checks**: `min_proficiency` (1–5) and `min_years` (≥ 0), both optional.
- The DA-2 trigger ignores `is_mandatory`. This app enforces mandatory skills (switchable with `ENFORCE_MANDATORY`, default `true`).
- Relational decompositions (`JOB_PRIMARY` / `JOB_SALARY_INFO` / `JOB_STATUS_INFO` / `JOB_BRIDGE`, and `CANDIDATE_LOCATION` city↔street) exist only to satisfy BCNF. In the graph, `Job` is one node and city/state/country live on `Location`. Say this in the report.
- `Dependent` is intentionally **not** modelled in the graph (family PII with no matching value). It stays in the relational design only.

### 3.3 DA-2 screening rule being ported

`TRG_SCREEN_APPLICATION`: before an application is created, compute `matched / total_requirements × 100`; if a job has no requirements the score is 100; if the score is below **40** reject with `Match score below threshold 40%.` This becomes server-side logic inside the application write transaction (§8.4).

## 4. Real-data policy and where real data comes from

The database is empty on first run. Real data enters only through these channels:

1. **Candidates** register and fill in their own profile.
2. **Employers and recruiters** register and post their own jobs, with explicit requirements (`requirement_source = "employer"`).
3. **Skill catalogue** grows from: (a) skills employers and candidates type in (normalised, see §7.2); (b) optional suggestions from the **ESCO** skills API (`https://ec.europa.eu/esco/api/search?text=<q>&type=skill&language=en`, no key required at time of writing). ESCO is weak on newer tech terms, so a user must always be able to confirm a free-text skill that ESCO doesn't know.
4. **Optional real job feeds** (disabled unless enabled in `.env`; each is an adapter in `src/ingest/`):
   - **Arbeitnow** `https://www.arbeitnow.com/api/job-board-api` — free, no key, paginated, Europe/remote-leaning; link back to the source is requested.
   - **Adzuna** — free developer key; check that the country you need is covered and obey its rate limits.
   - Public ATS board endpoints (Greenhouse, Lever, Ashby) for companies the user names.
   - Before enabling any adapter, read its current terms and rate limits, cache responses, and show attribution + `source_url` on every ingested job.

Rules for ingested jobs:

- Store `source`, `source_url`, `external_ref`, `fetched_at`. Never present them as employer-posted.
- Requirements extracted from text are matched **deterministically** against the skill catalogue (exact name or alias). Mark them `requirement_source = "extracted"`. Do not invent `min_proficiency` or `min_years` — leave them `null`, and the matcher treats `null` as "any level".
- A job with zero requirements is shown as **unscored**, never as 100 %.

If no jobs exist yet, the UI shows an honest empty state with two actions: *Post a job* (employer) and *Import real jobs* (only if an adapter is configured).

## 5. Architecture and repository layout

```
Browser (public/ — vis-network + D3, linked views via one store)
   │  JSON + SSE
Express (server.js → src/)  ── neo4j-driver (Bolt :7687) ──►  Neo4j 5.x (+ GDS optional)
   │                                                           
   ├── ESCO API (skill suggestions)           optional
   ├── Job feed adapters                       optional
   └── Embedding provider (vector search)      optional
```

```
job-portal-graph/
├─ DESIGN.md                    # created by `npx getdesign@latest add apple`
├─ plan.md  docs/PROGRESS.md
├─ package.json  .env.example  .gitignore  docker-compose.yml
├─ server.js                    # entry: config → driver → migrate → app → listen
├─ src/
│  ├─ config.js                 # zod-validated env; fail fast with readable message
│  ├─ db/ driver.js  migrate.js  tx.js
│  ├─ queries/                  # one file per named query: { name, cypher, mode:'read'|'write' }
│  ├─ routes/ auth.js candidates.js skills.js jobs.js match.js gap.js referrals.js
│  │          applications.js recruiter.js graph.js analytics.js search.js meta.js report.js
│  ├─ services/ matching.js screening.js blind.js decay.js
│  ├─ middleware/ auth.js validate.js errors.js rateLimit.js requestId.js
│  ├─ ingest/ arbeitnow.js adzuna.js ats.js esco.js
│  └─ lib/ errors.js logger.js graphPayload.js
├─ public/
│  ├─ index.html  style.css  app.js        # entry files (names kept from the original brief)
│  ├─ css/tokens.css                       # generated from DESIGN.md
│  ├─ js/ store.js api.js canvas.js reveal.js inspector.js forms.js
│  │      charts/ bars.js radar.js gap.js referral.js whatif.js
│  └─ report.html                          # print-to-PDF research report
├─ benchmarks/ run.js  results/            # real measured latency only
├─ scripts/ audit-nofake.js
└─ tests/  (TEST ONLY fixtures)  unit/  api/  e2e/
```

Stack: Node.js 20+, Express, `neo4j-driver`, `zod`, `helmet`, `express-rate-limit`, `pino` + `pino-http`, `argon2`, `jsonwebtoken`, `cookie-parser`, `compression`, `vis-network` + `vis-data`, `d3`. Dev: `vitest`, `supertest`, `playwright`, `eslint`. Frontend is plain ES modules served by Express — no build step. Serve libraries from `node_modules` under `/vendor/*`; no CDN dependency at runtime.

## 6. Phase 0 — environment and scaffolding

```bash
mkdir job-portal-graph && cd job-portal-graph
npm init -y
npm i express neo4j-driver zod helmet express-rate-limit pino pino-http argon2 jsonwebtoken cookie-parser compression dotenv vis-network vis-data d3
npm i -D vitest supertest playwright eslint

# Design system (writes ./DESIGN.md; add --force only if you intend to overwrite)
npx getdesign@latest add apple
```

**Read `DESIGN.md` fully before writing any UI.** It is an independent, community-made analysis of Apple's public design patterns (not an official Apple design system). Do not use Apple logos or trademarked assets. Extract its colour, type, spacing, radius and elevation tokens into `public/css/tokens.css`; every other stylesheet uses those variables only.

`docker-compose.yml` (verify plugin settings against the official Neo4j Docker docs for the version you pull):

```yaml
services:
  neo4j:
    image: neo4j:5
    ports: ["7474:7474", "7687:7687"]
    environment:
      NEO4J_AUTH: neo4j/${NEO4J_PASSWORD}
      NEO4J_PLUGINS: '["graph-data-science"]'     # optional; needed only for Phase 6 analytics
    volumes: ["neo4j_data:/data"]
  neo4j-test:                                      # separate instance for tests (Community allows one user DB)
    image: neo4j:5
    profiles: ["test"]
    ports: ["7688:7687"]
    environment:
      NEO4J_AUTH: neo4j/${NEO4J_TEST_PASSWORD}
volumes: { neo4j_data: {} }
```

`.env.example`:

```
PORT=3000
NODE_ENV=development
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=
NEO4J_DATABASE=neo4j
NEO4J_TEST_URI=bolt://localhost:7688
NEO4J_TEST_PASSWORD=
JWT_SECRET=                 # >= 32 random bytes
COOKIE_SECURE=false         # true behind HTTPS
SCREEN_THRESHOLD=40
BLIND_UNMASK_THRESHOLD=75
ENFORCE_MANDATORY=true
QUERY_TIMEOUT_MS=8000
ENABLE_ESCO=true
ENABLE_ARBEITNOW=false
ADZUNA_APP_ID=
ADZUNA_APP_KEY=
EMBEDDINGS_PROVIDER=        # empty = vector search disabled
EMBEDDINGS_API_KEY=
RELATIONAL_URL=             # optional; only enables a measured relational comparison in the report
```

**Phase 0 acceptance:** `docker compose up -d neo4j` is healthy; `node server.js` boots and refuses to start with a clear message when required env vars are missing; `DESIGN.md` exists; `public/css/tokens.css` exists and is derived from it.

## 7. Graph schema

### 7.1 Constraints and indexes (idempotent, run by `migrate.js` on boot, tracked as `(:Migration {id, applied_at})`)

```cypher
CREATE CONSTRAINT candidate_id  IF NOT EXISTS FOR (n:Candidate)  REQUIRE n.cand_id IS UNIQUE;
CREATE CONSTRAINT job_id        IF NOT EXISTS FOR (n:Job)        REQUIRE n.job_id IS UNIQUE;
CREATE CONSTRAINT job_ext_ref   IF NOT EXISTS FOR (n:Job)        REQUIRE n.external_ref IS UNIQUE;
CREATE CONSTRAINT employer_id   IF NOT EXISTS FOR (n:Employer)   REQUIRE n.emp_id IS UNIQUE;
CREATE CONSTRAINT recruiter_id  IF NOT EXISTS FOR (n:Recruiter)  REQUIRE n.rec_id IS UNIQUE;
CREATE CONSTRAINT company_id    IF NOT EXISTS FOR (n:Company)    REQUIRE n.comp_id IS UNIQUE;
CREATE CONSTRAINT skill_key     IF NOT EXISTS FOR (n:Skill)      REQUIRE n.skill_key IS UNIQUE;
CREATE CONSTRAINT education_id  IF NOT EXISTS FOR (n:Education)  REQUIRE n.edu_id IS UNIQUE;
CREATE CONSTRAINT location_pin  IF NOT EXISTS FOR (n:Location)   REQUIRE n.pin_code IS UNIQUE;
CREATE CONSTRAINT account_id    IF NOT EXISTS FOR (n:Account)    REQUIRE n.account_id IS UNIQUE;
CREATE CONSTRAINT account_email IF NOT EXISTS FOR (n:Account)    REQUIRE n.email IS UNIQUE;
CREATE INDEX job_status   IF NOT EXISTS FOR (n:Job) ON (n.job_status);
CREATE INDEX job_closing  IF NOT EXISTS FOR (n:Job) ON (n.closing_date);
CREATE INDEX skill_name   IF NOT EXISTS FOR (n:Skill) ON (n.name);
```

Relationship-property existence constraints are not available in every edition, so the API layer (zod) is the authority for `proficiency ∈ 1..5`, `years ≥ 0`, etc.

### 7.2 Node properties

| Node | Properties |
|------|-----------|
| `Candidate` (+ `:Freelancer` / `:Fresher` / `:Experienced`) | `cand_id` (UUID), `fname`, `lname`, `dob`, `gender`, `reg_date`, `house_no`, `street`, `email`, `phone`; Freelancer: `hourly_rate`, `portfolio_url`; Fresher: `grad_year`; Experienced: `total_exp`, `current_company` |
| `Job` | `job_id` (UUID), `job_title`, `job_status` (`Open`/`Closed`), `salary`, `posted_date`, `closing_date`, `descriptive`, `source`, `source_url`, `external_ref`, `fetched_at` |
| `Employer` | `emp_id`, `company_name`, `email`, `website`, `headquarters` |
| `Recruiter` | `rec_id`, `agency_name`, `lic_no` |
| `Company` | `comp_id`, `comp_name`, `comp_type` |
| `Skill` | `skill_key` (lower-cased, trimmed, whitespace-collapsed canonical name), `name`, `skill_category`, `description`, `aliases[]`, `esco_uri?` |
| `Education` | `edu_id`, `degree`, `cgpa`, `specialization`, `university`, `start_year`, `end_year` |
| `Location` | `pin_code`, `city`, `state`, `country` |
| `Account` | `account_id`, `email`, `password_hash`, `role` (`candidate`/`employer`/`recruiter`), `created_at` |

All temporal properties (`dob`, `reg_date`, `posted_date`, `closing_date`, `fetched_at`, `created_at`, `match_date`, `assess_date`) are stored as native Cypher `DATE` or `DATETIME`, never ISO-8601 strings. The API converts at the boundary so Cypher compares native values.

IDs are server-generated UUIDs. Proficiency scale: 1 Beginner · 2 Basic · 3 Intermediate · 4 Advanced · 5 Expert. Extra `HAS_SKILL` properties: `last_used_year` (optional, used by skill decay), `source` (`self`).

## 8. Matching engine

### 8.1 Definitions (single source of truth: `src/services/matching.js` mirrors the Cypher and is used by tests)

- A requirement `r` on skill `s` is **satisfied** by candidate skill `h` iff
  `h exists AND h.proficiency ≥ coalesce(r.min_proficiency, 1) AND coalesce(h.years, 0) ≥ coalesce(r.min_years, 0)`.
- `match_pct = round(100 × satisfied_count / total_requirements, 1)`; `null` and "unscored" when `total_requirements = 0`.
- `mandatory_ok = every requirement with mandatory = true is satisfied`.
- Bands: **Strong** ≥ 75 · **Moderate** 40–74.9 · **Low** < 40 (thresholds from env).
- Per-requirement status for the UI: `satisfied` · `below` (skill present, proficiency or years too low) · `missing`.

### 8.2 The four core queries (DA-3)

**Q1 — real-time skill match score (candidate × job)**

```cypher
MATCH (c:Candidate {cand_id: $candId})          // required: missing candidate -> no rows -> 404
MATCH (j:Job {job_id: $jobId})-[r:REQUIRES_SKILL]->(s:Skill)
OPTIONAL MATCH (c)-[h:HAS_SKILL]->(s)
WITH j, r, s, h,
     (h IS NOT NULL
      AND h.proficiency >= coalesce(r.min_proficiency, 1)
      AND coalesce(h.years, 0) >= coalesce(r.min_years, 0)) AS satisfied
WITH j, collect({
       skill_key: s.skill_key, skill: s.name,
       mandatory: coalesce(r.mandatory, false),
       required_proficiency: r.min_proficiency, required_years: r.min_years,
       candidate_proficiency: h.proficiency, candidate_years: h.years,
       satisfied: satisfied,
       status: CASE WHEN satisfied THEN 'satisfied' WHEN h IS NULL THEN 'missing' ELSE 'below' END
     }) AS rows
WITH j, rows, size(rows) AS total, size([x IN rows WHERE x.satisfied]) AS matched
RETURN j.job_id AS job_id, j.job_title AS job_title, total, matched,
       CASE WHEN total = 0 THEN null ELSE round(100.0 * matched / total, 1) END AS match_pct,
       all(x IN rows WHERE NOT x.mandatory OR x.satisfied) AS mandatory_ok,
       rows AS breakdown;
```

A missing candidate or job returns zero rows, which the API maps to `404 NOT_FOUND`. A candidate with no matching skill still returns rows with `status: 'missing'`.

**Q2 — skill gap (exclusion)**

```cypher
MATCH (j:Job {job_id: $jobId})-[r:REQUIRES_SKILL]->(s:Skill)
WHERE NOT EXISTS {
  MATCH (:Candidate {cand_id: $candId})-[h:HAS_SKILL]->(s)
  WHERE h.proficiency >= coalesce(r.min_proficiency, 1) AND coalesce(h.years, 0) >= coalesce(r.min_years, 0)
}
OPTIONAL MATCH (:Candidate {cand_id: $candId})-[h2:HAS_SKILL]->(s)
RETURN s.skill_key AS skill_key, s.name AS skill, coalesce(r.mandatory, false) AS mandatory,
       r.min_proficiency AS required_proficiency, r.min_years AS required_years,
       h2.proficiency AS current_proficiency, h2.years AS current_years,
       CASE WHEN h2 IS NULL THEN 'missing' ELSE 'below' END AS gap_type
ORDER BY mandatory DESC, skill;
```

**Q3 — multi-hop referral network**

```cypher
MATCH path = (c1:Candidate {cand_id: $candId})-[:REFERS*1..3]->(c2:Candidate)
RETURN [n IN nodes(path) | n.fname + ' ' + n.lname] AS referral_chain,
       [n IN nodes(path) | n.cand_id] AS ids, length(path) AS hops
ORDER BY hops, referral_chain;
```
In blind mode the names are replaced by anonymous refs (§11.4).

**Q4 — recruiter recommendations (candidates who have not applied)**

```cypher
MATCH (e:Employer {emp_id: $empId})-[:POSTED]->(j:Job {job_status: 'Open'})-[r:REQUIRES_SKILL]->(:Skill)
WHERE j.closing_date IS NULL OR date(j.closing_date) >= date()
WITH j, count(r) AS total, sum(CASE WHEN coalesce(r.mandatory,false) THEN 1 ELSE 0 END) AS mand_total
MATCH (j)-[r2:REQUIRES_SKILL]->(s:Skill)<-[h:HAS_SKILL]-(c:Candidate)
WHERE h.proficiency >= coalesce(r2.min_proficiency, 1)
  AND coalesce(h.years, 0) >= coalesce(r2.min_years, 0)
  AND NOT (c)-[:APPLIED_TO]->(j)
WITH j, c, total, mand_total, count(r2) AS matched,
     sum(CASE WHEN coalesce(r2.mandatory,false) THEN 1 ELSE 0 END) AS mand_matched,
     collect(s.name) AS matched_skills
WITH j, c, total, matched, matched_skills, mand_matched = mand_total AS mandatory_ok,
     round(100.0 * matched / total, 1) AS match_pct
WHERE match_pct >= $threshold
RETURN j.job_id AS job_id, j.job_title AS job_title, c.cand_id AS cand_id, match_pct, mandatory_ok, matched_skills
ORDER BY job_id, match_pct DESC
LIMIT $limit;
```

### 8.3 Candidate-centric ranking (the main user flow)

Same pattern as Q4 anchored on `$candId`: iterate open, non-expired jobs with requirements, count satisfied requirements through `(:Candidate)-[:HAS_SKILL]->(:Skill)<-[:REQUIRES_SKILL]-(:Job)`, return `job_id, job_title, employer, total, matched, match_pct, mandatory_ok, matched_skills`, ordered by `mandatory_ok DESC, match_pct DESC`, with `$limit` and `$skip`. Jobs with zero satisfied requirements are not listed. Jobs with zero requirements are listed separately as *unscored*.

### 8.4 Screening on apply (port of `TRG_SCREEN_APPLICATION`)

`POST /api/applications` runs in one managed write transaction:

1. Compute Q1 inside the transaction.
2. `total = 0` → allow, response has `scored: false`.
3. `match_pct < SCREEN_THRESHOLD` → abort with `422 MATCH_BELOW_THRESHOLD` and message `Match score below threshold 40%.` (threshold from env), including the breakdown so the UI can show what to improve.
4. `ENFORCE_MANDATORY && !mandatory_ok` → `422 MANDATORY_SKILLS_MISSING`.
5. Otherwise `MERGE` the `APPLIED_TO` edge (one per candidate/job; duplicates → `409 ALREADY_APPLIED`), write `MATCHED_TO` (with `recommendation_level`) and one `ASSESSED_FOR` edge per requirement as an auditable snapshot.

### 8.5 What-If simulator (read-only)

`POST /api/match/what-if` takes `{ candId, hypothetical: [{skill_key, proficiency, years}] }`. Build the effective skill map as `max(stored, hypothetical)` per skill, run the same scoring, and return the delta versus the stored profile: jobs newly above a band, newly mandatory-ok, and rank changes. It runs in `executeRead`; **nothing is written**. The UI labels every number from this endpoint "hypothetical".

## 9. Backend specification

### 9.1 Robustness requirements

- **Config:** validate env with zod at boot; exit with a readable message on error.
- **Driver:** single `neo4j.driver` instance, bounded pool, `verifyConnectivity()` at boot. Use `session.executeRead` / `executeWrite` (managed transactions, automatic retry on transient errors) with `timeout: QUERY_TIMEOUT_MS`. Close sessions in `finally`.
- **Validation:** zod schema for every body, query and param; `.strict()` objects; max lengths; `proficiency` int 1–5; `years` 0–60; pagination `limit ≤ 100`; JSON body limit 100 kB.
- **Existence:** profile-scoped handlers (`/api/match/*`, `/api/gap/*`, `/api/match/what-if`) validate that `$candId` exists before running the query and return `404 NOT_FOUND` otherwise.
- **AuthN/AuthZ:** argon2id hashes; JWT in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production); roles `candidate | employer | recruiter`. Candidates read/write only their own data; employers only their own jobs and applicants; recruiters only employers they `REPRESENT`. Credentials live on `Account` nodes that are excluded from every graph payload; the `OWNS_PROFILE` edge from `Account` is the ownership check for every profile read and write.
- **Hardening:** `helmet` (CSP: self only; allow canvas and inline SVG), tight CORS, `express-rate-limit` (global plus stricter on `/api/auth/*`), `compression`, request ID on every request and in every error body.
- **Errors:** one error contract `{ "error": { "code", "message", "details?", "requestId" } }` for everything under `/api`.

| Condition | Status | Code |
|-----------|--------|------|
| Zod failure | 400 | `VALIDATION_FAILED` (field paths in `details`) |
| Not logged in / bad token | 401 | `UNAUTHENTICATED` |
| Wrong role / not owner | 403 | `FORBIDDEN` |
| Unknown id or route | 404 | `NOT_FOUND` |
| Neo4j constraint violation / duplicate | 409 | `CONFLICT` / `ALREADY_APPLIED` |
| Screening rejection | 422 | `MATCH_BELOW_THRESHOLD` / `MANDATORY_SKILLS_MISSING` |
| Rate limit | 429 | `RATE_LIMITED` (+ `Retry-After`) |
| Neo4j unavailable / transient after retries | 503 | `DB_UNAVAILABLE` (+ `Retry-After`) |
| Query timeout | 504 | `QUERY_TIMEOUT` |
| Anything else | 500 | `INTERNAL` (details only in logs) |

- **Every route** is wrapped by an async handler; add a final JSON 404 for `/api/*` and a central error middleware. Handle `unhandledRejection` / `uncaughtException` by logging and exiting so the supervisor restarts the process.
- **Client disconnects:** abort the Neo4j transaction on `req.on('close')` for long reads and SSE.
- **Atomic writes:** registering a profile (candidate + skills + education + location links) is one write transaction. A failure leaves nothing behind.
- **Health:** `GET /healthz` (process alive) and `GET /readyz` (`RETURN 1` through the driver).
- **Graceful shutdown:** on `SIGTERM`/`SIGINT` stop accepting connections, finish in-flight requests, `driver.close()`.
- **Logging:** pino JSON, request ID, route, status, duration. Never log passwords, tokens or full PII.
- **Privacy:** `DELETE /api/candidates/me` does `DETACH DELETE` of the candidate, their education and their `Account`.

### 9.2 Endpoints

| Area | Endpoints |
|------|-----------|
| Auth | `POST /api/auth/register` · `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me` |
| Candidate | `GET/PUT /api/candidates/me` · `PUT /api/candidates/me/skills` · `POST/DELETE /api/candidates/me/education` · `DELETE /api/candidates/me` |
| Skills | `GET /api/skills?q=` (local catalogue first, then ESCO suggestions marked `source:"esco"`) · `POST /api/skills` (user-confirmed skill, normalised to `skill_key`) |
| Jobs | `POST /api/jobs` (employer) · `GET /api/jobs` (filters, pagination) · `GET /api/jobs/:id` · `PATCH /api/jobs/:id` (edit/close) |
| Match | `GET /api/match/candidate/:candId/jobs` (ranked) · `GET /api/match/stream?candId=` (SSE) · `GET /api/match/:candId/:jobId` (Q1) · `GET /api/match/:candId/:jobId/subgraph` · `POST /api/match/what-if` |
| Gap | `GET /api/gap/:candId/:jobId` (Q2) |
| Referrals | `POST /api/referrals` · `GET /api/referrals/:candId/chain?maxHops=3` (Q3) |
| Applications | `POST /api/applications` (§8.4) · `GET /api/applications/me` · `PATCH /api/applications/:id` (employer: status/final_result) |
| Recruiter | `GET /api/recruiter/:empId/recommendations` (Q4) |
| Graph | `GET /api/graph` (limited, redacted) · `GET /api/graph/neighbors/:id` |
| Meta | `GET /api/meta/stats` (real counts only) · `GET /api/meta/capabilities` (what is enabled: ESCO, feeds, GDS, vector) |
| Admin/ops | `POST /api/ingest/:adapter/run` (admin) · `GET /api/report/data` |
| Phase 6 (flag-gated) | `/api/analytics/pagerank` · `/api/analytics/communities` · `/api/career-path` · `/api/search/semantic` |

### 9.3 SSE contract for the match reveal

`GET /api/match/stream?candId=…` emits events as the server **actually** produces rows (flush per record; heartbeat comment every 15 s; max 2 concurrent streams per user):

```
event: candidate    data: { node }
event: skill        data: { node: Skill, edge: HAS_SKILL }
event: job_scored   data: { node: Job, employer, edges: REQUIRES_SKILL[], breakdown[], match_pct, mandatory_ok, band }
event: done         data: { totals: { jobs, strong, moderate, low, unscored }, meta }
event: error        data: { error }
```

### 9.4 Graph payload contract (used by every graph and chart endpoint)

```json
{
  "nodes": [{ "id": "…", "type": "Candidate|Job|Skill|…", "label": "…", "props": { } }],
  "edges": [{ "id": "…", "from": "…", "to": "…", "type": "HAS_SKILL|REQUIRES_SKILL|…", "props": { }, "state": "satisfied|below|missing|neutral" }],
  "meta": { "queryName": "…", "cypher": "…", "params": { }, "dbTimeMs": 0, "rowCount": 0, "generatedAt": "ISO-8601" }
}
```

`dbTimeMs` comes from the driver's result summary (`resultAvailableAfter` + `resultConsumedAfter`), not a client stopwatch. `params` has PII removed. Redaction rules run in `lib/graphPayload.js` so no route can forget them.

## 10. Frontend specification

### 10.1 Design

- Run the design setup in §6; build on `DESIGN.md` tokens. Visual language: glassmorphism panels (backdrop blur over the canvas), generous spacing, large clear type, subtle elevation. Light and dark via `prefers-color-scheme`. Respect `prefers-reduced-motion` (replace the reveal with an instant, still-ordered render and keep all information).
- Quality floor: responsive down to 360 px, visible keyboard focus, WCAG AA contrast, every canvas insight also available as a table (`Show as table` toggle), `aria-live` announcements for reveal progress.
- Do not use Apple logos, SF Pro files or other trademarked assets; use the system font stack that `DESIGN.md` specifies.

### 10.2 Layout

```
┌───────────────┬───────────────────────────────────────┬──────────────────┐
│ Profile sheet │            MATCH CANVAS               │ Inspector        │
│ (wizard)      │   vis-network, 2D (3D toggle later)   │ (slide-out:      │
│               │                                       │ node/edge props, │
├───────────────┴───────────────┬───────────────────────┤ breakdown,       │
│ Ranked bars  ·  Skill radar   │  Gap list · Referral  │ Cypher + timing) │
└───────────────────────────────┴───────────────────────┴──────────────────┘
```
Tabs: **My match** · **Gap** · **Network** (referrals) · **What-if** · **Recruiter** (employer/recruiter roles) · **Explore** (Phase 6) · **Report**.

### 10.3 Profile wizard (real input only)

Steps: account → basics (name, DOB, gender, address fields, kind: freelancer/fresher/experienced with its extra fields) → skills → education → location + preferences → review & submit. Skill input is a typeahead against `/api/skills?q=`; each skill row has a 1–5 proficiency control with labels, years, and optional last-used year. A skill that nothing suggests can be added after a confirm step. Server validation errors map back onto the exact field. No default values that look like data.

### 10.4 The match reveal (signature interaction)

Timing is presentational; **content is real**: only nodes and edges present in streamed query results may be drawn.

1. **Seed** — the candidate node appears at the centre with a single ring pulse.
2. **Skills fan out** — each `skill` event moves a Skill node out along its `HAS_SKILL` edge. Edge width = proficiency; label `4/5 · 3 y`.
3. **Demand wave** — each `job_scored` event adds a Job node connected through the **shared Skill nodes** (candidate → skill ← job is literally the graph). Jobs settle on concentric rings by band; node size ∝ `match_pct`.
4. **Edge states** — green solid = satisfied · amber = present but below the required proficiency/years · red dashed = missing · grey = not required. A job missing a mandatory skill gets a dashed ring.
5. **Focus** — clicking a job dims everything unrelated to ~15 %, frames the sub-graph, and opens the Inspector with *Why X %*: per-skill table, mandatory flags, gap list, employer and company, and any referral path from the user to a candidate who applied there (`(me)-[:REFERS*1..3]-(x)-[:APPLIED_TO]->(job)`).
6. **Verdict strip** — computed text such as "You satisfy 6 of 8 requirements; 2 gaps (1 mandatory)". No generated prose beyond templates filled from results.
7. **Query transparency** — a drawer shows the query name, Cypher, parameters, rows and measured DB time for the current selection.

### 10.5 Linked views (brushing and linking)

All views subscribe to one store (`public/js/store.js`: `selection`, `hover`, `filters`, `hypothetical`, `mode`). Required links:

- Hover a skill in the radar → its node and edges glow in the canvas, its row highlights in the gap list.
- Hover/select a bar → that job node is focused on the canvas and the Inspector updates.
- Select a node on the canvas → bars, radar axes and gap list filter to it.
- Toggle a hypothetical skill (What-if) → the canvas re-scores (marked "hypothetical"), bars animate to new values, and newly unlocked jobs are outlined.

Charts are D3 SVG: ranked bars (match %), radar (candidate level vs required level per skill), gap list, referral chain. The canvas uses vis-network physics (stabilise, then freeze; cap at ~300 rendered nodes with "show more").

### 10.6 Recruiter view

For employer/recruiter roles: pick one of their jobs → Q4 results as a candidate-by-job matrix and a canvas with the job in the centre and candidates on rings by `match_pct`. Candidate identities follow blind-hiring rules (§11.4).

### 10.7 UI states (R3)

| State | Behaviour |
|-------|-----------|
| No jobs in DB | Explain, with *Post a job* and (if configured) *Import real jobs* |
| Profile has no skills | Prompt to add skills; canvas shows only the candidate node |
| No job meets any requirement | Show the closest jobs by match % and the most common missing skills, with the real numbers |
| API error | Message, `requestId`, *Retry*; no stale data shown as fresh |
| 429 / 503 / 504 | Specific copy using `Retry-After` when present |
| SSE drop | Auto-reconnect once, then fall back to the non-streaming ranked endpoint |

## 11. Advanced features (Phase 6, each behind a flag and a `capabilities` check)

1. **Hybrid GraphRAG and vector search** — Neo4j vector indexes on `Job` and candidate résumé text; retrieval = vector hit (`db.index.vector.queryNodes`) followed by a Cypher expansion over skills/employer (the pattern behind a hybrid Cypher retriever). Requires `EMBEDDINGS_PROVIDER` + key; without them the feature shows "unavailable". Never use hash-based or random pseudo-embeddings.
2. **Skill decay and career-path engine** — optional decay `effective_proficiency = proficiency × exp(−λ × years_since_last_used)` (λ configurable, default off, always displayed). Career roadmap: project a `Skill–Skill` co-requirement graph built from real job requirements (weight = inverse co-occurrence) and run GDS Dijkstra from the candidate's skills to a target job's missing skills; show ordered steps with the real weights.
3. **PageRank referral weighting** — GDS PageRank over `(:Candidate)-[:REFERS]->(:Candidate)`. Show `referrer_authority` as a **separate** field; never silently change `match_pct`. A UI toggle shows the combined view and the formula.
4. **Blind hiring** — a Cypher projection / redaction layer returns anonymised candidates (`Candidate #A1B2`, no name, DOB, gender, contact, address) to employer/recruiter views until `match_pct > BLIND_UNMASK_THRESHOLD` (75). Unmasking is logged server-side.
5. **Louvain communities** — run Louvain on a candidate–skill similarity projection; **cluster labels come from each cluster's top skills in the data**, not from hand-written names.
6. **What-if simulator** — §8.5 (ships in Phase 4, not Phase 6, because it only needs Phase 2).

Check GDS availability at boot via `CALL gds.version()`; set `capabilities.gds` accordingly.

## 12. Research report (`public/report.html`) and benchmarks

Print-to-PDF page (A4, print CSS) with inline SVG, built from live endpoints so nothing is hand-typed:

1. **System topology** diagram.
2. **Query subgraphs** — rendered from the current DB through `/api/report/data`; if there is no data yet, the figure says so instead of showing a mock.
3. **Latency bar chart (log scale)** — only from `benchmarks/results/*.json` produced by `npm run bench`. The runner executes Q1–Q4 N times on the real database, records p50/p95/max, DB size (node/edge counts) and the Neo4j version. A relational comparison appears **only** if `RELATIONAL_URL` is configured and the same queries were actually run there. Otherwise the chart shows graph timings only and says so.
4. **Complexity slopegraph** — analytical comparison (index-free adjacency vs relational joins). Label it "analytical, not measured".
5. Normalisation summary from DA-1 (18 entities → 26 BCNF relations), the DA-2 trigger, and the reconciliations in §3.2. No sample rows.

Technical justification to state in the report: index-free adjacency (constant-time hop per step), M:N bridge tables (`HAS_SKILL`, `REQUIRES`, `APPLIES`) become edges with properties, and `-[:REFERS*1..3]->` replaces a recursive CTE.

## 13. Test plan

- **Unit:** `services/matching.js` reference implementation; zod schemas; error mapping.
- **Cypher-vs-reference:** in the throwaway test DB, create profiles and jobs with a fixture builder (TEST ONLY), then assert that Q1–Q4 equal the JS reference implementation for every pair. Include boundary cases: proficiency equal to the minimum, `null` minimums, zero requirements, all mandatory missing, 39.9 % vs 40 %.
- **API (supertest):** every endpoint for success, validation failure, 401, 403, 404, 409, 422. Fuzz bodies with wrong types and oversized strings — nothing may return 500.
- **Concurrency:** 20 parallel `POST /api/applications` for the same pair → exactly one succeeds, the rest `409`.
- **Resilience:** stop the Neo4j container mid-request → `503` with `Retry-After`; restart → service recovers without a process restart. Slow query → `504`.
- **E2E (Playwright, test stack):** register, enter skills, watch the reveal complete, click a job, verify the inspector numbers equal the API, verify linked-view highlighting, verify `prefers-reduced-motion` path, verify keyboard-only flow.
- **Safety:** attempt Cypher injection through skill names and search text; verify parameterisation.

## 14. Phases and acceptance criteria

| Phase | Work | Acceptance |
|-------|------|------------|
| **0** | Scaffolding, Docker, env, `DESIGN.md`, tokens (§6) | Boots; fails fast on bad env; `DESIGN.md` present |
| **1** | Migrations, auth, candidate profile, skills catalogue (+ESCO), jobs CRUD, error contract, health | CRUD works against an empty DB; all error codes in §9.1 reachable; tests green |
| **2** | Matching engine, Q1–Q4, candidate ranking, screening on apply, referrals, recruiter recommendations, what-if | Cypher equals JS reference on all fixtures; screening rejects at 39.9 % and accepts at 40 %; no writes in what-if |
| **3** | Frontend foundation: tokens, wizard, API client, store, canvas, inspector | Real registration end to end; inspector shows real properties; empty states correct |
| **4** | SSE match reveal, linked views, query transparency, What-if tab, gap and referral views, recruiter view | Every drawn element exists in an API response; hover/select links work both ways; reduced-motion and table views work |
| **5** | Optional real-data adapters (Arbeitnow/Adzuna/ATS) with attribution; ingest runner; dedupe by `external_ref` | Re-running an ingest creates no duplicates; ingested jobs show source + link; unscored jobs handled |
| **6** | Advanced features (§11) behind flags | Each feature works when its dependency exists and shows `unavailable: <reason>` when not |
| **7** | Report page, benchmark runner, hardening, full QA (§15) | `npm run audit:nofake`, tests, lint all pass; report shows only measured or analytical-labelled content |

## 15. Final checklist (definition of done)

- [x] Fresh clone → `docker compose up -d neo4j` → `npm i` → `npm start` works with an empty database and a sensible first-run screen.
- [x] `npm run audit:nofake` passes: it scans non-test code for `faker`, `Math.random` (allow-list the animation file only), `lorem`, `John Doe`, hard-coded arrays of people/jobs/skills, and any `seed`/`demo` script. It also fails if `tests/` fixtures are imported from runtime code.
- [x] Every number in the UI can be traced through the Inspector → Query drawer to a real result.
- [x] Killing and restarting Neo4j while the app is running does not crash the server.
- [x] No PII in logs; `Account` data never appears in any graph payload; blind-hiring masking verified.
- [x] Mandatory-skill handling and the 40 % screening rule are documented in the report as intentional, with the DA-2 differences from §3.2.
- [x] `.env` is not committed; `README.md` explains setup, env vars, and how to run tests against the test Neo4j.

## 16. Decisions that may need the user

1. Neo4j hosting: local Docker (default) or Aura. GDS-dependent features need a plugin or tier that includes it.
2. Whether to enable real job feeds, and which (Arbeitnow needs no key; Adzuna needs a key).
3. Embedding provider and key for vector search (feature stays off without it).
4. Whether a relational instance (Oracle/Postgres) is available for a *measured* comparison in the report. If not, the report is graph-only plus the labelled analytical slopegraph.
5. Deployment target (local demo vs hosted). Hosted needs `COOKIE_SECURE=true`, HTTPS and a reverse proxy.

## Appendix A — Viva talking points this build supports

- Why a graph: M:N bridge tables become properties on edges; traversals follow stored pointers; referral depth is one pattern instead of a recursive CTE.
- Normalisation story: 18 entities → 26 BCNF relations in DA-1; in the graph the same facts are modelled without the BCNF-driven splits (§3.2).
- DA-2 trigger vs DA-3 service rule: same 40 % policy, corrected proficiency/years comparison, mandatory skills enforced.
- Honest data policy: nothing is seeded; every figure is measured or labelled analytical.
