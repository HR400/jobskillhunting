# Job Portal Graph

A graph-backed job matching, referral, and career path exploration platform built on Express 5 and Neo4j 5.

---

## 1. Architecture & Stack

- **Runtime:** Node.js (>=20), Express 5 (native async error propagation, wildcard routing).
- **Database:** Neo4j 5 Community Edition pinned (Bolt protocol over port 7687; test instance on port 7688).
- **Driver:** `neo4j-driver` v6 with bounded connection pooling and timeout management.
- **Frontend:** Vanilla CSS design tokens (`tokens.css`, Apple-inspired human interface guidelines), Vis-network for interactive graph canvas, and D3 for SVG radar and bar visualisations.
- **Security:** Helmet CSP (self-only, inline SVG/canvas allowed), Argon2id password hashing, HTTP-only JWT session cookies, rate limiting, and strict input validation via Zod 4.
- **Real-Data Policy (Rule R1):** Starts with an empty database. No mock data, no seed scripts, and no synthetic latency numbers. Features with absent dependencies honestly report `unavailable: <reason>`.

---

## 2. Quick Start

### 2.1 Prerequisites

- Node.js >= 20
- Docker and Docker Compose

### 2.2 Starting Database Containers

Start the main Neo4j instance:
```bash
docker compose up -d neo4j
```

Start the isolated test instance (required for automated test suite):
```bash
docker compose --profile test up -d neo4j-test
```

Verify instances:
- Main instance: `bolt://localhost:7687` (HTTP browser on port 7474)
- Test instance: `bolt://localhost:7688` (HTTP browser on port 7475)

### 2.3 Installation & Boot

```bash
cd job-portal-graph
npm install
cp .env.example .env
npm start
```

Database migrations automatically run on startup applying all 15 constraints and indexes (`IF NOT EXISTS`).
Access the application at `http://localhost:3000`.

---

## 3. Environment Variables Reference

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `PORT` | `3000` | Port for Express HTTP server |
| `NODE_ENV` | `development` | Environment mode (`development`, `production`, `test`) |
| `NEO4J_URI` | `bolt://localhost:7687` | Runtime Neo4j Bolt connection URI |
| `NEO4J_USER` | `neo4j` | Runtime Neo4j username |
| `NEO4J_PASSWORD` | `devpassword123` | Runtime Neo4j password |
| `NEO4J_TEST_URI` | `bolt://localhost:7688` | Test Neo4j connection URI (must differ from `NEO4J_URI`) |
| `NEO4J_TEST_USER` | `neo4j` | Test Neo4j username |
| `NEO4J_TEST_PASSWORD` | `devpassword123` | Test Neo4j password |
| `JWT_SECRET` | *(required ≥32 chars)* | Secret for HS256 JWT cookie signing |
| `COOKIE_SECURE` | `false` | Sets `Secure` flag on cookies (set `true` in production) |
| `QUERY_TIMEOUT_MS` | `10000` | Cypher query timeout in milliseconds |
| `BAND_STRONG` | `75` | Threshold for Strong match band |
| `BAND_MODERATE` | `40` | Threshold for Moderate match band |
| `BLIND_UNMASK_THRESHOLD` | `75` | Threshold above which candidate identity is unmasked |
| `ENFORCE_MANDATORY` | `true` | Enforces mandatory job requirements in scoring |
| `SKILL_DECAY_LAMBDA` | `0` | Skill proficiency decay rate (0 = off) |
| `ENABLE_ESCO` | `false` | Enables external ESCO skill typeahead suggestions |
| `ENABLE_ARBEITNOW` | `false` | Enables Arbeitnow job feed adapter |
| `ENABLE_ADZUNA` | `false` | Enables Adzuna job feed adapter |
| `EMBEDDINGS_PROVIDER` | `""` | Vector embeddings provider (e.g. `openai`) |
| `EMBEDDINGS_API_KEY` | `""` | Vector embeddings API key |
| `INGEST_ADMIN_TOKEN` | `""` | Secret bearer token required for admin ingest/index triggers |

---

## 4. Test Suite & Test-DB Safeguards

Run the full integration and unit test suite:
```bash
npm test
```

### Safety Guard (Rule R4)
The test harness (`tests/helpers/guard.js`) verifies that:
1. `NEO4J_TEST_URI` is explicitly configured.
2. `NEO4J_TEST_URI` does **not** equal `NEO4J_URI`.
If they match or the test URI is missing, the suite halts immediately before any query runs, guaranteeing the runtime database is never wiped or mutated.

---

## 5. Benchmarking & Latency Measurements

Execute query benchmarks for core graph queries Q1 (Match Score), Q2 (Skill Gap), Q3 (Multi-hop Referrals), and Q4 (Recruiter Recommendations):
```bash
npm run bench
```
The runner runs warmup iterations and measured runs using `performance.now()`, calculating min, p50, p95, max, and mean latencies, and writes measured results to:
- `benchmarks/results/latest.json`
- `benchmarks/results/benchmark-<timestamp>.json`

Benchmark data is exposed via `GET /api/report/benchmarks`.

---

## 6. Code Hygiene & Rule R1 Audit

Run the no-fake audit to verify compliance with Rule R1:
```bash
npm run audit:nofake
```
Scans runtime code to ensure zero occurrences of `faker`, un-allowlisted `Math.random()`, `lorem ipsum`, synthetic sample names, seed scripts, or test fixture leaks.

Run the linter:
```bash
npm run lint
```

---

## 7. Research Report

A print-to-PDF ready research report is available at:
`http://localhost:3000/report.html`

Contents include:
- System topology inline SVG diagram.
- Live query subgraphs retrieved from `/api/report/data` (with honest no-data notice when empty).
- Measured query latencies from `/api/report/benchmarks`.
- Computational complexity slopegraph (index-free adjacency $O(k)$ vs relational recursive CTEs), labelled "analytical, not measured".
- Comprehensive documentation of DA-1 normalisation (18 entities → 26 BCNF relations, BCNF table decompositions, Dependent omission) and §3.2 reconciliations (ASSESSED_FOR spelling, proficiency vs years distinction, mandatory skill enforcement, and 40% screening rule).
