## CLAUDE.md Quality Report

### Summary
- Files found: 3 (`./CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`)
- Average score: about 41/100
- Files needing update: 3
- Most serious problem: `backend/CLAUDE.md` tells you to run `make migrate-up` as first-time setup. The root `CLAUDE.md` forbids that command because it hits the shared staging database.

### 1. `./CLAUDE.md` (root): **62/100 (C)**

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 8/20 | No commands. It only points to the subdirectory files. |
| Architecture clarity | 8/20 | One-line monorepo summary, plus a link to a 2-line ARCHITECTURE.md. |
| Non-obvious patterns | 13/15 | The migration rule is valuable and correct: `migrate-up` uses `$DATABASE_URL`. |
| Conciseness | 14/15 | Tight. |
| Currency | 8/15 | One broken link (below). |
| Actionability | 11/15 | The rules are clear. I couldn't check the commit convention. |

**Issues:**
- `.docs/DEPLOYMENT.md` is linked but doesn't exist. Only `.docs/ARCHITECTURE.md` does.
- It says `DATABASE_URL` points at shared staging, but nothing in the repo defines it. There is no `.env` or `.env.example`, so I couldn't verify that or tell you how to set it to something safe.
- It doesn't tell you what to do instead of `migrate-up`, for example how to get a local database.

### 2. `backend/CLAUDE.md`: **28/100 (F)**

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 5/20 | 2 of 4 commands are broken or dangerous. |
| Architecture clarity | 7/20 | One of three listed paths doesn't exist. |
| Non-obvious patterns | 2/15 | Nothing about hexagonal layout or the migrations tool. |
| Conciseness | 10/15 | Short. |
| Currency | 1/15 | Wrong Go version, a missing target, and a missing directory. |
| Actionability | 3/15 | Following it would cause harm. |

**Issues:**
- **Contradiction with root rule:** line 14 says `make migrate-up   # first-time setup: apply migrations to your DB`. The root file says never to run it, because it writes to shared staging. This is the most dangerous item.
- **`make seed` doesn't exist.** The Makefile only has `run`, `test`, `lint` and `migrate-up`.
- **Wrong Go version:** it says "Go 1.21", but `go.mod` says `go 1.25`.
- **`internal/handlers/` doesn't exist.** The only internal package is `internal/core/services/`. The "one file per resource" claim can't be verified.
- `make lint` exists (`golangci-lint`) but isn't documented.
- The `migrate` CLI (golang-migrate) and `golangci-lint` are required tools, and neither is mentioned.
- It doesn't mention the hexagonal architecture, which `.docs/ARCHITECTURE.md` says the backend uses. `internal/core/` fits that, but there are no ports or adapters yet.

### 3. `frontend/CLAUDE.md`: **34/100 (D)**

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 8/20 | One of two commands is wrong. |
| Architecture clarity | 3/20 | None. |
| Non-obvious patterns | 5/15 | "Svelte 5 runes only" is useful if true, but I couldn't confirm it. |
| Conciseness | 13/15 | Short. |
| Currency | 3/15 | Wrong script name. |
| Actionability | 2/15 | The test command fails. |

**Issues:**
- **`pnpm run test:unit` doesn't exist.** The script is `test:run` (`vitest run`).
- **`build` script is missing** from the docs.
- **pnpm is unverified.** There is no lockfile and no `packageManager` field, so I can't confirm pnpm is the right tool.
- **"Svelte 5 runes only" can't be checked.** `package.json` has no `svelte`, `@sveltejs/kit` or `vitest` dependencies, and the only page is plain HTML. If the rule is real, the dependencies are missing. If not, the note is aspirational.
- `http://localhost:5173` is Vite's default port. That's plausible, but nothing in the repo sets it.

### Repo-wide observations
- `backend/cmd/server/main.go` is an empty `main`, so `make run` "server on :8080" can't be verified. No port is configured anywhere.
- The code is mostly stubs. Some claims may be aspirational rather than stale, so check them with the team.

### Proposed fixes (not applied)

**`./CLAUDE.md`**
```diff
 - [Architecture](.docs/ARCHITECTURE.md)
-- [Deployment](.docs/DEPLOYMENT.md)
```
(Or create `DEPLOYMENT.md`. Which one is up to you.)

**`backend/CLAUDE.md`**
```diff
-Go 1.21 HTTP API.
+Go 1.25 HTTP API.
 ## Layout
 - `cmd/server/` — entry point
-- `internal/handlers/` — HTTP handlers, one file per resource
 - `internal/core/services/` — business logic
+- `migrations/` — golang-migrate SQL files
 ## Commands
-make migrate-up   # first-time setup: apply migrations to your DB
-make seed         # load sample notes
 make run          # server on :8080
 make test         # all tests
+make lint         # golangci-lint
+# DO NOT run `make migrate-up` locally: DATABASE_URL is shared staging (see root CLAUDE.md)
```

**`frontend/CLAUDE.md`**
```diff
-pnpm run test:unit  # run unit tests once
+pnpm run test:run   # vitest, run once
+pnpm run build      # vite build
```

### Questions before I apply
1. Should I remove the `handlers/` and `make seed` lines, or do you plan to add them?
2. Is `:8080` the right port, and is pnpm the right package manager? Neither is verifiable from the repo.
3. Should I drop or create `DEPLOYMENT.md`?
4. Is the Svelte 5 runes rule real? If so, the dependencies are missing from `package.json`.

Want me to apply the diffs above once you've answered?
