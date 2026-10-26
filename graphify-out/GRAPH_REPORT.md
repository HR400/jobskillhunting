# Graph Report - jobskillhunting  (2026-10-27)

## Corpus Check
- 81 files · ~37,323 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 2 file(s) not represented in the graph (top: .example 1, (none) 1)

## Summary
- 449 nodes · 1099 edges · 13 communities (12 shown, 1 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 73 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `270f6ffe`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- package.json
- DESIGN.md
- routes/auth.js
- PLAN.md — Job Portal with Skill-Based Candidate Matching (Neo4j graph edition)
- src/app.js
- healthcheck
- config.js
- db.js
- match.js
- routes/candidates.js
- AGENTS.md
- routes/jobs.js

## God Nodes (most connected - your core abstractions)
1. `vitest` - 27 edges
2. `Progress` - 26 edges
3. `executeRead()` - 22 edges
4. `signToken()` - 22 edges
5. `getTestDriver()` - 21 edges
6. `express` - 19 edges
7. `getTestApp()` - 19 edges
8. `PLAN.md — Job Portal with Skill-Based Candidate Matching (Neo4j graph edition)` - 19 edges
9. `wipeTestDb()` - 18 edges
10. `createTestCandidate()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `8.5 What-If simulator (read-only)` --references--> `executeRead()`  [INFERRED]
  plan.md → job-portal-graph/src/db/tx.js
- `10.7 UI states (R3)` --references--> `requestId()`  [INFERRED]
  plan.md → job-portal-graph/src/middleware/requestId.js
- `Phase 2 — matching engine` --references--> `executeRead()`  [INFERRED]
  TICKETS.md → job-portal-graph/src/db/tx.js
- `Phase 1 — data layer, auth, CRUD` --references--> `authenticate()`  [INFERRED]
  TICKETS.md → job-portal-graph/src/middleware/auth.js
- `Phase 1 — data layer, auth, CRUD` --references--> `requireRole()`  [INFERRED]
  TICKETS.md → job-portal-graph/src/middleware/auth.js

## Import Cycles
- None detected.

## Communities (13 total, 1 thin omitted)

### Community 0 - "package.json"
Cohesion: 0.06
Nodes (46): dependencies, argon2@^0.45.1, compression@^1.8.2, cookie-parser@^1.4.7, d3@^7.9.0, dotenv@^18.0.9, express@^5.3.0, express-rate-limit@^8.7.1 (+38 more)

### Community 1 - "DESIGN.md"
Cohesion: 0.05
Nodes (37): Border Radius Scale, Brand & Accent, Brand Gradient, Breakpoints, Buttons, Cards & Containers, Collapsing Strategy, Colors (+29 more)

### Community 2 - "routes/auth.js"
Cohesion: 0.10
Nodes (28): clearAuthCookie(), COOKIE_NAME, cookieOptions, hashPassword(), setAuthCookie(), TOKEN_TTL, verifyPassword(), verifyToken() (+20 more)

### Community 3 - "PLAN.md — Job Portal with Skill-Based Candidate Matching (Neo4j graph edition)"
Cohesion: 0.05
Nodes (40): candidate(), 0. How the agent must work, 10.1 Design, 10.2 Layout, 10.3 Profile wizard (real input only), 10.4 The match reveal (signature interaction), 10.5 Linked views (brushing and linking), 10.6 Recruiter view (+32 more)

### Community 4 - "src/app.js"
Cohesion: 0.12
Nodes (24): 2026-10-27: Ticket 07 — Error Contract (Phase 1), 2026-10-27: Ticket 08 — Hardening (Phase 1), AppError, asyncHandler(), errorHandler(), notFoundHandler(), authLimiter, globalLimiter (+16 more)

### Community 5 - "healthcheck"
Cohesion: 0.08
Nodes (30): NEO4J_AUTH, NEO4J_PLUGINS, NEO4J_server_memory_heap_initial__size, NEO4J_server_memory_heap_max__size, interval, retries, start_period, test (+22 more)

### Community 6 - "config.js"
Cohesion: 0.10
Nodes (27): 2026-10-27: Ticket 05 — Driver + Transactions (Phase 1), app, server, shutdown(), config, parsed, schema, closeDriver() (+19 more)

### Community 7 - "db.js"
Cohesion: 0.18
Nodes (21): 2026-10-27: Ticket 13 — test harness (Phase 1), createApp(), setDriver(), signToken(), getTestApp(), closeTestDriver(), getTestDriver(), initTestDb() (+13 more)

### Community 9 - "match.js"
Cohesion: 0.08
Nodes (38): 2026-10-27: Ticket 21 — reference matcher (Phase 2), 2026-10-27: Ticket 22 — Q1 + subgraph (Phase 2), plain(), queryMeta(), toNumber(), CREATE_APPLICATION, FIND_APPLICATION, GET_APPLICATION (+30 more)

### Community 10 - "routes/candidates.js"
Cohesion: 0.07
Nodes (34): 2026-10-27: Ticket 01 — workspace scaffold (Phase 0), 2026-10-27: Ticket 02 — Neo4j running (Phase 0), 2026-10-27: Ticket 03 — fail-fast config + boot (Phase 0), 2026-10-27: Ticket 04 — DESIGN.md + tokens (Phase 0), 2026-10-27: Ticket 06 — Migrations (Phase 1), 2026-10-27: Ticket 09 — health + shutdown (Phase 1), 2026-10-27: Ticket 10 — auth primitives (Phase 1), 2026-10-27: Ticket 11 — register (Phase 1) (+26 more)

### Community 11 - "AGENTS.md"
Cohesion: 0.33
Nodes (4): Contents, graphify, Planning before building, Plugin constraints (`.opencode/plugins/graphify.js`)

### Community 13 - "routes/jobs.js"
Cohesion: 0.13
Nodes (20): zod@^4.6.7, cache, escoAvailable(), searchEsco(), skillKey(), CREATE_JOB, formatJobNode(), formatRequirement() (+12 more)

## Knowledge Gaps
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `executeRead()` connect `config.js` to `routes/auth.js`, `PLAN.md — Job Portal with Skill-Based Candidate Matching (Neo4j graph edition)`, `src/app.js`, `match.js`, `routes/candidates.js`, `routes/jobs.js`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `executeRead()` (e.g. with `2026-10-27: Ticket 05 — Driver + Transactions (Phase 1)` and `2026-10-27: Ticket 09 — health + shutdown (Phase 1)`) actually correct?**
  _`executeRead()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05735430157261795 - nodes in this community are weakly interconnected._
- **Why does `Progress` connect `routes/candidates.js` to `match.js`, `src/app.js`, `config.js`, `db.js`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Should `DESIGN.md` be split into smaller, more focused modules?**
  _Cohesion score 0.05263157894736842 - nodes in this community are weakly interconnected._
- **Should `routes/auth.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09639953542392567 - nodes in this community are weakly interconnected._
- **Should `PLAN.md — Job Portal with Skill-Based Candidate Matching (Neo4j graph edition)` be split into smaller, more focused modules?**
  _Cohesion score 0.04878048780487805 - nodes in this community are weakly interconnected._