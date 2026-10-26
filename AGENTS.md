# AGENTS.md

Implementation is in progress in `job-portal-graph/`; tickets in `TICKETS.md` are the work
queue. `plan.md` (repo root, not duplicated) is the build spec.

## Contents

- `plan.md` — full spec for `job-portal-graph`: phases, acceptance checks, rules.
- `TICKETS.md` — sequential tickets, each under ~100 changed lines.
- `job-portal-graph/` — the app. `npm start`, `npm run dev`, `npm test` (from this directory).
- `job-portal-graph/docs/PROGRESS.md` — phase results, decisions, skipped work.
- `.opencode/agents/planner.md` — project planning agent (read-only).
- `.opencode/plugins/graphify.js` — graphify reminder hook.
- `AGENTS.md` — this file.

Git has no commits and no remote.

## Planning before building

- Read `plan.md` fully. It is the source of truth for behaviour; `DESIGN.md` (not generated
  yet) wins on visual style.
- One ticket per session. Do not start the next until the previous done-when check ran and
  was recorded in `docs/PROGRESS.md`.
- No fake data, seed/demo scripts, or simulated unavailable resources (§0, §1 of `plan.md`).
- Neo4j 5 is pinned. Cypher 25-only clauses (`LET`, `FILTER`, `FINISH`, `INSERT`, `SEARCH`,
  `USE`) are not available — the installed Neo4j skills assume 2025.x and suggest them.
- Installed stack is Express 5, zod 4, `neo4j-driver` 6.

## graphify

`graphify` is installed (`~/.local/bin/graphify`). No graph is built yet — `graphify-out/`
does not exist. Build it with `graphify update .` once source files exist.

When `graphify-out/graph.json` exists:

- Run `graphify query "<question>"` before the first grep/glob/source read for a codebase
  question, and repeat that rule in every subagent prompt that explores code. Read raw files
  only for lines the graph or an earlier read already located.
- Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for
  focused concepts. Both return scoped subgraphs, usually far smaller than `GRAPH_REPORT.md`.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when
  query/path/explain lack enough context. Use `graphify-out/wiki/index.md` for broad
  navigation if it exists.
- Dirty `graphify-out/` files after hooks or incremental updates are expected — not a reason
  to skip graphify. Skip only when the task is about stale or incorrect graph output, or the
  user says not to use it.
- After changing code, run `graphify update .` (AST-only, no API cost).
- `graphify-out/graph.json` is rewritten whole on every build; a large diff in a PR is
  expected. Do not flag it as churn or suggest skipping the rebuild or hooks.

## Plugin constraints (`.opencode/plugins/graphify.js`)

One file must serve OpenCode 1 and 2. Each of these has broken it before:

- Keep both `setup()` (OpenCode 2, per-session, tool `shell`) and `server()` (OpenCode 1,
  per-directory, tool `bash`). Each runtime ignores the other's function.
- Never import from an `opencode` package: a plain file in `.opencode/plugins/` cannot
  resolve one.
- The `id` must stay derived from the file location; a fixed id makes a second copy fail
  with "Duplicate plugin ID".
- Keep the reminder string free of backticks and `$(...)`. It is prepended as
  `echo "<reminder>" ; <cmd>`, so command substitution would corrupt output and silently run
  graphify.
- Separate reminder and command with `;`, not `&&`: Windows PowerShell 5.1 rejects `&&` as a
  statement separator.
