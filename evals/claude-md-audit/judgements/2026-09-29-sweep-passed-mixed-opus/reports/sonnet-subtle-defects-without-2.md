# CLAUDE.md Quality Report

I checked the three CLAUDE.md files (`CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`) against the code. Seven claims are wrong, and one more can't be verified.

## Incorrect claims

| # | File:line | Claim | Actual |
|---|---|---|---|
| 1 | `backend/CLAUDE.md:14` | Validation rules live under `internal/validate/` | The directory doesn't exist. Rules are in `internal/core/validation/rules/` (`note.go`). |
| 2 | `backend/CLAUDE.md:17` | Repositories are built with `postgres.NewNoteRepo()` | The constructor is `postgres.NewNoteRepository()` (`note_repository.go:5`). |
| 3 | `backend/CLAUDE.md:19` | The server reads its connection string from `DB_URL` | `main.go:9` and `mk/db.mk:4` both use `DATABASE_URL`. Anyone who sets `DB_URL` will get nothing. |
| 4 | `frontend/CLAUDE.md:9` | `pnpm run check` runs the type-check | `package.json` has no `check` script. The script is `typecheck` (`svelte-check`). |
| 5 | `frontend/CLAUDE.md:11` | The dev proxy forwards `/api` to port 3000 | `vite.config.ts:6` proxies to `localhost:8080`. The root CLAUDE.md correctly says 8080, so the files also contradict each other. |
| 6 | `CLAUDE.md:4` and `frontend/CLAUDE.md:3` | Node 20, and Node 18+ | `package.json` `engines` requires `>=22`. Both statements are wrong, and they disagree with each other. Node 20 and 18 would violate the engines constraint. |
| 7 | `backend/CLAUDE.md:13-15` | Every handler calls the shared rules package before touching a repository | There are no handlers in the code. `main.go` calls `ListenAndServe(":8080", nil)` and nothing imports `rules`. The rule is aspirational, not a description of current behavior. |

## Unverifiable or thin

- **`backend/CLAUDE.md:17`**: the claim that repositories are "injected in `main.go`" is false today. `main.go` doesn't construct or reference any repository.
- **`.docs/ARCHITECTURE.md`** is only "Go API + SvelteKit frontend." The root CLAUDE.md links to it as if it were substantive, but it has no content beyond what the root file already says.
- **`frontend/CLAUDE.md:8`**: `test:e2e` is correct. The Playwright config points at `tests/e2e`, which doesn't exist in the repo, so the command will find no tests.

## What's accurate

- Backend `make run`, `make test` and `make db-reset` all exist (`db-reset` is in the included `mk/db.mk`).
- `db-reset` does wipe and recreate the table, as described.
- The Go API listens on `:8080`.
- `pnpm run dev` and `pnpm run test:e2e` exist.

## Style and structure

- The files are short and well organized, with commands grouped separately from conventions.
- `backend/CLAUDE.md` doesn't mention the Go version (`go 1.25`), which is worth stating alongside the Node requirement.
- The root file states the Node version, and so does the frontend file. That duplication is how they drifted apart. It should live in one place.
- Root Go-API and dev-port information is repeated across three files (8080 vs 3000). Pick one source.

## Suggested fixes

1. `backend/CLAUDE.md`: change the path to `internal/core/validation/rules/` and the constructor to `NewNoteRepository()`. Change `DB_URL` to `DATABASE_URL`.
2. `backend/CLAUDE.md`: reword the validation and injection lines to say what's intended versus what exists, or delete them until handlers exist.
3. `frontend/CLAUDE.md`: change `check` to `typecheck` and the port to 8080. Change the Node requirement to 22+.
4. Root `CLAUDE.md`: change Node 20 to 22+, or remove it and leave it to the frontend file.

I haven't changed any files. I can apply these edits if you'd like.
