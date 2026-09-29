# CLAUDE.md Quality Report

## Summary
- **Files found:** 3 (`./CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`)
- **Average score:** 45/100
- **Files needing update:** 3

**The most important finding:** the root file and the backend file give opposite instructions about migrations, and following the backend file could damage the shared staging database.

- `CLAUDE.md:7` says: *"Never run `make migrate-up` locally — `DATABASE_URL` points at the shared staging database."*
- `backend/CLAUDE.md:14` says: `make migrate-up   # first-time setup: apply migrations to your DB`

The Makefile (`backend/Makefile:13`) confirms that `migrate-up` runs against `$DATABASE_URL`. An agent working in `backend/` will read the nested file and could reasonably follow its "first-time setup" step, which would apply migrations to staging.

---

## File-by-File Assessment

### 1. `./CLAUDE.md` (Project Root): **58/100 (C)**

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 8/20 | Points to the subpackages, but doesn't say they have their own CLAUDE.md files |
| Architecture clarity | 12/20 | The monorepo split is clear. The linked architecture doc is only 2 lines |
| Non-obvious patterns | 13/15 | The staging-DB warning is exactly the kind of gotcha that belongs here |
| Conciseness | 14/15 | Tight |
| Currency | 6/15 | Broken link |
| Actionability | 5/15 | The main rule is contradicted by the backend file |

**Issues:**
- `CLAUDE.md:14` links to `.docs/DEPLOYMENT.md`, which doesn't exist. Only `.docs/ARCHITECTURE.md` is present.
- It doesn't say how migrations *should* be tested locally, for example by pointing `DATABASE_URL` at a local Postgres. As written, the rule blocks a task without offering a safe alternative.

### 2. `backend/CLAUDE.md`: **28/100 (F)**

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 6/20 | 2 of the 4 commands are wrong or dangerous. `lint` is missing |
| Architecture clarity | 8/20 | 1 of the 3 listed directories doesn't exist |
| Non-obvious patterns | 2/15 | None. `golang-migrate` isn't mentioned |
| Conciseness | 13/15 | Short |
| Currency | 0/15 | Wrong Go version, a missing directory and a missing make target |
| Actionability | 0/15 | Following it as written either fails or hits staging |

**Checked against the code:**

| Claim | Reality |
|---|---|
| `make migrate-up` for first-time setup (line 14) | ❌ **Dangerous.** It targets `$DATABASE_URL`, which is staging according to the root file |
| `make seed` (line 15) | ❌ There is no `seed` target in the Makefile |
| `internal/handlers/` (line 8) | ❌ This directory doesn't exist. Only `internal/core/services/` does |
| "Go 1.21" (line 3) | ❌ `go.mod` declares `go 1.25` |
| `make run`, server on `:8080` (line 16) | ⚠️ The target exists, but `cmd/server/main.go` is an empty `func main() {}`, so nothing listens on any port yet |
| `make test` | ✅ Runs `go test ./...` |
| — | Missing: `make lint`, which runs `golangci-lint` |
| — | Missing: the `migrate` CLI, which `migrate-up` requires |

### 3. `frontend/CLAUDE.md`: **50/100 (C)**

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 8/20 | The test command is wrong. `build` is missing |
| Architecture clarity | 8/20 | No layout, though the app is currently just one route |
| Non-obvious patterns | 10/15 | "Svelte 5 runes only" is a useful convention |
| Conciseness | 15/15 | Tight |
| Currency | 5/15 | The test script name doesn't match `package.json` |
| Actionability | 4/15 | The test command fails |

**Checked against the code:**
- ❌ `pnpm run test:unit` (line 9) doesn't exist. The script is `test:run` (`frontend/package.json:7`).
- ⚠️ `pnpm`: there's no lockfile and no `packageManager` field, so I couldn't confirm the package manager.
- ⚠️ "Svelte 5 runes": `package.json` declares no dependencies at all (no `svelte`, `@sveltejs/kit`, `vite` or `vitest`), so neither the version claim nor the scripts can currently run. This could be a trimmed fixture, but it's worth checking.
- ✅ `dev` → `vite dev`, which matches Vite's default port 5173.
- Missing: `pnpm run build`.

---

## Proposed Updates

### `backend/CLAUDE.md`
**Why:** This removes the dangerous instruction and corrects each claim that doesn't match the code.

```diff
-Go 1.21 HTTP API.
+Go 1.25 HTTP API.

 ## Layout

 - `cmd/server/` — entry point
-- `internal/handlers/` — HTTP handlers, one file per resource
 - `internal/core/services/` — business logic
+- `migrations/` — golang-migrate SQL files

 ## Commands

 ```bash
-make migrate-up   # first-time setup: apply migrations to your DB
-make seed         # load sample notes
 make run          # server on :8080
 make test         # all tests
+make lint         # golangci-lint
 ```
+
+**Do not run `make migrate-up`**: `DATABASE_URL` points at shared staging (see root CLAUDE.md).
```

### `frontend/CLAUDE.md`
**Why:** The documented test command fails.

```diff
 pnpm run dev        # http://localhost:5173
-pnpm run test:unit  # run unit tests once
+pnpm run test:run   # run unit tests once
+pnpm run build
```

### `./CLAUDE.md`
**Why:** This removes the dead link.

```diff
 - [Architecture](.docs/ARCHITECTURE.md)
-- [Deployment](.docs/DEPLOYMENT.md)
```
(Alternatively, keep the link if `DEPLOYMENT.md` is supposed to exist and just hasn't been committed.)

---

**Questions before I apply these:**
1. Should I remove the `DEPLOYMENT.md` link, or is that doc meant to be written?
2. Is there a safe local-DB workflow for migrations, such as a local Postgres URL? If so, I'd add it next to the "never run migrate-up" rule so the rule points somewhere useful.
3. Should `internal/handlers/` and `make seed` be dropped from the docs, or are they planned and should be added to the code instead?

Say the word and I'll apply the edits. I haven't changed any files yet.

**Tip:** during a session you can press `#` to have Claude add a learning to CLAUDE.md, and personal notes that shouldn't be shared can go in a gitignored `.claude.local.md`.
