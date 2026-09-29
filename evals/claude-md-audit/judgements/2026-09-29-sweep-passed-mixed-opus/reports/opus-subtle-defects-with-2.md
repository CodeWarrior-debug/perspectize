## CLAUDE.md Quality Report

### Summary
- **Files found:** 3 (`./CLAUDE.md`, `./backend/CLAUDE.md`, `./frontend/CLAUDE.md`)
- **Average score:** about 49/100
- **Files needing update:** 3 of 3

The files are short and well organised, but most of their specific claims are wrong when checked against the code. Of the 12 concrete claims I checked, 8 are wrong, 1 can't be confirmed, and 3 are accurate. Wrong facts in a CLAUDE.md do more harm than missing ones, because Claude will act on them without checking.

---

### 1. `./CLAUDE.md` (project root)
**Score: 55/100 (C)**

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 8/20 | None; it relies on the subdirectory files |
| Architecture clarity | 12/20 | The monorepo split is correct. The linked doc is two lines long and adds nothing. |
| Non-obvious patterns | 5/15 | None |
| Conciseness | 15/15 | Tight |
| Currency | 5/15 | Node version is wrong |
| Actionability | 10/15 | — |

**Issues:**
- ❌ `CLAUDE.md:4` says "Use Node 20", but `frontend/package.json:4` requires `"node": ">=22"`. Node 20 will fail that engine check. The three sources give three different answers (20 / 18+ / ≥22).
- ✅ The Go API on `:8080` matches `backend/cmd/server/main.go:10`.
- ⚠️ `.docs/ARCHITECTURE.md` just says "Go API + SvelteKit frontend." The link sends readers somewhere with no extra information.

---

### 2. `./backend/CLAUDE.md`
**Score: 38/100 (D)**

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 16/20 | All three make targets exist |
| Architecture clarity | 4/20 | Both path and constructor references are wrong |
| Non-obvious patterns | 4/15 | The validation "convention" isn't backed by the code |
| Conciseness | 14/15 | — |
| Currency | 0/15 | Every architecture claim is stale |
| Actionability | 0/15 | Following the env var guidance breaks `db-reset` |

**Issues:**
- ✅ `make run`, `make test` and `make db-reset` all exist (`Makefile:5-9`, and `mk/db.mk:3` pulled in by `include`).
- ❌ **Env var name (line 19):** it says `DB_URL`, but the code uses `DATABASE_URL` in both `cmd/server/main.go:9` and `mk/db.mk:4`. Setting `DB_URL` as documented means `make db-reset` runs `psql ""` against the default database. That is the most harmful error in these files.
- ❌ **Validation path (line 14):** `internal/validate/` doesn't exist. The rules package is at `internal/core/validation/rules/` (`note.go`, which holds `MaxBodyLen`).
- ❌ **Constructor name (line 17):** `postgres.NewNoteRepo()` doesn't exist. The real one is `NewNoteRepository()` (`internal/adapters/postgres/note_repository.go:5`).
- ❌ **"Injected in `main.go`" (line 17):** `main.go` builds no repository. It calls `ListenAndServe` with a `nil` handler.
- ⚠️ **"Every handler calls into the shared rules package… don't re-check lengths in handlers" (lines 13-15):** there are no handlers, and nothing calls into `rules`. This describes a convention that doesn't exist yet. It is risky because it tells Claude to skip validation.
- `db-reset` drops the `notes` table (`scripts/reset.sql`), so the "wipe" description is accurate. It needs `psql` on PATH and `DATABASE_URL` set, and the file mentions neither.
- Missing: Go version (`go.mod` says `go 1.25`).

---

### 3. `./frontend/CLAUDE.md`
**Score: 30/100 (D)**

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 10/20 | 1 of 3 commands is broken |
| Architecture clarity | 6/20 | Proxy target is wrong |
| Non-obvious patterns | 5/15 | The proxy note is the right kind of content, but the facts are wrong |
| Conciseness | 15/15 | — |
| Currency | 0/15 | Node version, script name and port are all stale |
| Actionability | 0/15 | Commands fail as written |

**Issues:**
- ❌ **Node version (line 3):** it says "Node 18+", but `package.json` requires `>=22`.
- ❌ **`pnpm run check` (line 7):** there is no such script. It's `pnpm run typecheck` (`package.json:7`, which runs `svelte-check`).
- ❌ **Proxy port (line 11):** it says port 3000, but `vite.config.ts:6` proxies `/api` to `http://localhost:8080`. The file says "see `vite.config.ts`" and that file shows a different port.
- ⚠️ **`pnpm run test:e2e`:** the script exists, but `playwright.config.ts` points to `tests/e2e`, which isn't in the repo. The command will find no tests.
- ✅ `pnpm run dev` works as documented.

---

### Proposed updates

**`./CLAUDE.md`**
```diff
-Use Node 20 for the frontend.
+Frontend requires Node >=22 (`frontend/package.json` engines). Backend is Go 1.25.
```
I'd also either delete the `.docs/ARCHITECTURE.md` link or fill that doc out.

**`./backend/CLAUDE.md`**
```diff
-make db-reset  # wipe and recreate the local DB
+make db-reset  # DROPs and recreates `notes` via psql; needs DATABASE_URL + psql on PATH
 ```
 
 ## Conventions
 
-Request validation is centralised: every handler calls into the shared
-rules package under `internal/validate/` before touching a repository, so
-don't re-check lengths in handlers.
+Validation rules live in `internal/core/validation/rules/` (e.g. `MaxBodyLen`).
+No HTTP handlers exist yet; when adding them, validate via this package.
 
-Repositories are built with `postgres.NewNoteRepo()` and injected in `main.go`.
+Postgres adapters: `internal/adapters/postgres/` (`NewNoteRepository()`).
+Not yet wired into `main.go`.
 
-The server reads its connection string from `DB_URL`.
+Connection string env var: `DATABASE_URL` (used by the server and `make db-reset`).
```

**`./frontend/CLAUDE.md`**
```diff
-Requires Node 18+.
+Requires Node >=22.
 ...
-pnpm run check     # type-check
-pnpm run test:e2e  # Playwright
+pnpm run typecheck # svelte-check
+pnpm run test:e2e  # Playwright; specs go in tests/e2e/ (none exist yet)
 ```
 
-The dev proxy forwards `/api` to the API on port 3000 (see `vite.config.ts`).
+The dev proxy forwards `/api` to the backend on :8080 (see `vite.config.ts`).
```

These changes would raise all three files to roughly the B range. The remaining gap is content the code doesn't provide yet, such as real handlers and tests.

Should I apply these edits? I can apply all of them or only some.
