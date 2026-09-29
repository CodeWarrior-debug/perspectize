# CLAUDE.md quality report

I audited 3 files (`CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`) against the code. The repo is a skeleton: `main.go` is an empty `main()`, and there is one stub service, one migration and one placeholder page. Several claims therefore can't be checked yet.

## Critical

**1. `backend/CLAUDE.md` tells you to run `make migrate-up` as "first-time setup", which contradicts the root rule.**
- The root `CLAUDE.md:7` says never to run it locally, because `DATABASE_URL` points at the shared staging database.
- `backend/CLAUDE.md:14` says to run it to "apply migrations to your DB".
- The Makefile target (`backend/Makefile:12-13`) runs `migrate ... "$$DATABASE_URL" up` directly. Following the backend file would apply migrations to shared staging.
- **Fix:** remove `migrate-up` from the backend quick-start. Point to the root rule instead, or add a warning next to the command.

## Inaccurate (doesn't match the code)

**2. Go version is wrong.** `backend/CLAUDE.md:3` says "Go 1.21", but `backend/go.mod:3` says `go 1.25`.

**3. `make seed` doesn't exist.** `backend/CLAUDE.md:15` lists it, but the Makefile has only `run`, `test`, `lint` and `migrate-up`. No seed script or sample data is in the repo either.

**4. The frontend test command is wrong.** `frontend/CLAUDE.md:9` says `pnpm run test:unit`, but `package.json` defines `test:run`. As written, the command fails.

**5. The root file links to a missing doc.** `.docs/DEPLOYMENT.md` (`CLAUDE.md:14`) isn't in the repo. It's a dead link.

## Unverifiable or stale

- **`internal/handlers/` is documented but doesn't exist** (`backend/CLAUDE.md:8`). It's either planned or was removed.
- **"Svelte 5 runes only"** (`frontend/CLAUDE.md:3`) can't be checked. `package.json` doesn't list `svelte` or `@sveltejs/kit`, and `+page.svelte` has no script.
- **`pnpm`** is assumed, but there's no lockfile or `packageManager` field to confirm it.
- **`http://localhost:5173` and `:8080`** are plausible (Vite's default port; `main.go` is empty, so the 8080 claim can't be checked). Neither is confirmed in code.

## Gaps

- `make lint` exists but isn't documented. Neither is `pnpm run build`.
- `.docs/ARCHITECTURE.md` says "Hexagonal", which fits `internal/core/services/`. But the backend file's layout doesn't mention the ports/adapters structure. The architecture doc is also only two lines, so the link adds little.
- The "Conventional commits" rule doesn't say whether scopes are used. That's minor.

## What's good

- The root file is short and puts its one dangerous rule first, with the reason.
- The `backend/` and `frontend/` files are separated cleanly per package.
- The `internal/core/services/` and `cmd/server/` paths are accurate.
- The `make run`, `make test` and `pnpm run dev` commands match the actual files.

## Scorecard

| File | Accuracy | Safety | Completeness |
|---|---|---|---|
| `CLAUDE.md` | Good, but 1 dead link | Good | Thin |
| `backend/CLAUDE.md` | Poor (3 wrong claims) | **Unsafe** (contradicts root) | Fair |
| `frontend/CLAUDE.md` | Poor (wrong test command) | OK | Thin |

## Suggested fixes, in priority order

1. Remove or warn on `make migrate-up` in `backend/CLAUDE.md`.
2. Change "Go 1.21" to "Go 1.25".
3. Remove `make seed`, or add the target.
4. Change `test:unit` to `test:run`, or rename the script.
5. Remove the `DEPLOYMENT.md` link, or add the doc.
6. Remove `internal/handlers/` from the layout until it exists.

I haven't changed anything. I can apply these edits if you want. For items 3 to 6 I'd need to know whether the CLAUDE.md or the code is the intended source of truth.
