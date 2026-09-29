## CLAUDE.md Quality Report

### Summary
- Files found: 3 (`./CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`), plus `.docs/ARCHITECTURE.md`, which the root file links to.
- Average score: about 48/100.
- Files needing update: 3 of 3. Every file contains at least one claim the code contradicts.

I checked each claim against the code. Most were wrong.

### Claims that don't match the code

| File | Claim | Reality |
|---|---|---|
| `backend/CLAUDE.md:13-15` | Validation lives in `internal/validate/` and every handler calls it. | That directory doesn't exist. The rules are at `internal/core/validation/rules/note.go` (`MaxBodyLen = 10_000`). There are also no handlers in the repo, so "every handler calls it" can't be verified. |
| `backend/CLAUDE.md:17` | Build repositories with `postgres.NewNoteRepo()`, injected in `main.go`. | The constructor is `NewNoteRepository()` in `internal/adapters/postgres/note_repository.go`. `main.go` doesn't construct or inject any repository. |
| `backend/CLAUDE.md:19` | The server reads `DB_URL`. | `main.go:9` reads `DATABASE_URL`, and `mk/db.mk` uses `$$DATABASE_URL` too. Anyone following the doc would set the wrong variable. |
| `frontend/CLAUDE.md:11` | The dev proxy forwards `/api` to port 3000. | `vite.config.ts:6` proxies to `http://localhost:8080`. The file's own line 6 and the root file both imply the backend port, so the file contradicts itself. |
| `frontend/CLAUDE.md:8` | `pnpm run check` runs the type-check. | `package.json` has no `check` script. The script is `typecheck`, so the documented command fails. |
| `frontend/CLAUDE.md:3` | Requires Node 18+. | `package.json` `engines` says `>=22`. |
| `CLAUDE.md:4` | Use Node 20 for the frontend. | This conflicts with both `engines` (`>=22`) and the frontend file (18+). Three files give three different Node versions, and Node 20 fails the `engines` check. |
| `CLAUDE.md:6` | See `.docs/ARCHITECTURE.md`. | The link resolves, but the file is only "Go API + SvelteKit frontend." It adds no architecture information. |

### File-by-file assessment

#### 1. `./CLAUDE.md` (project root)
**Score: 35/100 (Grade D)**

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 3/20 | None. There is no way to start both halves together. |
| Architecture clarity | 6/20 | The `backend/` and `frontend/` split and port 8080 are correct. The linked doc is empty. |
| Non-obvious patterns | 3/15 | None. |
| Conciseness | 13/15 | Short. |
| Currency | 4/15 | The Node version is wrong. |
| Actionability | 6/15 | Only the Node instruction is actionable, and it's incorrect. |

**Issues:** the Node 20 line is wrong and contradicts the other files. The architecture link points to a stub.

#### 2. `./backend/CLAUDE.md`
**Score: 45/100 (Grade D)**

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 16/20 | `make run`, `make test` and `make db-reset` all exist. `db-reset` is defined in the included `mk/db.mk`. |
| Architecture clarity | 5/20 | The validation path and constructor name are wrong. |
| Non-obvious patterns | 4/15 | The "don't re-check lengths in handlers" advice is a good idea but points at a nonexistent path. |
| Conciseness | 12/15 | Tight. |
| Currency | 2/15 | Three of the four factual claims are wrong. |
| Actionability | 6/15 | Commands work. The wrong env var and wrong names would mislead. |

**Issues:** wrong validation path, wrong constructor name, wrong env var, and a claim about `main.go` wiring that the code doesn't support. `db-reset` also drops the `notes` table with no warning, and it needs `psql` and `DATABASE_URL` set. The file mentions neither.

**Recommended additions:** the Go version (`go 1.25`), that `make` targets run from `backend/`, and the `DATABASE_URL` prerequisite for `db-reset`.

#### 3. `./frontend/CLAUDE.md`
**Score: 50/100 (Grade C)**

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 10/20 | `dev` and `test:e2e` are valid. `check` doesn't exist. |
| Architecture clarity | 6/20 | Only the proxy is described, and its port is wrong. |
| Non-obvious patterns | 8/15 | The proxy note is useful, but the port is wrong. |
| Conciseness | 13/15 | Good. |
| Currency | 5/15 | The Node version, script name and port are all wrong. |
| Actionability | 8/15 | Copy-pasting `pnpm run check` fails. |

**Issues:** the three wrong facts above.

**Recommended additions:** that Playwright tests live in `tests/e2e` (per `playwright.config.ts`), and that the proxy target must match the backend port.

### Proposed fixes
These are all one-line corrections. I haven't applied any of them.

- `CLAUDE.md`: change "Node 20" to "Node 22+" (or delete the line, since the frontend file covers it).
- `frontend/CLAUDE.md`:
  - Change "Node 18+" to "Node 22+".
  - Change `pnpm run check` to `pnpm run typecheck`.
  - Change port 3000 to 8080.
- `backend/CLAUDE.md`:
  - Change `DB_URL` to `DATABASE_URL`.
  - Change `postgres.NewNoteRepo()` to `postgres.NewNoteRepository()`.
  - Change `internal/validate/` to `internal/core/validation/rules/`.
  - Drop the "injected in `main.go`" and "every handler" claims until handlers and wiring exist.
- `.docs/ARCHITECTURE.md`: flesh it out or remove the link. It currently gives readers nothing.

The main structural risk is that the Node version and backend port are stated in several places. Consider stating each once, in the file closest to the source (`package.json` and `vite.config.ts`), and pointing to it from the others.

Do you want me to apply these fixes?
