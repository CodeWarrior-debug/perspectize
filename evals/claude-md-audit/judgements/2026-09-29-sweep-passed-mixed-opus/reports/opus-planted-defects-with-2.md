## CLAUDE.md Quality Report

I checked 3 CLAUDE.md files against every tracked file in the repo (11 in total). The main problem is not style. **Several documented commands and paths don't exist, and two files contradict each other on a safety rule.**

### Summary
- Files found: 3
- Average score: 49/100
- Files needing update: 3 (all)

### 🚨 Critical: the two files disagree about migrations
- `CLAUDE.md:7-8` says: **never** run `make migrate-up` locally, because `DATABASE_URL` points at the shared staging database.
- `backend/CLAUDE.md:14` lists `make migrate-up   # first-time setup: apply migrations to your DB` as the first command to run.

An agent working in `backend/` will load both files, and the backend one presents migrating as routine setup. Following it would apply migrations to shared staging (`Makefile:13` runs `migrate ... -database "$$DATABASE_URL" up`, with no local check). This should be fixed first.

---

### 1. `./CLAUDE.md` (project root) — **58/100 (C)**

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 8/20 | None of its own; it relies on the subdirectory files |
| Architecture clarity | 10/20 | One line on the monorepo layout; the linked architecture doc is 2 lines |
| Non-obvious patterns | 13/15 | The staging database warning is exactly the kind of thing that belongs here |
| Conciseness | 14/15 | Tight |
| Currency | 6/15 | Links to a file that doesn't exist |
| Actionability | 7/15 | Rules are clear, but a subdirectory file contradicts them |

**Issues:**
- `.docs/DEPLOYMENT.md` (line 14) doesn't exist. Only `.docs/ARCHITECTURE.md` is tracked.
- `.docs/ARCHITECTURE.md` just says "Hexagonal backend, SvelteKit frontend." That's too thin to be worth linking.
- The migration rule is undercut by `backend/CLAUDE.md`, as described above.

### 2. `./backend/CLAUDE.md` — **38/100 (D)**

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 8/20 | 2 of 4 commands are wrong or dangerous; `lint` is missing |
| Architecture clarity | 10/20 | 1 of 3 layout entries doesn't exist |
| Non-obvious patterns | 3/15 | Doesn't mention the `migrate` CLI, `DATABASE_URL`, or `golangci-lint` |
| Conciseness | 14/15 | Tight |
| Currency | 2/15 | Wrong Go version, wrong directory, wrong make target |
| Actionability | 1/15 | Following it as written would fail or cause harm |

**Issues (checked against the code):**
- **Wrong Go version:** it says "Go 1.21" (line 3), but `go.mod:3` declares `go 1.25`.
- **Missing directory:** `internal/handlers/` (line 8) doesn't exist. The only thing under `internal/` is `core/services/`.
- **Missing target:** `make seed` (line 15) isn't in the `Makefile`. Its `.PHONY` list is `run test lint migrate-up`.
- **Dangerous instruction:** `make migrate-up` is presented as first-time setup (line 14), which contradicts the root rule.
- **Undocumented target:** `make lint` exists (`Makefile:9-10`, runs `golangci-lint`) but isn't listed.
- **Can't verify:** "server on :8080" — `cmd/server/main.go` is an empty `func main() {}`, so no port is set anywhere yet.

### 3. `./frontend/CLAUDE.md` — **50/100 (C)**

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 8/20 | The test command is wrong; `build` is missing |
| Architecture clarity | 8/20 | No layout; there's only `src/routes/+page.svelte` so far |
| Non-obvious patterns | 10/15 | "Svelte 5 runes only" is a useful rule |
| Conciseness | 15/15 | Tight |
| Currency | 5/15 | The test script name is stale |
| Actionability | 4/15 | Can't run tests as written |

**Issues (checked against the code):**
- **Broken test command:** `pnpm run test:unit` (line 9) doesn't exist. `package.json:7` defines `test:run` (`vitest run`).
- **Missing command:** `build` (`vite build`) is defined but not documented.
- **Can't verify the package manager:** `pnpm` isn't backed by anything in the repo. There's no `pnpm-lock.yaml` and no `packageManager` field.
- **Can't verify "Svelte 5":** `package.json` has no dependencies at all (no svelte, vite, or vitest), so nothing pins the Svelte version.
- `:5173` is Vite's default port, so that part is fine.

---

### Proposed updates

**`backend/CLAUDE.md`** (removes the dangerous instruction and fixes the stale facts):
```diff
-Go 1.21 HTTP API.
+Go 1.25 HTTP API (see go.mod).
 
 ## Layout
 
 - `cmd/server/` — entry point
-- `internal/handlers/` — HTTP handlers, one file per resource
 - `internal/core/services/` — business logic
 
 ## Commands
 
 ```bash
-make migrate-up   # first-time setup: apply migrations to your DB
-make seed         # load sample notes
 make run          # server on :8080
 make test         # all tests
+make lint         # golangci-lint (must be installed)
 ```
+
+**Do not run `make migrate-up`.** `DATABASE_URL` points at shared staging; migrations are applied manually at release (see root CLAUDE.md).
```

**`frontend/CLAUDE.md`:**
```diff
 pnpm run dev        # http://localhost:5173
-pnpm run test:unit  # run unit tests once
+pnpm run build      # production build
+pnpm run test:run   # run unit tests once (vitest)
```

**`./CLAUDE.md`:** either write `.docs/DEPLOYMENT.md` or delete the link on line 14.

### Questions only you can answer
1. **Server port:** is `:8080` the intended port? Nothing in the code sets one yet.
2. **Seeding:** was `make seed` removed on purpose, or is it planned? If there's a safe way to seed a local database, I should document that instead.
3. **Package manager:** is it pnpm? If so, consider committing the lockfile or adding a `packageManager` field so the docs match the repo.
4. **Deployment link:** should I remove it, or is `.docs/DEPLOYMENT.md` coming?

Should I apply the backend and frontend diffs above? Tip: during a Claude session you can press `#` to have Claude add what it learns to CLAUDE.md.
