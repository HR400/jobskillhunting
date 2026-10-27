# Graph Report - jobskillhunting  (2026-10-27)

## Corpus Check
- 107 files · ~57,576 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: .example 1, (none) 1, .css 1)

## Summary
- 614 nodes · 1495 edges · 23 communities (21 shown, 2 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 100 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5fd88727`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- package.json
- DESIGN.md
- check-phase3-smoke.mjs
- PLAN.md — Job Portal with Skill-Based Candidate Matching (Neo4j graph edition)
- src/app.js
- healthcheck
- config.js
- db.js
- js/app.js
- match.js
- queries/candidates.js
- AGENTS.md
- forms.js
- Progress
- TICKETS.md — job-portal-graph
- matching.js
- cypherVsReference.test.js
- routes/applications.js
- escoAvailable
- candidateSkillsEducation.js
- candidate
- services/whatIf.js

## God Nodes (most connected - your core abstractions)
1. `Progress` - 41 edges
2. `vitest` - 38 edges
3. `getTestDriver()` - 29 edges
4. `signToken()` - 28 edges
5. `getTestApp()` - 26 edges
6. `wipeTestDb()` - 26 edges
7. `executeRead()` - 25 edges
8. `closeTestDriver()` - 25 edges
9. `createTestCandidate()` - 25 edges
10. `createTestEmployer()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `8.5 What-If simulator (read-only)` --references--> `executeRead()`  [INFERRED]
  plan.md → job-portal-graph/src/db/tx.js
- `Phase 2 — matching engine` --references--> `executeRead()`  [INFERRED]
  TICKETS.md → job-portal-graph/src/db/tx.js
- `10.7 UI states (R3)` --references--> `requestId()`  [INFERRED]
  plan.md → job-portal-graph/src/middleware/requestId.js
- `9.1 Robustness requirements` --references--> `verifyConnectivity()`  [INFERRED]
  plan.md → job-portal-graph/src/db/driver.js
- `Phase 1 — data layer, auth, CRUD` --references--> `verifyConnectivity()`  [INFERRED]
  TICKETS.md → job-portal-graph/src/db/driver.js

## Import Cycles
- None detected.

## Communities (23 total, 2 thin omitted)

### Community 0 - "package.json"
Cohesion: 0.06
Nodes (45): dependencies, argon2@^0.45.1, compression@^1.8.2, cookie-parser@^1.4.7, d3@^7.9.0, dotenv@^18.0.9, express@^5.3.0, express-rate-limit@^8.7.1 (+37 more)

### Community 1 - "DESIGN.md"
Cohesion: 0.05
Nodes (37): Border Radius Scale, Brand & Accent, Brand Gradient, Breakpoints, Buttons, Cards & Containers, Collapsing Strategy, Colors (+29 more)

### Community 2 - "check-phase3-smoke.mjs"
Cohesion: 0.09
Nodes (15): playwright@^1.64.1, failures, currentCoEl, degreeInput, dobEl, email, failures, nextBtn (+7 more)

### Community 3 - "PLAN.md — Job Portal with Skill-Based Candidate Matching (Neo4j graph edition)"
Cohesion: 0.05
Nodes (37): 0. How the agent must work, 10.1 Design, 10.2 Layout, 10.3 Profile wizard (real input only), 10.4 The match reveal (signature interaction), 10.5 Linked views (brushing and linking), 10.6 Recruiter view, 10.7 UI states (R3) (+29 more)

### Community 4 - "src/app.js"
Cohesion: 0.05
Nodes (70): 2026-10-27: Ticket 07 — Error Contract (Phase 1), 2026-10-27: Ticket 10 — auth primitives (Phase 1), createApp(), executeRead(), executeWrite(), clearAuthCookie(), COOKIE_NAME, setAuthCookie() (+62 more)

### Community 5 - "healthcheck"
Cohesion: 0.08
Nodes (30): NEO4J_AUTH, NEO4J_PLUGINS, NEO4J_server_memory_heap_initial__size, NEO4J_server_memory_heap_max__size, interval, retries, start_period, test (+22 more)

### Community 6 - "config.js"
Cohesion: 0.14
Nodes (19): 2026-10-27: Ticket 05 — Driver + Transactions (Phase 1), 2026-10-27: Ticket 06 — Migrations (Phase 1), 2026-10-27: Ticket 34 — wizard: skills (Phase 3), app, server, shutdown(), config, parsed (+11 more)

### Community 7 - "db.js"
Cohesion: 0.15
Nodes (24): 2026-10-27: Ticket 13 — test harness (Phase 1), setDriver(), cookieOptions, hashPassword(), signToken(), TOKEN_TTL, getTestApp(), closeTestDriver() (+16 more)

### Community 8 - "js/app.js"
Cohesion: 0.05
Nodes (50): 2026-10-27: Ticket 31 — API client + store (Phase 3), 2026-10-27: Ticket 40 — reveal (Phase 4), api, ApiError, request(), activate(), barsSlot, canvasSlot (+42 more)

### Community 9 - "match.js"
Cohesion: 0.12
Nodes (17): 2026-10-27: Ticket 22 — Q1 + subgraph (Phase 2), plain(), queryMeta(), toNumber(), RANKED_JOBS, UNSCORED_JOBS, STREAM_CANDIDATE, STREAM_SCORED_JOBS (+9 more)

### Community 10 - "queries/candidates.js"
Cohesion: 0.33
Nodes (5): 2026-10-27: Ticket 14 — candidate profile (Phase 1), DELETE_CANDIDATE_PROFILE, formatCandidateNode(), GET_CANDIDATE_PROFILE, UPDATE_CANDIDATE_PROFILE

### Community 11 - "AGENTS.md"
Cohesion: 0.33
Nodes (4): Contents, graphify, Planning before building, Plugin constraints (`.opencode/plugins/graphify.js`)

### Community 13 - "forms.js"
Cohesion: 0.26
Nodes (20): clearErrors(), collected, el(), field(), initWizard(), PROFICIENCY_LABELS, render(), renderStep1() (+12 more)

### Community 14 - "Progress"
Cohesion: 0.08
Nodes (25): 2026-10-27: Ticket 01 — workspace scaffold (Phase 0), 2026-10-27: Ticket 02 — Neo4j running (Phase 0), 2026-10-27: Ticket 03 — fail-fast config + boot (Phase 0), 2026-10-27: Ticket 04 — DESIGN.md + tokens (Phase 0), 2026-10-27: Ticket 08 — Hardening (Phase 1), 2026-10-27: Ticket 09 — health + shutdown (Phase 1), 2026-10-27: Ticket 11 — register (Phase 1), 2026-10-27: Ticket 12 — login / logout / me (Phase 1) (+17 more)

### Community 15 - "TICKETS.md — job-portal-graph"
Cohesion: 0.20
Nodes (9): Phase 0 — scaffolding, Phase 2 — matching engine, Phase 3 — frontend foundation, Phase 4 — reveal and linked views, Phase 5 — real data ingestion, Phase 6 — advanced features (each flag-gated with an honest unavailable state), Phase 7 — report, benchmarks, QA, Rules for every ticket (+1 more)

### Community 16 - "matching.js"
Cohesion: 0.32
Nodes (9): 2026-10-27: Ticket 21 — reference matcher (Phase 2), 2026-10-27: Ticket 30 — Cypher-vs-reference suite (Phase 2), bandFor(), BELOW, MISSING, requirementStatus(), SATISFIED, scoreMatch() (+1 more)

### Community 17 - "cypherVsReference.test.js"
Cohesion: 0.15
Nodes (12): Q1_MATCH, Q1_SUBGRAPH, Q2_GAP, Q4_RECOMMENDATIONS, cands, HOLDS, JOBS, q1For() (+4 more)

### Community 18 - "routes/applications.js"
Cohesion: 0.18
Nodes (13): CREATE_APPLICATION, FIND_APPLICATION, GET_APPLICATION, LOCK_JOB, MY_APPLICATIONS, UPDATE_APPLICATION, EXISTS_CANDIDATE, EXISTS_CANDIDATE_JOB (+5 more)

### Community 20 - "candidateSkillsEducation.js"
Cohesion: 0.18
Nodes (12): 2026-10-27: Ticket 15 — candidate skills + education (Phase 1), CREATE_CANDIDATE_EDUCATION, DELETE_CANDIDATE_EDUCATION, DELETE_CANDIDATE_SKILL_EDGES, formatEducationNode(), GET_CANDIDATE_SKILLS, INSERT_CANDIDATE_SKILLS, candidateSkillSchema (+4 more)

### Community 21 - "candidate"
Cohesion: 0.40
Nodes (5): 2026-10-27: Ticket 39 — SSE stream (Phase 4), candidate(), 7.1 Constraints and indexes (idempotent, run by `migrate.js` on boot, tracked as `(:Migration {id, applied_at})`), 7.2 Node properties, 7. Graph schema

### Community 22 - "services/whatIf.js"
Cohesion: 0.46
Nodes (5): 2026-10-27: Ticket 29 — what-if simulator (Phase 2), BAND_ORDER, buildHypotheticalMap(), describeWhatIf(), whatIfRow()

## Knowledge Gaps
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `db.js` to `package.json`, `src/app.js`, `config.js`, `js/app.js`, `matching.js`, `cypherVsReference.test.js`, `services/whatIf.js`?**
  _High betweenness centrality (0.203) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.057971014492753624 - nodes in this community are weakly interconnected._
- **Why does `Progress` connect `Progress` to `src/app.js`, `config.js`, `db.js`, `js/app.js`, `match.js`, `queries/candidates.js`, `matching.js`, `escoAvailable`, `candidateSkillsEducation.js`, `candidate`, `services/whatIf.js`?**
  _High betweenness centrality (0.124) - this node is a cross-community bridge._
- **Should `DESIGN.md` be split into smaller, more focused modules?**
  _Cohesion score 0.05263157894736842 - nodes in this community are weakly interconnected._
- **Why does `executeRead()` connect `src/app.js` to `PLAN.md — Job Portal with Skill-Based Candidate Matching (Neo4j graph edition)`, `config.js`, `match.js`, `Progress`, `TICKETS.md — job-portal-graph`, `cypherVsReference.test.js`, `routes/applications.js`, `candidateSkillsEducation.js`, `services/whatIf.js`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **Should `check-phase3-smoke.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `PLAN.md — Job Portal with Skill-Based Candidate Matching (Neo4j graph edition)` be split into smaller, more focused modules?**
  _Cohesion score 0.05263157894736842 - nodes in this community are weakly interconnected._