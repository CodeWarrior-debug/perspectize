# Agent Roster & Routing

The project subagents in `.claude/agents/`, what each is for, and how to use
them. Coding patterns are **not** repeated here. They live in the package
CLAUDE.md files (`backend/CLAUDE.md`, `frontend/CLAUDE.md`), which every agent
is told to read first. Keeping one copy is what stops the agents drifting from
the code.

## Roster

### Implementation (backend)

| Agent | Model | Use for | Hand off to |
|---|---|---|---|
| `go-backend` | Sonnet | Domain models, ports, services, GORM repositories, resolver wiring, middleware | `graphql-designer` for SDL; `db-migration` for SQL |
| `graphql-designer` | Sonnet | `schema.graphql` / `messaging.graphql` changes, `make graphql-gen` (and its `schema.resolvers.go` collision), resolvers, dataloaders | `go-backend` for service logic |
| `db-migration` | Sonnet | Writing and reviewing golang-migrate SQL. **Never applies migrations** (shared Sevalla DB) | — |
| `test-writer` | Sonnet | Table-driven testify tests, regression tests, coverage gaps (hand-written mocks, sqlmock GORM harness) | — |

### Review

| Agent | Model | Use for |
|---|---|---|
| `code-reviewer` | inherit | Read-only review of Go backend diffs against the repo's rules (hexagonal, GORM separation, owner guards, pagination error checks, migration safety) |

### Research & external systems

Each of these holds its own scoped MCP connection, so the main session never
loads that tool set. Continue a running one with `SendMessage` instead of
spawning a new one.

| Agent | Model | Use for |
|---|---|---|
| `context7-docs` | Sonnet | Current library/framework docs (gqlgen, SvelteKit, TanStack Query, GORM, …) as a distilled, cited answer |
| `figma-designer` | Sonnet | Figma links, design-to-code, tokens, Code Connect |
| `sevalla-mcp-ops` | Haiku | Sevalla deployments, SHAs, logs, env vars, domains, metrics |

### Legacy (GSD)

`gsd-*` agents serve only the kept GSD commands (`gsd:map-codebase`,
`gsd:docs-update`, roadmap management). See [PLANNING.md](PLANNING.md).

### Gaps

There are no frontend (SvelteKit / Vitest / Playwright) agents yet. Frontend
tasks go to a general-purpose subagent with `frontend/CLAUDE.md` as required
reading.

## Using agents in superpowers plans

See [PLANNING.md → Suggested subagent types](PLANNING.md#suggested-subagent-types).
In short: plans *suggest* an agent per task. The executing skill decides
whether to dispatch it directly or use it as a reference for its own prompt.

## Designing or editing an agent

- Keep the frontmatter `description` specific. Say when to use the agent, name
  2–4 trigger scenarios, and say what it is **not** for. That is what the
  dispatcher matches on.
- The body should give the agent a *process* and *pointers* ("read
  `backend/CLAUDE.md` first", "copy the nearest sibling file"), not a second
  copy of the patterns. Copied examples go stale; this roster was rewritten
  because the old agents described sqlx after the move to GORM.
- Hard safety rules (no `migrate up/down`, no `.env` reads, no credential
  entry) go near the top of the body, even though CLAUDE.md also has them.
- Least-privilege tools: reviewers stay read-only, and implementers get
  `Edit` + `Bash` so they can verify their own work.
- Only list `skills:` entries that actually exist in the project.
- Update this roster whenever an agent is added, renamed or retired.
