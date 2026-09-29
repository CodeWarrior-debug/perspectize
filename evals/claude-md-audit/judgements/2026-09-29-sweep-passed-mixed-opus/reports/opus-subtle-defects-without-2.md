# CLAUDE.md audit: 3 files, 9 findings

I checked all three CLAUDE.md files (root, `backend/`, `frontend/`) line by line against the code. 7 of the 9 findings are statements that are wrong. They're worse than style problems because an agent that follows these files will run commands that fail, set the wrong env var, or look in paths that don't exist.

## Summary

| File | Grade | Wrong claims | Accurate claims |
|---|---|---|---|
| `CLAUDE.md` (root) | C | 1 | 3 |
| `backend/CLAUDE.md` | D | 4 | 3 |
| `frontend/CLAUDE.md` | D | 3 | 2 |

## Wrong claims (fix these first)

### Backend

1. **Wrong env var name.** The file says the server reads `DB_URL` (`backend/CLAUDE.md:19`), but the code uses `DATABASE_URL`: `backend/cmd/server/main.go:9` and `backend/mk/db.mk:4`. Setting `DB_URL` does nothing, and `make db-reset` would run `psql ""`.
2. **Wrong constructor name.** The file says `postgres.NewNoteRepo()` (`backend/CLAUDE.md:17`), but the function is `NewNoteRepository()` (`backend/internal/adapters/postgres/note_repository.go:5`). The type is `NoteRepository`.
3. **Nothing is injected in `main.go`.** The same line says repositories are "injected in `main.go`", but `main.go` never builds a repository. It only reads the env var and starts listening.
4. **Wrong validation path.** The file points to `internal/validate/` (`backend/CLAUDE.md:14`), which doesn't exist. The package is at `internal/core/validation/rules/`.
5. **The validation rule describes code that doesn't exist.** The file says "every handler calls into the shared rules package… don't re-check lengths in handlers." There are no handlers, and nothing imports `rules`. `MaxBodyLen` is defined and never used. This one matters because it tells the agent *not* to validate, based on a guarantee the code doesn't provide. Either reword it as a goal ("handlers must call `rules`…") or drop it until the code enforces it.

### Frontend

6. **Wrong proxy port.** The file says `/api` goes to port 3000 (`frontend/CLAUDE.md:11`), but `vite.config.ts:6` proxies to `http://localhost:8080`. The file even says "see `vite.config.ts`", and that file contradicts it. The root CLAUDE.md correctly says `:8080`.
7. **`pnpm run check` doesn't exist.** The script in `package.json:7` is called `typecheck`, so `pnpm run check` fails.

### Node version (three different answers)

8. `frontend/CLAUDE.md:3` says "Node 18+", root `CLAUDE.md:4` says "Node 20", and `package.json:4` requires `"node": ">=22"`. Both docs are wrong. Say Node 22+ in one place only, preferably the root file, and remove the other mention.

## Smaller issues

9. **The e2e test command has no tests.** `pnpm run test:e2e` is a real script, but `playwright.config.ts` points at `tests/e2e`, and that directory doesn't exist. Either note that there are no e2e tests yet, or add the directory.
- **The architecture link adds little.** The root file links `.docs/ARCHITECTURE.md` (the link works), but that file is two lines long and repeats what the root file already says. Either expand it (layout, how requests flow through adapters/core) or remove the link.
- **Missing information an agent would need:**
  - how to get a local Postgres
  - that `make db-reset` needs `psql` and `DATABASE_URL`, and that it is destructive (it runs `DROP TABLE notes`)
  - the Go version (1.25, from `go.mod`)
  - that `pnpm` is the package manager, which only shows up in the frontend command examples

## Verified correct

- `make run`, `make test` and `make db-reset` all exist. `db-reset` comes from `mk/db.mk` through `include`, and it does wipe and recreate the table as described.
- The API port `:8080` in the root file matches `main.go`.
- `pnpm run dev` and `pnpm run test:e2e` are real scripts, and the lockfile confirms pnpm.
- The `/api` proxy does exist; only its port is wrong in the doc.

## Suggested fixes (a few minutes of work)

- **`backend/CLAUDE.md`:** change `DB_URL` to `DATABASE_URL`, `NewNoteRepo` to `NewNoteRepository`, and `internal/validate/` to `internal/core/validation/rules/`. Remove the injection claim and reword the validation rule so it doesn't claim coverage that isn't there. Add the warning that `db-reset` is destructive.
- **`frontend/CLAUDE.md`:** change 3000 to 8080 and `check` to `typecheck`. Remove the Node line.
- **Root `CLAUDE.md`:** change to Node 22+ and add Go 1.25 and pnpm.

Want me to apply these edits?
