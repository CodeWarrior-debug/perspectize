# CLAUDE.md quality report

I audited the three CLAUDE.md files (root, `backend/`, `frontend/`) and `.docs/ARCHITECTURE.md` against the code. **Nearly every checkable claim is wrong or stale.** The files are short and cleanly written, but I found 8 factual errors and would not trust them as they stand.

## Factual errors

| # | File | Claim | Reality |
|---|---|---|---|
| 1 | `backend/CLAUDE.md` | Server reads its connection string from `DB_URL` | `cmd/server/main.go` reads `DATABASE_URL`. `mk/db.mk` also uses `DATABASE_URL`. |
| 2 | `backend/CLAUDE.md` | Validation rules live under `internal/validate/` | That path doesn't exist. The rules are in `internal/core/validation/rules/note.go`. |
| 3 | `backend/CLAUDE.md` | Repositories are built with `postgres.NewNoteRepo()` | The constructor is `NewNoteRepository()` in `internal/adapters/postgres/note_repository.go`. |
| 4 | `backend/CLAUDE.md` | Repositories are injected in `main.go` | `main.go` builds no repositories. It only reads an env var and calls `ListenAndServe`. |
| 5 | `backend/CLAUDE.md` | Every handler calls the shared rules before touching a repository | No handlers exist in the repo, so this can't be verified. |
| 6 | `frontend/CLAUDE.md` | Requires Node 18+ | `package.json` sets `engines.node >=22`. |
| 7 | `CLAUDE.md` (root) | Use Node 20 for the frontend | This contradicts `engines` (>=22), and it also contradicts the frontend file's "18+". The three files give three different Node versions. |
| 8 | `frontend/CLAUDE.md` | `pnpm run check` type-checks | No `check` script exists. The script is `typecheck` (`svelte-check`). |
| 9 | `frontend/CLAUDE.md` | Dev proxy forwards `/api` to port 3000 | `vite.config.ts` proxies to `http://localhost:8080`. This also contradicts the root file, which says the API is on :8080. |

## What checks out
- The root file's claim that the Go API runs on :8080 matches `main.go`.
- `make run`, `make test` and `make db-reset` all exist and work as described. `db-reset` runs `scripts/reset.sql`, which drops and recreates `notes`, so "wipe and recreate" is accurate.
- `pnpm run dev` and `pnpm run test:e2e` exist. The e2e config points at `tests/e2e`, which isn't in the repo, so I couldn't confirm the tests run.
- The link to `.docs/ARCHITECTURE.md` resolves.

## Gaps and style issues
- **`.docs/ARCHITECTURE.md` is a stub.** It has one line ("Go API + SvelteKit frontend") and adds nothing to the root file, which links to it as the architecture reference.
- **Missing prerequisites.** Nothing mentions Go 1.25 (from `go.mod`) or that `db-reset` needs `psql` and `DATABASE_URL` set. Nothing says how to install frontend dependencies (`pnpm install`).
- **Missing layout description.** The hexagonal structure (`adapters/`, `core/`) is not described. This is the most useful thing a new contributor or agent would need.
- **Unverifiable "rule" wording.** The "don't re-check lengths in handlers" instruction is worded as a rule, but it rests on a validation path that doesn't exist. An agent would go looking in the wrong place. The only real rule I found is `MaxBodyLen = 10_000`.
- **Style is fine.** The files are concise, use command blocks and are well organised. The problem is accuracy, not structure.

## Recommended fixes (priority order)
1. Change `DB_URL` to `DATABASE_URL` in `backend/CLAUDE.md`.
2. Fix the validation path to `internal/core/validation/rules/`, and the constructor to `NewNoteRepository()`. Drop or verify the claims about `main.go` injection and handler behaviour.
3. Use a single Node requirement (`>=22`) in both the root and frontend files.
4. Change the type-check command to `pnpm run typecheck`, or add a `check` script.
5. Change the proxy port in `frontend/CLAUDE.md` to 8080.
6. Expand `ARCHITECTURE.md` or remove the link.

I haven't changed any files. I can apply fixes 1–5 now if you want.
