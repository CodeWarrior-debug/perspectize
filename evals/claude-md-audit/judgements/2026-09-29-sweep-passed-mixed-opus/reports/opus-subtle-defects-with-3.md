## CLAUDE.md Quality Report

### Summary
- **Files found:** 3 (`./CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`)
- **Average score:** 45/100
- **Files needing update:** 3 of 3

I checked every factual claim against the code; the repo has 16 tracked files and I read all of them. The main problem isn't style. Each file contains claims that are simply wrong, and two of them would break things if followed as written.

### Cross-file conflict: Node version
The three sources give three different answers:

| Source | Says |
|---|---|
| `CLAUDE.md:4` | Node 20 |
| `frontend/CLAUDE.md:3` | Node 18+ |
| `frontend/package.json:4` | `"node": ">=22"` ✅ (the actual requirement) |

Both CLAUDE.md files are wrong. Node 20 and Node 18 would both fail the `engines` check.

---

#### 1. `./CLAUDE.md` (project root)
**Score: 55/100 (C)**

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 5/20 | None. It could point to the per-package files. |
| Architecture clarity | 14/20 | The monorepo split and API port `:8080` are correct (`main.go:10`). |
| Non-obvious patterns | 5/15 | None |
| Conciseness | 15/15 | Tight |
| Currency | 6/15 | Node 20 is wrong (needs ≥22) |
| Actionability | 10/15 | The link to `.docs/ARCHITECTURE.md` works, but that file is only 2 lines and adds nothing. |

**Issues:**
- `Use Node 20`: wrong. `package.json` requires `>=22`.
- The linked architecture doc only restates the line above it ("Go API + SvelteKit frontend").

---

#### 2. `backend/CLAUDE.md`
**Score: 35/100 (D)**

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 16/20 | `make run`, `make test` and `make db-reset` all exist (db-reset comes via `include mk/db.mk`). |
| Architecture clarity | 4/20 | The package path and constructor name are both wrong. |
| Non-obvious patterns | 5/15 | It tries to document a validation convention, but the details are wrong. |
| Conciseness | 13/15 | Good |
| Currency | 0/15 | Four stale facts (below) |
| Actionability | 2/15 | Following it would produce code that doesn't compile and a misconfigured env. |

**Issues (each checked against the code):**
1. **Wrong env var (high impact).** Line 19 says `DB_URL`, but `main.go:9` reads `DATABASE_URL` and `mk/db.mk:4` uses `$$DATABASE_URL`. Anyone who sets `DB_URL` ends up with an empty connection string, and `make db-reset` runs `psql ""`.
2. **Wrong validation path.** Line 14 says `internal/validate/`, but the actual location is `internal/core/validation/rules/` (`note.go`, `MaxBodyLen`).
3. **Wrong constructor name.** Line 17 says `postgres.NewNoteRepo()`, but the actual function is `NewNoteRepository()` (`note_repository.go:5`). Code written from the doc won't compile.
4. **"Injected in `main.go`" is false.** `main.go` never imports or builds a repository.
5. **"Every handler calls into the shared rules package" can't be verified.** There are no handlers; `ListenAndServe` gets a `nil` mux. It may describe intended design, but right now it tells Claude to rely on validation that doesn't exist.

**Missing:**
- `make db-reset` needs `psql` on PATH and `DATABASE_URL` set, and it's destructive: it drops the `notes` table.
- Go 1.25 (from `go.mod`).

---

#### 3. `frontend/CLAUDE.md`
**Score: 45/100 (D)**

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 10/20 | One of the three commands is broken. |
| Architecture clarity | 8/20 | The proxy is mentioned, but with the wrong port. |
| Non-obvious patterns | 8/15 | The `/api` proxy is a good thing to document. |
| Conciseness | 15/15 | Tight |
| Currency | 0/15 | Node version, script name and port are all wrong. |
| Actionability | 4/15 | Copy-pasting the commands fails. |

**Issues:**
1. **`pnpm run check` doesn't exist.** The script is `typecheck` (`package.json:7`), so the command errors out.
2. **Wrong proxy port, and the file contradicts itself.** Line 11 says port 3000, but `vite.config.ts:6` proxies to `localhost:8080`, which matches the backend. Line 11 also cites `vite.config.ts` as its source, which disproves it.
3. **`Requires Node 18+` is wrong.** The requirement is `>=22`.
4. **`pnpm run test:e2e` runs nothing.** `playwright.config.ts` sets `testDir: 'tests/e2e'`, and that directory doesn't exist.

---

### Codebase issues found along the way (not CLAUDE.md problems)
- `frontend/package.json` declares no dependencies (no `vite`, `@sveltejs/kit`, `svelte-check` or `@playwright/test`), and `pnpm-lock.yaml` is basically empty. A fresh `pnpm install` won't make any script runnable.
- The backend's `DATABASE_URL` is read into `_` and dropped. Nothing connects to a database.
- There are no HTTP routes, so the frontend's `/api` proxy has nothing to reach.

### Proposed updates

**`./CLAUDE.md`**
```diff
- Use Node 20 for the frontend.
+ Frontend requires Node >=22 (`frontend/package.json` engines).
```
I'd also suggest removing the `.docs/ARCHITECTURE.md` link, or filling that doc out.

**`backend/CLAUDE.md`**
```diff
- make db-reset  # wipe and recreate the local DB
+ make db-reset  # DESTRUCTIVE: drops/recreates `notes`; needs psql + DATABASE_URL
...
- rules package under `internal/validate/` before touching a repository, so
+ rules package under `internal/core/validation/rules/` before touching a repository, so
  don't re-check lengths in handlers.
- Repositories are built with `postgres.NewNoteRepo()` and injected in `main.go`.
+ Repositories are built with `postgres.NewNoteRepository()` (not yet wired into `main.go`).
- The server reads its connection string from `DB_URL`.
+ The server reads its connection string from `DATABASE_URL`.
```
The handler/validation convention describes code that doesn't exist yet. Should it stay as the intended convention, or be marked as not yet implemented?

**`frontend/CLAUDE.md`**
```diff
- Requires Node 18+.
+ Requires Node >=22.
...
- pnpm run check     # type-check
+ pnpm run typecheck # svelte-check
- pnpm run test:e2e  # Playwright
+ pnpm run test:e2e  # Playwright; specs go in tests/e2e/ (none exist yet)
...
- The dev proxy forwards `/api` to the API on port 3000 (see `vite.config.ts`).
+ The dev proxy forwards `/api` to the backend on port 8080 (see `vite.config.ts`).
```

Should I apply these edits? I've only changed what's wrong or missing and kept each file's structure. I haven't touched anything yet.
