## CLAUDE.md Quality Report

### Summary

**Files found:** 4  
**Average score:** 76/100 (Grade: C+)  
**Files needing update:** 3

---

### File-by-File Assessment

#### 1. ./CLAUDE.md (Project Root)
**Score: 82/100 (Grade: B)**

| Criterion | Score | Notes |
|-----------|-------|-------|
| Commands/workflows | 18/20 | Commands documented, but some details outdated (e.g., agent delegation assumptions) |
| Architecture clarity | 18/20 | Good overview, well-structured. Monorepo layout clear. |
| Non-obvious patterns | 16/20 | Covers key gotchas (qmd → graphify, gofmt hooks, migration safety). Gaps: graphify output doesn't exist yet. |
| Conciseness | 16/20 | Dense but readable. Could trim the GitHub API examples section. |
| Currency | 13/15 | Go version spec in backend/CLAUDE.md is stale. Agent delegation table may not match available skills. |
| Actionability | 17/20 | PR/branch workflows are copy-paste ready. Graphify commands are hypothetical (output doesn't exist). |

**Issues:**
- **graphify section references `graphify-out/` which doesn't exist** — claiming "knowledge graph at graphify-out/ with god nodes, community structure" but the directory is absent. Blocks actionable use.
- **Agent delegation table assumes skills exist** — lists `go-backend`, `graphql-designer`, `db-migration` subagents with no caveat that they may not be available in all sessions.
- **Migration safety warning is non-standard** — "Never run `make migrate-up`" is highly unusual and may confuse developers. Needs context about why Sevalla == shared state.

**Recommended additions:**
- Add status indicator for graphify: "Status: graphify not yet generated. First run: `graphify update .` from repo root."
- Clarify agent delegation: "Available subagents depend on your session type; check `/agent list` if these don't resolve."

---

#### 2. ./frontend/CLAUDE.md  
**Score: 80/100 (Grade: B)**

| Criterion | Score | Notes |
|-----------|-------|-------|
| Commands/workflows | 19/20 | All npm/pnpm commands verified working. Good cloud/CI sandbox note. |
| Architecture clarity | 19/20 | Deep modules well-explained. Component structure clear. |
| Non-obvious patterns | 17/20 | Excellent Svelte 5 rune gotchas, TanStack Query patterns, AG Grid gotchas documented. |
| Conciseness | 16/20 | Very dense (252 lines). Svelte 5 section is comprehensive but could use a quick-reference checklist. |
| Currency | 16/20 | Tailwind v4 documented correctly. Vitest Browser Mode info looks current. One oddity: "PWA service worker is built but never registered" — is this intentional? |
| Actionability | 17/20 | Most instructions are copy-paste ready. Chrome DevTools MCP paths assumed working. |

**Issues:**
- **MCP tool paths may not exist** — references `mcp__chrome-devtools__navigate_page`, `mcp__chrome-devtools__take_screenshot` etc. with no caveat that they require `.claude/.env` and `.claude/sv-profile/` (gitignored, hand-provisioned). If these tools aren't available, the verification section fails silently.
- **PWA service worker note is confusing** — "built but never registered" + "Before wiring registration up, note that sw.js routes navigations to a non-precached `/`, which fails install." Unclear if this is a known limitation or a bug. Suggest: "Status: PWA SW built but intentionally not registered due to routing issue; see #312."
- **Dense testing section** — 12 subsections on testing gotchas. Well-written but a first-time reader might miss the key pattern (extract logic, test via pure functions, use Browser Mode for integration).

**Recommended additions:**
- Add a "Quick Start" checklist: "To set up: `pnpm install` → copy `.env.example` to `.env` → `pnpm run dev`"
- Clarify MCP tool availability: "Chrome DevTools MCP requires local session with `.claude/.env` and `.claude/sv-profile/` (gitignored). Cloud/CI sessions skip browser verification."

---

#### 3. ./backend/CLAUDE.md
**Score: 72/100 (Grade: C+)**

| Criterion | Score | Notes |
|-----------|-------|-------|
| Commands/workflows | 17/20 | Makefile commands documented and correct. But some guidance is outdated (Go version). |
| Architecture clarity | 18/20 | Hexagonal + deep modules well-explained. Dependency rule clear. |
| Non-obvious patterns | 15/20 | Good gqlgen gotchas (schema.resolvers.go collision). GORM mapping pattern is clear. Cursory on error handling patterns. |
| Conciseness | 15/20 | Could trim the "Adding a New Feature" checklist (8 steps is obvious from reading the code). |
| Currency | 12/15 | **Go version is stale.** CLAUDE.md says "Go 1.25+" but go.mod specifies `go 1.26`. Database is remote Sevalla but `make docker-up` is still documented as setup. |
| Actionability | 14/20 | Most commands work but some assumptions are wrong (docker-up when DB is Sevalla). GORM paginator gotcha is buried (issue #327). |

**Issues:**
- **Go version mismatch:** Line 46 says "Go 1.25+" but actual `go.mod` requires `go 1.26`. Minor but undermines trust.
- **Confusing database setup:** Instructions say "go mod download && **make docker-up** && make migrate-up" but then clarify "database is remote (Sevalla)" — new developers will start Docker for no reason, then discover it's not needed.
- **gqlgen collisions not in build system:** The repeated failure of `make graphql-gen` leaving behind `schema.resolvers.go` is documented as a manual recovery step ("delete the stray file... but diff it first"). This is error-prone. Could be fixed with a post-gen hook but instead it's documented as a gotcha.
- **GORM paginator gotcha buried in prose:** Issue #327 (paginator returns nil error even on failure) is mentioned but easy to miss. Should be a checklist item: "After `Paginate()`: check both `err != nil` _and_ `pageResult.Error != nil`."

**Recommended additions:**
- Update Go version: "Go 1.26+ (pinned via `toolchain` in `go.mod` to `go1.26.0`)"
- Separate database setup: "Database is remote (Sevalla) — skip `make docker-up`. For isolated local testing: `make demo-up` (port 5434, separate volume)."
- Add checklist for gqlgen: "After `make graphql-gen`: (1) diff `internal/adapters/graphql/resolvers/schema.resolvers.go` for new stubs, (2) move them to per-domain files, (3) `rm schema.resolvers.go`."

---

#### 4. ./.claude/CLAUDE.md  
**Score: 35/100 (Grade: F)**

| Criterion | Score | Notes |
|-----------|-------|-------|
| Commands/workflows | 5/20 | Missing. No local-session preferences documented. |
| Architecture clarity | 0/20 | Missing. Should guide Claude on project-specific gotchas. |
| Non-obvious patterns | 5/20 | Just a graphify reference; patterns documented in root file instead. |
| Conciseness | 10/20 | 4 lines total — too terse to be useful. |
| Currency | 10/15 | graphify skill reference is current but the file itself is not keeping up with root. |
| Actionability | 0/20 | No instructions, just a skill trigger. |

**Issues:**
- **This file is severely underdeveloped** — it's meant for local/personal overrides and should contain:
  - Session-specific preferences (model, timeouts, approved permissions)
  - Local environment setup (Sevalla credentials, Figma keys if any)
  - Known local gotchas (Docker Desktop startup, database connection pooling)
  - Workaround commands for common local issues
- **Just a skill pointer** — "Use this skill whenever..." is not actionable guidance for Claude working locally on this codebase.
- **No local-session context** — the root CLAUDE.md assumes cloud sessions exist; `.claude/CLAUDE.md` should clarify local-session behavior (e.g., "Run `make install-hooks` once per checkout" should live here with status tracking).

**Recommended additions:**
- Add local session preferences (model tier, max output, approved permissions)
- Add Sevalla/credential setup (where to get `DATABASE_URL`, Figma file keys)
- Add startup checklist: "First time on this checkout: (1) `make install-hooks`, (2) `cd frontend && pnpm install`, (3) `cp backend/.env.example backend/.env`, (4) fill in real values"
- Document graphify usage: "Run `graphify update .` after major code changes. Query with `graphify query '<question>'` for codebase navigation."

---

### Cross-File Issues

1. **Inconsistent terminology:** 
   - Root calls it "qmd is fully retired" → "graphify" (line 17-18)
   - Backend/frontend don't mention graphify at all
   - Result: Developers may not know where to look for architecture docs

2. **Scattered verification guidance:**
   - Root points to [.docs/VERIFICATION.md](.docs/VERIFICATION.md) (Chrome DevTools MCP)
   - Frontend duplicates the Chrome DevTools section
   - Result: Maintenance burden, easy to get out of sync

3. **Monorepo local development complexity:**
   - Root says "backend/ — Go GraphQL API (see `backend/CLAUDE.md`)"
   - Backend says "Database is remote (Sevalla)"
   - Frontend says "pnpm run dev" (local)
   - No clear "start everything" checklist in any file

---

### Key Validations Passed ✓
- Commands documented exist and match actual Makefile/package.json
- Architecture descriptions (hexagonal, deep modules, Svelte 5 runes) match actual code
- File references (`.docs/*.md`, `frontend/docs/*.md`) exist
- GORM and TanStack Query setup matches code

### Key Validations Failed ✗
- graphify output doesn't exist yet (referenced but not generated)
- Go version in backend/CLAUDE.md is stale (1.25+ vs actual 1.26)
- ./.claude/CLAUDE.md is nearly empty despite being meant for local overrides

---

### Recommendation

**Priority fixes:**
1. **High:** Update backend/CLAUDE.md Go version (line 46) from `1.25+` to `1.26+`
2. **High:** Populate ./.claude/CLAUDE.md with local-session guidance (startup checklist, credential setup, local preferences)
3. **Medium:** Add graphify status indicator to root CLAUDE.md explaining its absence
4. **Medium:** Clarify Sevalla database setup flow (skip `make docker-up`, use `make demo-up` for local testing)

**Optional improvements:**
- Move verification guidance to a single location (avoid duplication)
- Add "quick start" checklist at the top of frontend/CLAUDE.md
- Document the gqlgen schema.resolvers.go collision as a Makefile post-gen hook instead of manual recovery
