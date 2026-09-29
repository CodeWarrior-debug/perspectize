## CLAUDE.md Quality Report

### Summary
- **Files found:** 3 (`./CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`)
- **Average score:** 50/100
- **Files needing updates:** 3
- **Most urgent:** `backend/CLAUDE.md` tells Claude to run `make migrate-up` as first-time setup. The root file forbids running that command locally because `DATABASE_URL` points at the shared staging database. An agent working in `backend/` could follow the local instruction and run migrations against staging.

---

### 1. `./CLAUDE.md` (project root): **65/100 (C)**

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 5/20 | No commands here. It relies on the subdirectory files. |
| Architecture clarity | 10/20 | Only the monorepo split. `.docs/ARCHITECTURE.md` adds just "Hexagonal backend". |
| Non-obvious patterns | 13/15 | The staging database warning is exactly the kind of thing this file should hold. |
| Conciseness | 15/15 | Short, and every line is useful. |
| Currency | 10/15 | One broken link (below). |
| Actionability | 12/15 | The rules are concrete. |

**Issues:**
- **Broken link:** `.docs/DEPLOYMENT.md` (line 14) doesn't exist. `.docs/` only contains `ARCHITECTURE.md`.
- The migration rule is contradicted by `backend/CLAUDE.md` (see below).

### 2. `backend/CLAUDE.md`: **40/100 (D)**

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 8/20 | One command is dangerous, one doesn't exist, and `lint` is missing. |
| Architecture clarity | 8/20 | One of the three listed directories doesn't exist. `migrations/` isn't mentioned. |
| Non-obvious patterns | 0/15 | None. |
| Conciseness | 14/15 | Tight. |
| Currency | 3/15 | Wrong Go version and a stale path. |
| Actionability | 7/15 | Two of the four commands would fail or cause harm. |

**Issues, checked against the code:**
- **Dangerous instruction (line 14):** `make migrate-up   # first-time setup: apply migrations to your DB`. The Makefile target runs `migrate ... -database "$$DATABASE_URL" up`, which, according to the root file, is staging. This directly contradicts the root rule.
- **`make seed` doesn't exist.** The Makefile only has `run`, `test`, `lint` and `migrate-up`.
- **`make lint` isn't documented**, even though it exists (`golangci-lint run`).
- **Wrong Go version:** the file says "Go 1.21", but `go.mod` declares `go 1.25`.
- **`internal/handlers/` doesn't exist.** The only code under `internal/` is `internal/core/services/note_service.go`.
- **`migrations/` isn't listed**, and neither is the `migrate` CLI (golang-migrate) that `make migrate-up` depends on.
- **"server on :8080" can't be verified:** `main.go` is an empty `func main() {}`, so the port is defined nowhere in the code.

### 3. `frontend/CLAUDE.md`: **46/100 (D)**

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 8/20 | The test command is wrong and `build` is missing. |
| Architecture clarity | 3/20 | Nothing about the layout (`src/routes/`). |
| Non-obvious patterns | 5/15 | "Svelte 5 runes only" is a useful convention. |
| Conciseness | 15/15 | Tight. |
| Currency | 8/15 | One stale command. |
| Actionability | 7/15 | Half the commands fail. |

**Issues, checked against the code:**
- **`pnpm run test:unit` doesn't exist.** `package.json` defines `test:run` (`vitest run`).
- **`build` isn't documented** (`vite build`).
- **The package manager can't be confirmed:** the file says pnpm, but there's no lockfile of any kind in the repo.
- **`package.json` declares no dependencies at all** (no svelte, @sveltejs/kit, vite or vitest), so none of the scripts would run after a fresh install. This is a code problem, not a CLAUDE.md problem, but it means the "Svelte 5" claim isn't backed by a pinned version.
- The 5173 port is Vite's default, so that line is fine.

---

### Recommended fixes (for your approval)

1. **`backend/CLAUDE.md`:** remove `make migrate-up` from the setup commands and replace it with a pointer to the root rule, e.g. `# DO NOT run locally — targets staging via DATABASE_URL (see root CLAUDE.md)`. This is the highest priority.
2. **`backend/CLAUDE.md`:** remove `make seed`, add `make lint`, change "Go 1.21" to "Go 1.25", remove `internal/handlers/`, add `migrations/` (golang-migrate), and drop the `:8080` claim until `main.go` actually sets a port.
3. **`frontend/CLAUDE.md`:** change `test:unit` to `test:run`, add `pnpm run build`, and add one line on layout (`src/routes/`, file-based routing).
4. **`./CLAUDE.md`:** either create `.docs/DEPLOYMENT.md` or remove the link. Adding a one-line note on how migrations get applied at release would complement the rule.

Tips:
- Keep shared safety rules (like the staging warning) in the root file only, and have subdirectory files point to it rather than restate or contradict it.
- Personal overrides can go in `.claude.local.md`, added to `.gitignore`.

I haven't changed anything. Do you want me to apply these fixes, starting with the migration contradiction?
