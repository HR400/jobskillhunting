# Graph Report - jobskillhunting  (2026-10-27)

## Corpus Check
- 166 files · ~82,547 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: .example 1, (none) 1, .css 1)

## Summary
- 841 nodes · 2144 edges · 43 communities (41 shown, 2 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 119 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6c701937`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- package.json
- DESIGN.md
- check-phase4-e2e.mjs
- PLAN.md — Job Portal with Skill-Based Candidate Matching (Neo4j graph edition)
- check-phase3-smoke.mjs
- healthcheck
- src/app.js
- db.js
- js/app.js
- authPrimitives.test.js
- ats.js
- AGENTS.md
- forms.js
- Progress
- routes/candidates.js
- TICKETS.md — job-portal-graph
- match.js
- routes/applications.js
- routes/report.js
- routes/candidates.js
- matching.js
- routes/jobs.js
- src/app.js
- setState
- api.js
- cypherVsReference.test.js
- routes/auth.js
- blind.js
- initRadar
- services/whatIf.js
- routes/recruiter.js
- audit-nofake.js
- initBars
- inspector.js
- initRecruiter
- Job Portal Graph
- executeWrite
- devDependencies
- candidate
- canvas.js
- pickCareerSteps

## God Nodes (most connected - your core abstractions)
1. `Progress` - 62 edges
2. `vitest` - 59 edges
3. `getTestDriver()` - 41 edges
4. `executeRead()` - 38 edges
5. `getTestApp()` - 38 edges
6. `closeTestDriver()` - 37 edges
7. `config` - 33 edges
8. `wipeTestDb()` - 33 edges
9. `signToken()` - 30 edges
10. `createTestCandidate()` - 30 edges

## Surprising Connections (you probably didn't know these)
- `8.5 What-If simulator (read-only)` --references--> `executeRead()`  [INFERRED]
  plan.md → job-portal-graph/src/db/tx.js
- `Phase 2 — matching engine` --references--> `executeRead()`  [INFERRED]
  TICKETS.md → job-portal-graph/src/db/tx.js
- `10.7 UI states (R3)` --references--> `requestId()`  [INFERRED]
  plan.md → job-portal-graph/src/middleware/requestId.js
- `Phase 1 — data layer, auth, CRUD` --references--> `authenticate()`  [INFERRED]
  TICKETS.md → job-portal-graph/src/middleware/auth.js
- `Phase 1 — data layer, auth, CRUD` --references--> `requireRole()`  [INFERRED]
  TICKETS.md → job-portal-graph/src/middleware/auth.js

## Import Cycles
- None detected.

## Communities (43 total, 2 thin omitted)

### Community 0 - "package.json"
Cohesion: 0.06
Nodes (45): dependencies, argon2@^0.45.1, compression@^1.8.2, cookie-parser@^1.4.7, d3@^7.9.0, dotenv@^18.0.9, express@^5.3.0, express-rate-limit@^8.7.1 (+37 more)

### Community 1 - "DESIGN.md"
Cohesion: 0.05
Nodes (37): Border Radius Scale, Brand & Accent, Brand Gradient, Breakpoints, Buttons, Cards & Containers, Collapsing Strategy, Colors (+29 more)

### Community 2 - "check-phase4-e2e.mjs"
Cohesion: 0.10
Nodes (15): apiRow, call(), consoleErrors, expectedBars, expectFiltered, failures, gapOrder, jobARows (+7 more)

### Community 3 - "PLAN.md — Job Portal with Skill-Based Candidate Matching (Neo4j graph edition)"
Cohesion: 0.05
Nodes (39): 0. How the agent must work, 10.1 Design, 10.2 Layout, 10.3 Profile wizard (real input only), 10.4 The match reveal (signature interaction), 10.5 Linked views (brushing and linking), 10.6 Recruiter view, 10.7 UI states (R3) (+31 more)

### Community 4 - "check-phase3-smoke.mjs"
Cohesion: 0.12
Nodes (12): currentCoEl, degreeInput, dobEl, email, failures, nextBtn, nextBtn2, nextBtn3 (+4 more)

### Community 5 - "healthcheck"
Cohesion: 0.08
Nodes (30): NEO4J_AUTH, NEO4J_PLUGINS, NEO4J_server_memory_heap_initial__size, NEO4J_server_memory_heap_max__size, interval, retries, start_period, test (+22 more)

### Community 6 - "src/app.js"
Cohesion: 0.05
Nodes (70): runBenchmarks(), calculatePercentile(), calculateStats(), 2026-10-27: Ticket 05 — Driver + Transactions (Phase 1), 2026-10-27: Ticket 06 — Migrations (Phase 1), 2026-10-27: Ticket 07 — Error Contract (Phase 1), 2026-10-27: Ticket 10 — auth primitives (Phase 1), 2026-10-27: Ticket 47 — ingest core (Phase 5) (+62 more)

### Community 7 - "db.js"
Cohesion: 0.14
Nodes (25): 2026-10-27: Ticket 13 — test harness (Phase 1), createApp(), setDriver(), cookieOptions, hashPassword(), signToken(), TOKEN_TTL, getTestApp() (+17 more)

### Community 8 - "js/app.js"
Cohesion: 0.07
Nodes (24): 2026-10-27: Ticket 40 — reveal (Phase 4), activate(), barsSlot, canvasSlot, emptyStateSlot, gapSlot, inspectorSlot, lastRanking (+16 more)

### Community 9 - "authPrimitives.test.js"
Cohesion: 0.42
Nodes (7): COOKIE_NAME, setAuthCookie(), verifyToken(), authenticate(), requireRole(), buildApp(), candidateToken()

### Community 10 - "ats.js"
Cohesion: 0.18
Nodes (14): adzunaAdapter, mapAdzuna(), arbeitnowAdapter, mapArbeitnow(), atsAdapter, mapAshby(), mapGreenhouse(), mapLever() (+6 more)

### Community 11 - "AGENTS.md"
Cohesion: 0.33
Nodes (4): Contents, graphify, Planning before building, Plugin constraints (`.opencode/plugins/graphify.js`)

### Community 13 - "forms.js"
Cohesion: 0.26
Nodes (20): clearErrors(), collected, el(), field(), initWizard(), PROFICIENCY_LABELS, render(), renderStep1() (+12 more)

### Community 14 - "Progress"
Cohesion: 0.05
Nodes (39): 2026-10-27: Ticket 01 — workspace scaffold (Phase 0), 2026-10-27: Ticket 02 — Neo4j running (Phase 0), 2026-10-27: Ticket 03 — fail-fast config + boot (Phase 0), 2026-10-27: Ticket 04 — DESIGN.md + tokens (Phase 0), 2026-10-27: Ticket 09 — health + shutdown (Phase 1), 2026-10-27: Ticket 11 — register (Phase 1), 2026-10-27: Ticket 12 — login / logout / me (Phase 1), 2026-10-27: Ticket 16 — skill catalogue (Phase 1) (+31 more)

### Community 15 - "routes/candidates.js"
Cohesion: 0.15
Nodes (17): 2026-10-27: Ticket 14 — candidate profile (Phase 1), 2026-10-27: Ticket 15 — candidate skills + education (Phase 1), DELETE_CANDIDATE_PROFILE, formatCandidateNode(), GET_CANDIDATE_PROFILE, UPDATE_CANDIDATE_PROFILE, CREATE_CANDIDATE_EDUCATION, DELETE_CANDIDATE_EDUCATION (+9 more)

### Community 16 - "TICKETS.md — job-portal-graph"
Cohesion: 0.20
Nodes (9): Phase 0 — scaffolding, Phase 2 — matching engine, Phase 3 — frontend foundation, Phase 4 — reveal and linked views, Phase 5 — real data ingestion, Phase 6 — advanced features (each flag-gated with an honest unavailable state), Phase 7 — report, benchmarks, QA, Rules for every ticket (+1 more)

### Community 17 - "match.js"
Cohesion: 0.13
Nodes (14): RANKED_JOBS, UNSCORED_JOBS, effectiveProficiency(), STREAM_CANDIDATE, STREAM_SCORED_JOBS, STREAM_SKILLS, Q4_RECOMMENDATIONS, WHAT_IF_RANKING (+6 more)

### Community 18 - "routes/applications.js"
Cohesion: 0.18
Nodes (13): CREATE_APPLICATION, FIND_APPLICATION, GET_APPLICATION, LOCK_JOB, MY_APPLICATIONS, UPDATE_APPLICATION, ACCOUNT_BY_ID, LOGIN (+5 more)

### Community 19 - "routes/report.js"
Cohesion: 0.31
Nodes (8): Q1_SUBGRAPH, FIND_SAMPLE_CANDIDATE_JOB, GET_DB_COUNTS, GET_DBMS_INFO, GET_LABEL_COUNTS, GET_REL_TYPE_COUNTS, REDACTED, reportRouter

### Community 20 - "routes/candidates.js"
Cohesion: 0.20
Nodes (11): 2026-10-27: Ticket 17 — ESCO suggestions (Phase 1), cache, escoAvailable(), searchEsco(), skillKey(), SEARCH_SKILLS, UPSERT_SKILL, createJobSchema (+3 more)

### Community 21 - "matching.js"
Cohesion: 0.23
Nodes (13): 2026-10-27: Ticket 21 — reference matcher (Phase 2), 2026-10-27: Ticket 30 — Cypher-vs-reference suite (Phase 2), 2026-10-27: Ticket 56 — skill decay (Phase 6), formatMatch(), effectiveProficiency(), yearsSinceLastUsed(), bandFor(), BELOW (+5 more)

### Community 22 - "routes/jobs.js"
Cohesion: 0.26
Nodes (10): CREATE_JOB, formatJobNode(), formatRequirement(), GET_JOB_BY_ID, LIST_JOBS, UPDATE_JOB, jobsRouter, listJobsQuerySchema (+2 more)

### Community 23 - "src/app.js"
Cohesion: 0.20
Nodes (15): 2026-10-27: Ticket 08 — Hardening (Phase 1), devDependencies, supertest@^7.3.1, vitest@^5.0.5, errorHandler(), notFoundHandler(), requestId(), validateBody() (+7 more)

### Community 24 - "setState"
Cohesion: 0.21
Nodes (19): 2026-10-27: Ticket 31 — API client + store (Phase 3), BAND_COLOR, el(), initGapList(), renderTable(), getState(), listeners, resetHypothetical() (+11 more)

### Community 25 - "api.js"
Cohesion: 0.18
Nodes (8): api, ApiError, request(), el(), initReferralChain(), BAND_COLOR, RING_RADIUS, out

### Community 26 - "cypherVsReference.test.js"
Cohesion: 0.21
Nodes (9): Q1_MATCH, cands, HOLDS, JOBS, q1For(), q1FromCypher(), reqsByJob, run() (+1 more)

### Community 27 - "routes/auth.js"
Cohesion: 0.15
Nodes (10): clearAuthCookie(), verifyPassword(), REGISTER_QUERIES, authRouter, candidateFields, candidateProfile, email, loginSchema (+2 more)

### Community 28 - "blind.js"
Cohesion: 0.48
Nodes (5): BLIND_FIELDS, blindCandidate(), blindRef(), fieldValue(), candidate

### Community 30 - "initRadar"
Cohesion: 0.25
Nodes (9): escHtml(), initRadar(), drawSvg(), angle(), point(), polygon(), drawTable(), render() (+1 more)

### Community 31 - "services/whatIf.js"
Cohesion: 0.46
Nodes (5): 2026-10-27: Ticket 29 — what-if simulator (Phase 2), BAND_ORDER, buildHypotheticalMap(), describeWhatIf(), whatIfRow()

### Community 32 - "routes/recruiter.js"
Cohesion: 0.29
Nodes (8): 2026-10-27: Ticket 22 — Q1 + subgraph (Phase 2), plain(), queryMeta(), toNumber(), EXISTS_CANDIDATE, EXISTS_CANDIDATE_JOB, EXISTS_EMPLOYER, recruiterRouter

### Community 33 - "audit-nofake.js"
Cohesion: 0.31
Nodes (5): ALLOW_LISTED_MATH_RANDOM, auditFileContent(), auditNoFake(), PROHIBITED_PATTERNS, scanDir()

### Community 34 - "initBars"
Cohesion: 0.32
Nodes (6): escHtml(), initBars(), drawSvg(), drawTable(), render(), truncate()

### Community 36 - "inspector.js"
Cohesion: 0.53
Nodes (5): el(), heldCell(), initInspector(), renderMatch(), renderRawNode()

### Community 37 - "initRecruiter"
Cohesion: 0.67
Nodes (6): el(), initRecruiter(), boot(), load(), renderMatrix(), renderRings()

### Community 38 - "Job Portal Graph"
Cohesion: 0.15
Nodes (12): 1. Architecture & Stack, 2.1 Prerequisites, 2.2 Starting Database Containers, 2.3 Installation & Boot, 2. Quick Start, 3. Environment Variables Reference, 4. Test Suite & Test-DB Safeguards, 5. Benchmarking & Latency Measurements (+4 more)

### Community 39 - "executeWrite"
Cohesion: 0.36
Nodes (5): extractRequirements(), SKILL_CATALOGUE, UPSERT_INGESTED_JOB, UPSERT_INGESTED_REQUIREMENTS, skills

### Community 40 - "devDependencies"
Cohesion: 0.40
Nodes (3): playwright@^1.64.1, failures, playwright

### Community 42 - "candidate"
Cohesion: 0.67
Nodes (3): 2026-10-27: Ticket 39 — SSE stream (Phase 4), 2026-10-27: Ticket 45 — recruiter view (Phase 4), candidate()

### Community 43 - "canvas.js"
Cohesion: 0.33
Nodes (4): 2026-10-27: Ticket 41 — linked views (Phase 4), EDGE_COLORS, initCanvas(), NODE_COLORS

### Community 45 - "pickCareerSteps"
Cohesion: 0.50
Nodes (3): 2026-10-27: Ticket 53 — career path engine (Phase 6), pickCareerSteps(), missing

## Knowledge Gaps
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `db.js` to `package.json`, `audit-nofake.js`, `src/app.js`, `executeWrite`, `js/app.js`, `authPrimitives.test.js`, `ats.js`, `pickCareerSteps`, `routes/candidates.js`, `matching.js`, `src/app.js`, `api.js`, `cypherVsReference.test.js`, `routes/auth.js`, `blind.js`, `services/whatIf.js`?**
  _High betweenness centrality (0.234) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `executeRead()` (e.g. with `2026-10-27: Ticket 05 — Driver + Transactions (Phase 1)` and `2026-10-27: Ticket 09 — health + shutdown (Phase 1)`) actually correct?**
  _`executeRead()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.057004830917874394 - nodes in this community are weakly interconnected._
- **Why does `Progress` connect `Progress` to `routes/recruiter.js`, `src/app.js`, `db.js`, `js/app.js`, `candidate`, `canvas.js`, `pickCareerSteps`, `routes/candidates.js`, `routes/candidates.js`, `matching.js`, `src/app.js`, `setState`, `services/whatIf.js`?**
  _High betweenness centrality (0.143) - this node is a cross-community bridge._
- **Should `DESIGN.md` be split into smaller, more focused modules?**
  _Cohesion score 0.05263157894736842 - nodes in this community are weakly interconnected._
- **Why does `executeRead()` connect `src/app.js` to `routes/recruiter.js`, `PLAN.md — Job Portal with Skill-Based Candidate Matching (Neo4j graph edition)`, `executeWrite`, `Progress`, `routes/candidates.js`, `TICKETS.md — job-portal-graph`, `match.js`, `routes/applications.js`, `routes/report.js`, `routes/candidates.js`, `routes/jobs.js`, `cypherVsReference.test.js`, `routes/auth.js`, `services/whatIf.js`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Should `check-phase4-e2e.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.09956709956709957 - nodes in this community are weakly interconnected._