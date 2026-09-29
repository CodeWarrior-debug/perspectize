## CLAUDE.md Quality Report

I found **7 factual errors** across the three CLAUDE.md files. The documentation contradicts the actual code in several critical places:

### ❌ **Backend CLAUDE.md** — 3 errors

| Issue | Documentation | Actual Code |
|-------|---|---|
| **Validation package path** | `internal/validate/` | `internal/core/validation/` (rules/note.go) |
| **Repository constructor** | `postgres.NewNoteRepo()` | `postgres.NewNoteRepository()` (note_repository.go:5) |
| **Environment variable** | `DB_URL` | `DATABASE_URL` (cmd/server/main.go:9) |

### ❌ **Frontend CLAUDE.md** — 3 errors

| Issue | Documentation | Actual Code |
|-------|---|---|
| **Node version requirement** | "Requires Node 18+" | `"engines": { "node": ">=22" }` in package.json |
| **Dev proxy target port** | "proxied to... port 3000" | `'http://localhost:8080'` in vite.config.ts:6 |
| **Typecheck command** | `pnpm run check` | Script is `typecheck` in package.json:8 |

### ❌ **Root CLAUDE.md** — 1 error

| Issue | Documentation | Actual Code |
|-------|---|---|
| **Node version** | "Use Node 20 for the frontend" | `>=22` in package.json:4 |

### ✅ What's accurate
- Monorepo structure (backend/frontend)
- Backend as Go API on :8080, frontend as SvelteKit
- Architecture.md file exists and is referenced correctly
- Makefile commands (`run`, `test`, `db-reset`)
- Test commands for frontend (e2e with Playwright)

**Severity**: Medium — these errors would cause immediate confusion when developers try to follow the setup instructions. The database URL, function names, and command names are all actionable mistakes.
