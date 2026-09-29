I read all three CLAUDE.md files and checked each claim against the code. There are 7 factual errors, and some files contradict each other. The commands in `backend/CLAUDE.md` are the only part that's fully right. I haven't run any commands (no builds, no tests), so this is from reading the files only.

## Summary

| File | Accuracy | Main problems |
|---|---|---|
| `CLAUDE.md` (root) | Partly wrong | Node version is wrong; the architecture link leads to a nearly empty file |
| `backend/CLAUDE.md` | Commands right, conventions wrong | Wrong package path, wrong constructor name, wrong environment variable, validation claim not supported by the code |
| `frontend/CLAUDE.md` | Mostly wrong | Wrong Node version, wrong script name, wrong proxy port |

## Factual errors (fix these first)

1. **The proxy port is wrong.** `frontend/CLAUDE.md:11` says `/api` is forwarded to port 3000. `frontend/vite.config.ts:6` forwards it to `http://localhost:8080`, which matches `backend/cmd/server/main.go:10` and the root CLAUDE.md.

2. **`pnpm run check` doesn't exist.** `frontend/CLAUDE.md:7` lists it, but in `frontend/package.json:7` the type-check script is called `typecheck`.

3. **The three Node versions conflict.**
   - Root `CLAUDE.md:4` says to use Node 20.
   - `frontend/CLAUDE.md:3` says Node 18+.
   - `frontend/package.json:4` requires `>=22`.

   Both CLAUDE.md files are wrong, and following either one gives you an unsupported Node version. Both should say 22+, or just point to `engines`.

4. **The database environment variable is wrong.** `backend/CLAUDE.md:19` says `DB_URL`. `main.go:9` and `mk/db.mk:4` both use `DATABASE_URL`. Anyone who sets `DB_URL` will find that `make db-reset` fails (and that the server ignores it).

5. **The repository constructor name is wrong.** `backend/CLAUDE.md:17` says `postgres.NewNoteRepo()`. The real function is `NewNoteRepository()` (`internal/adapters/postgres/note_repository.go:5`).

6. **The repository isn't injected in `main.go`.** The same line says it is, but `main.go` never builds or uses a repository. It reads `DATABASE_URL`, discards the value, and starts a server with no routes registered.

7. **The validation package path is wrong.** `backend/CLAUDE.md:14` points to `internal/validate/`. The rules actually live in `internal/core/validation/rules/`, which contains only `MaxBodyLen`.

## Claims the code doesn't support

- **"Every handler calls into the shared rules package… so don't re-check lengths in handlers."** No handlers exist, and nothing imports the `rules` package. This describes how things should work, not how they do. It's also risky: it tells Claude to *skip* length checks, and nothing enforces them anywhere. I'd say "validation rules live in X; handlers must call them" or remove the claim until the code exists.
- **`pnpm run test:e2e`** is the correct script name, but `playwright.config.ts` sets `testDir: 'tests/e2e'` and that folder doesn't exist. As far as I can see, the command would find no tests.

## What's correct

- The `make run`, `make test` and `make db-reset` targets all exist and do what `backend/CLAUDE.md` says.
- The Go API does listen on :8080.
- pnpm is the right package manager (there's a `pnpm-lock.yaml`).
- The overall monorepo layout described in the root file is right.

## Gaps and style

- **`.docs/ARCHITECTURE.md` is just two lines** ("Go API + SvelteKit frontend"). The root file's link adds nothing. Either fill it in (the layout under `internal/adapters` and `internal/core`, how requests flow) or drop the link.
- **The root file has no quick-start.** It should say how to run both parts together: set `DATABASE_URL`, run `make db-reset`, run `make run`, then `pnpm dev`.
- **`backend/CLAUDE.md` doesn't say `make db-reset` needs `psql` and `DATABASE_URL`.** Right now it points you at the wrong variable.
- **Values are copied into the docs, and the copies have drifted.** The port, script names and Node version are all written down separately from where they're defined. Fewer hard-coded copies means less to go stale; for example, "see `engines` in package.json" instead of a version number.
- The length and tone of all three files are fine: short and specific. The problem is accuracy, not style.

## Not checked

I couldn't read `.claude/` (settings, hooks, skills, commands) because the sandbox blocked access. If those contain instructions for Claude, they need a separate review.

## Suggested fixes

- **`frontend/CLAUDE.md`:**
  - Change "Node 18+" to "Node 22+".
  - Change `check` to `typecheck`.
  - Change port 3000 to 8080.
  - Note that the `tests/e2e` folder doesn't exist yet.
- **`backend/CLAUDE.md`:**
  - Change `internal/validate/` to `internal/core/validation/rules/`.
  - Change `NewNoteRepo` to `NewNoteRepository`.
  - Change `DB_URL` to `DATABASE_URL`.
  - Reword the validation and dependency-injection lines so they don't claim things the code doesn't do.
- **Root `CLAUDE.md`:**
  - Change Node 20 to 22+.
  - Add a quick-start.
  - Fill in or remove the architecture link.

I can make these edits if you want.
