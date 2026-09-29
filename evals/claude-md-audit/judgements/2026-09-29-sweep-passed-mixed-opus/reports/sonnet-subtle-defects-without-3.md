# CLAUDE.md quality report

There are three files: `CLAUDE.md`, `backend/CLAUDE.md` and `frontend/CLAUDE.md`. I checked each claim against the code. Six claims are wrong, and one more can't be checked.

## Wrong claims

| # | File | Claim | Reality |
|---|------|-------|---------|
| 1 | `CLAUDE.md:4` | "Use Node 20" | `frontend/package.json` has `engines.node: ">=22"`. |
| 2 | `frontend/CLAUDE.md:3` | "Requires Node 18+" | This contradicts `package.json` (>=22) and the root file (20). The three files give three different Node versions. |
| 3 | `frontend/CLAUDE.md:8` | `pnpm run check` runs the type-check | No `check` script exists. The script is `typecheck` (`svelte-check`), so the command fails. |
| 4 | `frontend/CLAUDE.md:11` | The dev proxy forwards `/api` to port 3000 | `vite.config.ts:6` proxies to `http://localhost:8080`. The port is also wrong relative to the root file, which says the API is on :8080. |
| 5 | `backend/CLAUDE.md:13-15` | Validation lives under `internal/validate/` | The rules are in `internal/core/validation/rules/`, and `internal/validate/` doesn't exist. Claude would look in the wrong place. |
| 6 | `backend/CLAUDE.md:17` | Repositories are built with `postgres.NewNoteRepo()` | The constructor is `postgres.NewNoteRepository()` (`internal/adapters/postgres/note_repository.go:5`). |
| 7 | `backend/CLAUDE.md:19` | The server reads its connection string from `DB_URL` | `main.go:9` reads `DATABASE_URL`, and `mk/db.mk` uses it too. |

## Claims I couldn't confirm

- **Handlers and `main.go` injection** (`backend/CLAUDE.md:13-17`): `main.go` has no handlers, no repository wiring and no calls into the rules package. The only validation rule is `MaxBodyLen`. The "every handler calls the shared rules" convention is therefore aspirational, and "injected in `main.go`" isn't true of the current code. If this is a skeleton, say so. If it isn't, the docs describe code that doesn't exist.

## Accurate

- `make run`, `make test` and `make db-reset` all exist. `db-reset` is defined in `mk/db.mk`, which the Makefile includes.
- `pnpm run dev` and `pnpm run test:e2e` both exist.
- The API port of :8080 in the root file matches `main.go`.
- The `.docs/ARCHITECTURE.md` link resolves.

## Gaps and style

- **`.docs/ARCHITECTURE.md` is a one-line stub.** The root file points to it as the architecture reference, but it says nothing beyond "Go API + SvelteKit frontend". The hexagonal layout (`adapters/`, `core/`) is only visible in the tree.
- **`playwright.config.ts` points at `tests/e2e`, which doesn't exist.** `pnpm run test:e2e` will find no tests. Neither the docs nor the repo mention this.
- **Missing prerequisites:**
  - Go 1.25, from `go.mod`.
  - `psql` and a running Postgres.
  - That `DATABASE_URL` must be set before `run` or `db-reset`.
  - That `db-reset` drops the `notes` table.
- **`backend/CLAUDE.md` has no `frontend/`-style pointer to the port or the API base path.** The `/api` prefix is only implied by the frontend proxy.
- **Style:** the files are short and well organised. The problem is accuracy, not format.

## Suggested fixes

1. Pick one Node version. `package.json` says >=22, so update both docs to match, or change `engines`.
2. In `frontend/CLAUDE.md`, change `pnpm run check` to `pnpm run typecheck`, or add a `check` script. Change the proxy port to 8080.
3. In `backend/CLAUDE.md`, change the validation path to `internal/core/validation/rules/`, the constructor to `NewNoteRepository()`, and `DB_URL` to `DATABASE_URL`.
4. Decide whether the handler and `main.go` wiring convention describes current code or a plan, and reword it to match.
5. Flesh out `ARCHITECTURE.md`, or drop the link.

I haven't changed anything. I can apply fixes 1–3 now, since they're unambiguous. Fix 1 needs your call on whether to change the docs or `engines`.
