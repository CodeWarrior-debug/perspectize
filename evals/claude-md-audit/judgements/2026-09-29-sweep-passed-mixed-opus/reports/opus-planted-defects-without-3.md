# CLAUDE.md audit report

There are three CLAUDE.md files: root, `backend/`, and `frontend/`. The repo is small, so I checked every claim against the actual files.

## 🔴 Critical: the backend doc says to run a command the root doc forbids

- `CLAUDE.md:7-8` says **never** run `make migrate-up` locally, because `DATABASE_URL` points at the shared staging DB.
- `backend/CLAUDE.md:14` lists `make migrate-up` as the "first-time setup" step.

When Claude works in `backend/`, it loads both files. The nearer file gives step-by-step setup, so Claude could follow it and apply migrations to staging. `backend/Makefile:12-13` confirms the target runs against `$DATABASE_URL`, so the risk is real.
**Fix:** remove that line from `backend/CLAUDE.md`. In its place, add a warning like "Do not run `make migrate-up`; migrations are applied at release (see root CLAUDE.md)." If there's a safe local option (e.g. a local `DATABASE_URL`), document that instead.

## 🟠 Claims that don't match the code

| File:line | Claim | Reality |
|---|---|---|
| `backend/CLAUDE.md:3` | Go 1.21 | `backend/go.mod:3` says `go 1.25` |
| `backend/CLAUDE.md:15` | `make seed` loads sample notes | There is no `seed` target in `backend/Makefile` (only `run test lint migrate-up`) |
| `backend/CLAUDE.md:8` | `internal/handlers/` holds the HTTP handlers | That directory doesn't exist. Only `internal/core/services/` does |
| `frontend/CLAUDE.md:9` | `pnpm run test:unit` | The script is named `test:run` (`frontend/package.json:7`), so this command fails |
| `CLAUDE.md:14` | Link to `.docs/DEPLOYMENT.md` | The file doesn't exist, so the link is broken |

## 🟡 Gaps and claims I couldn't verify

- **`make lint` is missing:** `backend/Makefile:9-10` has a `lint` target (golangci-lint), but it's not documented. It's useful for Claude to run before committing.
- **`frontend/CLAUDE.md` leaves out `build`:** `package.json` has a `build` script that isn't listed.
- **"Svelte 5 runes only" can't be confirmed:** `package.json` lists no dependencies at all (no `svelte`, `@sveltejs/kit`, `vite`, `vitest`). There's also no `pnpm-lock.yaml`, so nothing confirms pnpm is the package manager. This may just be because the repo is a skeleton. If it's real, the missing dependencies are a project bug, not a docs issue.
- **"server on :8080" can't be confirmed:** `cmd/server/main.go` is an empty `main()`.
- **Nothing explains the root doc's "hexagonal" architecture:** `.docs/ARCHITECTURE.md` says "hexagonal," but no CLAUDE.md explains ports/adapters or where new code should go. `internal/core/services/` suggests a `core/` layer, so the missing `handlers/` directory may really belong at something like `internal/adapters/http/`. It's worth stating the real layout.

## ✅ What checks out

- The root monorepo description (`backend/` Go, `frontend/` SvelteKit) is accurate.
- `make run` and `make test` exist and do what the doc says.
- `pnpm run dev` → `vite dev`. Port 5173 is Vite's default, so that's plausible.
- `cmd/server/` and `internal/core/services/` exist as described.
- The `.docs/ARCHITECTURE.md` link works.

## Scores

| File | Accuracy | Completeness | Safety | Overall |
|---|---|---|---|---|
| `CLAUDE.md` | B (broken link) | B | A | **B+** |
| `backend/CLAUDE.md` | D (4 wrong claims) | C (no `lint`) | **F** (migration conflict) | **D** |
| `frontend/CLAUDE.md` | C (wrong test script) | C (no `build`) | A | **C** |

## Fixes in priority order

1. Remove `make migrate-up` from `backend/CLAUDE.md` and replace it with an explicit warning.
2. `test:unit` → `test:run` in `frontend/CLAUDE.md` (or rename the script).
3. Go 1.21 → 1.25.
4. Remove `make seed`, or add the Makefile target.
5. Fix or remove the `internal/handlers/` line.
6. Create `.docs/DEPLOYMENT.md` or remove the link.
7. Add `make lint` and `pnpm run build`.

I didn't change any files. I can apply fixes 1–7 if you want. For #4 and #6, tell me whether to add the missing target and file or remove the references.
