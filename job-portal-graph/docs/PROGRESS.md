# Progress

Format: `## YYYY-MM-DD: <phase/ticket>` then what passed, what was skipped and why.

## 2026-10-27: Ticket 01 — workspace scaffold (Phase 0)

- Created `job-portal-graph/` with `package.json`, `.gitignore`, `.env.example`, `docker-compose.yml`.
- Installed runtime deps (express, neo4j-driver, zod, helmet, express-rate-limit, pino, pino-http, argon2, jsonwebtoken, cookie-parser, compression, dotenv, vis-network, vis-data, d3) and dev deps (vitest, supertest, playwright, eslint). `npm ls --depth=0` clean, 0 vulnerabilities.
- `docker compose config -q` parses.
- Skipped: Playwright browser download (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`). Browsers are only needed from Phase 4; install with `npx playwright install`.
- Decision: app lives in `job-portal-graph/` (plan §5–6). `plan.md` stays only at the repo root — not duplicated — to keep one source of truth; `job-portal-graph/` reads `../plan.md`.
- Not done yet: no app code, no Docker container running, no `DESIGN.md`.
