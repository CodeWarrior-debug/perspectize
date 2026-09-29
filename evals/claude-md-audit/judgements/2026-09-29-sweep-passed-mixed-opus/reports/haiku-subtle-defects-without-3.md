## CLAUDE.md Quality Audit Report

I found **7 significant discrepancies** between the documentation and actual code. Here's the breakdown:

### 🔴 **Root CLAUDE.md** (`/CLAUDE.md`)

**Status:** 1 inaccuracy
- **Node version claim:** States "Node 20" but `frontend/package.json` specifies `>=22`
  - **Impact:** Developers may try to use Node 20 and encounter compatibility issues

---

### 🔴 **Backend CLAUDE.md** (`/backend/CLAUDE.md`)

**Status:** 4 critical inaccuracies

1. **Environment variable name:** Claims `DB_URL` but actual code uses `DATABASE_URL`
   - Found in: `backend/mk/db.mk` line 4 and `backend/cmd/server/main.go` line 9
   - **Impact:** High — developers will fail to run `make db-reset` if they set the wrong env var

2. **Repository constructor name:** Says `postgres.NewNoteRepo()` but actual function is `NewNoteRepository()`
   - Found in: `backend/internal/adapters/postgres/note_repository.go` line 5
   - **Impact:** Medium — copy-paste from docs will fail with function not found

3. **Validation package path:** Claims `internal/validate/` but actual path is `internal/core/validation/rules/`
   - Found in: File exists at `backend/internal/core/validation/rules/note.go`
   - **Impact:** Medium — incorrect mental model of architecture

4. **Handler validation pattern claim:** States "every handler calls into the shared rules package" but minimal backend stub shows no handlers
   - **Impact:** Low-Medium — documentation describes patterns not yet implemented, creates confusion about actual structure

---

### 🔴 **Frontend CLAUDE.md** (`/frontend/CLAUDE.md`)

**Status:** 3 inaccuracies

1. **Node version requirement:** Claims "Node 18+" but `package.json` specifies `>=22`
   - **Impact:** High — understates minimum version by 4 major versions; Node 18 code may not work

2. **Type-check script name:** Says `pnpm run check` but actual script is `pnpm run typecheck`
   - Found in: `frontend/package.json` line 7
   - **Impact:** Medium — exact command fails; developers must guess the real name

3. **Proxy port documentation:** States proxy forwards "to the API on port 3000" but `vite.config.ts` line 6 shows it proxies to `http://localhost:8080`
   - **Impact:** Low — proxy is correct (backend is on 8080), but docs reference wrong port; creates confusion

---

### Summary

| Category | Issues | Severity |
|----------|--------|----------|
| **Environment variables** | 1 | 🔴 High |
| **API/function names** | 1 | 🔴 High |
| **Node.js versions** | 2 | 🔴 High |
| **Script names** | 1 | 🔴 Medium |
| **Path/module organization** | 1 | 🟡 Medium |
| **Port numbers** | 1 | 🟡 Low |

**Recommendation:** Prioritize fixes for environment variables, function names, and Node versions (can break developer workflows). Update all three files to match the actual codebase.
