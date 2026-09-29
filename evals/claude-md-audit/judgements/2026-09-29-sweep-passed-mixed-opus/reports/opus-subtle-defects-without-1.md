# CLAUDE.md audit report

There are three CLAUDE.md files: the root one, `backend/CLAUDE.md` and `frontend/CLAUDE.md`. I checked every claim in them against the code. Nine are wrong: six are outright wrong and three contradict each other. Most of the wrong ones would make an agent run a command that fails or edit a path that doesn't exist.

## Summary

| File | Claims checked | Correct | Wrong | Grade |
|---|---|---|---|---|
| `CLAUDE.md` (root) | 3 | 2 | 1 | C |
| `backend/CLAUDE.md` | 7 | 3 | 4 | D |
| `frontend/CLAUDE.md` | 5 | 1 | 4 | F |

## Factual errors (fix these first)

**1. The Node version has three different answers.**
- `CLAUDE.md:4` says "Use Node 20".
- `frontend/CLAUDE.md:3` says "Requires Node 18+".
- The actual requirement is `>=22`, in `frontend/package.json:4`.

Both docs are wrong, and they also disagree with each other.

**2. The dev proxy port is wrong.** `frontend/CLAUDE.md:11` says `/api` is forwarded to port **3000**. `frontend/vite.config.ts:6` forwards it to `localhost:8080`, which matches the Go server (`main.go:10`) and the root CLAUDE.md. The line even says "see `vite.config.ts`", and that file says otherwise.

**3. The type-check script name is wrong.** `frontend/CLAUDE.md:7` uses `pnpm run check`, but the script is called `typecheck` (`package.json:7`). The documented command fails with "missing script".

**4. The database env var is wrong.** `backend/CLAUDE.md:19` says `DB_URL`. Both `cmd/server/main.go:9` and `mk/db.mk:4` read `DATABASE_URL`.

**5. The validation package path is wrong.** `backend/CLAUDE.md:14` points to `internal/validate/`, which doesn't exist. The rules are in `internal/core/validation/rules/` (`note.go`, with `MaxBodyLen`).

**6. The repository constructor name is wrong.** `backend/CLAUDE.md:17` says `postgres.NewNoteRepo()`. The real function is `NewNoteRepository()` (`internal/adapters/postgres/note_repository.go:5`).

## Claims the code doesn't back up

- **"Every handler calls into the shared rules package… don't re-check lengths in handlers"** (`backend/CLAUDE.md:13-15`). There are no handlers. `main.go` passes a `nil` mux to `ListenAndServe` and nothing imports `rules`. This describes a planned design, not what the code does. The "don't re-check" instruction is risky: an agent that follows it would add handlers with no validation at all. Either reword it as a rule for new handlers ("new handlers must validate via `rules`…") or remove it until it's true.
- **"Repositories are… injected in `main.go`"** (`backend/CLAUDE.md:17`). `main.go` doesn't create or inject any repository.
- **`pnpm run test:e2e`** (`frontend/CLAUDE.md:8`). The script exists, but `playwright.config.ts` points at `tests/e2e`, which doesn't exist. `package.json` also has no dependencies (no `vite`, `@sveltejs/kit`, `svelte-check` or `@playwright/test`), and the lockfile is empty. As the repo stands, none of the frontend commands in the doc would run. That's a problem with the repo rather than the doc, but it's worth knowing.

## Verified correct

- The API runs on `:8080` (`CLAUDE.md:3`, `main.go:10`).
- The link to `.docs/ARCHITECTURE.md` works.
- `make run` and `make test` match the `Makefile`.
- `make db-reset` works through `include mk/db.mk`.
- `pnpm run dev` and `test:e2e` match script names in `package.json`.

## Gaps and style

- **`make db-reset` has no warning about its preconditions.** It drops the `notes` table using `psql "$DATABASE_URL"`. If the variable isn't set, psql falls back to the default or `PG*` connection settings, so it could wipe whichever database those point at. The doc should say that `DATABASE_URL` must be set and point at a local database.
- **The architecture doc is only two lines** and adds nothing beyond the root CLAUDE.md. Either expand it (the hexagonal `core/` and `adapters/` layout is worth explaining) or drop the link.
- **The Node version is in two places.** Keep it only in `frontend/CLAUDE.md`, or better, just say "see `engines` in package.json" so it can't drift again.
- **Nothing says how to run everything together**: start the backend, then the frontend, which needs the backend on :8080 for the proxy.
- The length and tone are good: short and command-focused. The problem is accuracy, not bloat.

## Suggested corrected text

**Root `CLAUDE.md`:** change line 4 to "Use Node 22+ for the frontend (see `frontend/package.json` engines)."

**`backend/CLAUDE.md`:**
```markdown
make db-reset  # DROPS and recreates the notes table in $DATABASE_URL — local DB only
...
Validation rules live in `internal/core/validation/rules/`. New handlers must
validate through that package before calling a repository.

Repositories are built with `postgres.NewNoteRepository()`.

The server reads its connection string from `DATABASE_URL`.
```

**`frontend/CLAUDE.md`:**
```markdown
Requires Node 22+.

pnpm run dev        # dev server; /api is proxied to the backend on :8080
pnpm run typecheck  # svelte-check
pnpm run test:e2e   # Playwright (tests/e2e — not yet created)
```

I haven't changed any files. I can apply these fixes if you'd like.
