## CLAUDE.md Quality Report

### Summary
- Files found: 3 (`./CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`)
- Average score: about 45/100
- Files needing update: 3. Two of them contain claims the code contradicts.

The files are short and readable, but most of the concrete facts in them are wrong. Style is fine. Currency is the main problem.

### 1. `./CLAUDE.md` (root): 55/100 (C)

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 4/20 | None. It doesn't point to the per-package files. |
| Architecture clarity | 8/20 | Backend and frontend are named, but `.docs/ARCHITECTURE.md` is a single line ("Go API + SvelteKit frontend"), so the link adds nothing. |
| Non-obvious patterns | 5/15 | None. |
| Conciseness | 15/15 | |
| Currency | 6/15 | Node version is wrong (see below). |
| Actionability | 8/15 | |

**Issues:**
- **Wrong Node version.** Line 4 says "Use Node 20", but `frontend/package.json` has `engines.node: ">=22"`. Node 20 fails the engines check.
- **Three files, three Node versions.** The root says 20, `frontend/CLAUDE.md` says 18+, and `package.json` says >=22.
- The `:8080` claim is correct (`main.go:11`).

### 2. `backend/CLAUDE.md`: 45/100 (D)

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 14/20 | All three make targets exist. |
| Architecture clarity | 5/20 | |
| Non-obvious patterns | 3/15 | |
| Conciseness | 13/15 | |
| Currency | 3/15 | Three of four claims are wrong. |
| Actionability | 7/15 | |

**Issues:**
- **Wrong env var.** The file says the server reads `DB_URL`. `main.go:9` reads `DATABASE_URL`, and `mk/db.mk` uses `$$DATABASE_URL` too. Anyone setting `DB_URL` would get a silent failure.
- **Wrong validation path.** The file says validation lives in `internal/validate/`. That directory doesn't exist. The rules are in `internal/core/validation/rules/note.go`, which currently holds only `MaxBodyLen = 10_000`.
- **Unsupported validation claim.** The file says every handler calls into the shared rules package. There are no handlers in the repo, and nothing imports the rules package.
- **Wrong constructor name.** The file says `postgres.NewNoteRepo()`. The real function is `NewNoteRepository()` in `internal/adapters/postgres/note_repository.go`.
- **Unsupported wiring claim.** The file says repositories are injected in `main.go`. `main.go` doesn't reference the repository.
- **Missing prerequisites.** `make db-reset` needs `psql` and a running Postgres, and neither is mentioned. The schema is a single `notes` table created by `scripts/reset.sql`.
- **Misleading description.** `db-reset` is described as "wipe and recreate the local DB". It actually drops and recreates only the `notes` table. It also runs against whatever `DATABASE_URL` points at, so it would hit a non-local database if that is what's set.
- The Go version (1.25) isn't mentioned.

### 3. `frontend/CLAUDE.md`: 40/100 (D)

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 8/20 | One of three commands is broken. |
| Architecture clarity | 4/20 | |
| Non-obvious patterns | 5/15 | The proxy note is useful, but its port is wrong. |
| Conciseness | 14/15 | |
| Currency | 3/15 | |
| Actionability | 6/15 | |

**Issues:**
- **Broken command.** `pnpm run check` doesn't exist. The script is named `typecheck` (`svelte-check`).
- **Wrong proxy port.** The file says `/api` goes to port 3000. `vite.config.ts` proxies to `http://localhost:8080`, which matches the backend. Port 3000 would send a developer to the wrong place.
- **Wrong Node version.** "Node 18+" contradicts `engines: >=22`.
- **Missing test setup.** `test:e2e` points at `tests/e2e`, which doesn't exist in the repo. Playwright browsers and a running backend aren't mentioned either.
- **Missing scripts.** There is no `build` or `preview` script, and the file doesn't say so.

### Recommended changes

1. **Root:** change "Node 20" to "Node >=22", and remove the Node line from the frontend file so the version is stated once. Add a pointer to the two package files.
2. **Backend:**
   - Change `DB_URL` to `DATABASE_URL`.
   - Fix the validation path to `internal/core/validation/rules/`, or delete the "every handler calls it" claim until handlers exist.
   - Change `NewNoteRepo()` to `NewNoteRepository()`, and drop the `main.go` injection claim unless it is going to be true.
   - Note that `db-reset` needs `psql` and drops only the `notes` table on whatever `DATABASE_URL` targets.
3. **Frontend:**
   - Change `pnpm run check` to `pnpm run typecheck`.
   - Change port 3000 to 8080.
   - Change "Node 18+" to ">=22", or remove the line.
4. **Repo-wide:** either flesh out `.docs/ARCHITECTURE.md` or stop linking it from the root file.

I haven't changed any files. Want me to apply these edits? For the backend validation and constructor claims, I'd need to know whether they describe planned code or code that got renamed. In the first case I'd delete them, and in the second I'd correct them.
