## CLAUDE.md Quality Report

### Summary
- **Files found:** 3 (`./CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`)
- **Average score:** about 44/100 (D)
- **Files needing update:** all 3

The files are short and readable, which is good. The problem is that most of the specific claims in them don't match the code. I found 9 factual errors, and 3 of them would break things right away: a missing script, the wrong port, and the wrong env var name.

I checked every claim against the source, and ran what I could:
- `pnpm run check` fails with `ERR_PNPM_NO_SCRIPT Missing script: check`.
- `make -n db-reset` shows it reads `$DATABASE_URL`.
- `make test` failed before any tests ran. `go.mod` needs Go 1.25, this machine has Go 1.24.7, and the sandbox blocked the automatic Go download. So I haven't confirmed whether the backend tests pass.

---

### 1. `./CLAUDE.md` (root) — **42/100 (D)**

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 5/20 | None here; that's acceptable since the subdirectory files carry them |
| Architecture | 8/20 | One line, and the link goes to a 2-line stub |
| Non-obvious patterns | 3/15 | None |
| Conciseness | 13/15 | Tight |
| Currency | 5/15 | The Node version is wrong |
| Actionability | 8/15 | The link works but tells you almost nothing |

**Issues:**
- **"Use Node 20" is wrong.** `frontend/package.json:4` requires `"node": ">=22"`. It also disagrees with `frontend/CLAUDE.md`, which says 18+.
- The link to `.docs/ARCHITECTURE.md` works, but that file just says "Go API + SvelteKit frontend."
- `:8080` is correct (`main.go:10`).

---

### 2. `backend/CLAUDE.md` — **40/100 (D)**

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 14/20 | The three make targets exist; Go version and DB prerequisites are missing |
| Architecture | 6/20 | The two package paths it gives are both wrong |
| Non-obvious patterns | 5/15 | Has a "Conventions" section, but what it says is inaccurate |
| Conciseness | 13/15 | Tight |
| Currency | 0/15 | 4 stale or false claims |
| Actionability | 2/15 | Following it would send Claude to the wrong paths, function names and env vars |

**Issues:**
- **Wrong path:** it says `internal/validate/`. The real package is `internal/core/validation/rules/` (`rules/note.go`).
- **Wrong constructor:** it says `postgres.NewNoteRepo()`. The real one is `NewNoteRepository()` (`note_repository.go:5`).
- **Injection claim is false:** `main.go` never builds or injects a repository. It only calls `http.ListenAndServe(":8080", nil)`.
- **Validation claim can't be true:** it says "every handler calls into the rules package", but there are no handlers. Nothing imports `rules` (I grepped). The rule "don't re-check lengths in handlers" rests on code that doesn't exist yet. It should be written as a plan, not described as current behaviour.
- **Wrong env var:** it says `DB_URL`. Both `main.go:9` and `mk/db.mk:4` use `DATABASE_URL`, so setting `DB_URL` would silently do nothing.
- **Missing prerequisites:**
  - Go 1.25 (`go.mod`). This is what made `make test` fail here.
  - `psql` on your PATH.
  - `DATABASE_URL` must be set before `make db-reset`.
- **Missing warning:** `db-reset` runs `DROP TABLE IF EXISTS notes` against whatever `DATABASE_URL` points to, so it should say that clearly.

---

### 3. `frontend/CLAUDE.md` — **49/100 (D)**

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 10/20 | 1 of 3 commands fails; `test:e2e` has no tests to run |
| Architecture | 5/20 | None, apart from the proxy note |
| Non-obvious patterns | 8/15 | The proxy note is the right kind of gotcha, but its port is wrong |
| Conciseness | 14/15 | Tight |
| Currency | 3/15 | 3 of 4 facts are wrong |
| Actionability | 9/15 | Copy-paste ready, but one command fails |

**Issues:**
- **`pnpm run check` fails.** The script is called `typecheck` (confirmed by running it).
- **Wrong port:** it says the proxy goes to port 3000. `vite.config.ts:6` proxies `/api` to `http://localhost:8080`. It also contradicts its own line 6, which says requests go "to the backend".
- **Wrong Node version:** "Node 18+" should be `>=22`.
- **No e2e tests exist.** `playwright.config.ts` points at `tests/e2e`, which isn't there, so `pnpm run test:e2e` has nothing to run.
- **No dependencies declared.** `package.json` has no dependencies or devDependencies at all (no vite, sveltekit, svelte-check or playwright), and the lockfile is just a header. `pnpm install` won't make any of these commands work. This is a code problem rather than a docs problem, but it's worth knowing.

---

### Proposed updates

**`./CLAUDE.md`**
```diff
-Use Node 20 for the frontend.
+Requires Node 22+ (frontend, per `package.json` engines) and Go 1.25 (backend, per `go.mod`).
```

**`backend/CLAUDE.md`**
```diff
 make run       # API server
 make test
-make db-reset  # wipe and recreate the local DB
+make db-reset  # DROPS and recreates `notes` in $DATABASE_URL (needs psql)
 ...
-Request validation is centralised: every handler calls into the shared
-rules package under `internal/validate/` before touching a repository, so
-don't re-check lengths in handlers.
+Validation rules live in `internal/core/validation/rules/` (e.g. `MaxBodyLen`).
+Handlers should use these rather than re-checking lengths inline.
 
-Repositories are built with `postgres.NewNoteRepo()` and injected in `main.go`.
+Repositories: `internal/adapters/postgres/` (`postgres.NewNoteRepository()`).
+Not yet wired into `cmd/server/main.go`.
 
-The server reads its connection string from `DB_URL`.
+Connection string: `DATABASE_URL` (used by both the server and `make db-reset`).
```

**`frontend/CLAUDE.md`**
```diff
-Requires Node 18+.
+Requires Node 22+.
 ...
-pnpm run check     # type-check
-pnpm run test:e2e  # Playwright
+pnpm run typecheck # svelte-check
+pnpm run test:e2e  # Playwright; specs go in tests/e2e/ (none exist yet)
 ...
-The dev proxy forwards `/api` to the API on port 3000 (see `vite.config.ts`).
+The dev proxy forwards `/api` to the backend on :8080 (see `vite.config.ts`).
```

Optionally, I can also either fill in `.docs/ARCHITECTURE.md` with the real layout (`cmd/server`, `internal/core/validation/rules`, `internal/adapters/postgres`) or remove the link to it.

Should I apply these edits? I won't touch the missing frontend dependencies or the empty e2e directory unless you want me to; those are code gaps, not documentation fixes.
