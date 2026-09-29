# CLAUDE.md quality report

I audited 3 files (`CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`) plus the linked doc. The repo is mostly stubs, so I checked each claim against the Makefile, `go.mod`, `package.json` and the file tree.

## Critical

**1. `backend/CLAUDE.md:14` contradicts the root safety rule.**
- The root file (`CLAUDE.md:7`) says never run `make migrate-up` locally, because `DATABASE_URL` points at shared staging.
- The backend file lists `make migrate-up` as "first-time setup: apply migrations to your DB".
- An agent working in `backend/` will likely follow the closer file and run migrations against staging.
- Fix: remove the "first-time setup" wording and add a pointer to the root rule. For example: "Do not run `migrate-up` locally, see the root CLAUDE.md."

## Incorrect against the code

**2. Go version mismatch.**
- `backend/CLAUDE.md:3` says Go 1.21. `backend/go.mod` says `go 1.25`.

**3. `make seed` does not exist.**
- The Makefile only defines `run`, `test`, `lint` and `migrate-up`. There is no `seed` target and no seed data in the repo.

**4. `pnpm run test:unit` does not exist.**
- `frontend/package.json` defines the script as `test:run`. The scripts are `dev`, `build` and `test:run`.

**5. Broken doc link.**
- `CLAUDE.md:14` links to `.docs/DEPLOYMENT.md`, which does not exist. Only `.docs/ARCHITECTURE.md` does.

## Unverifiable or doubtful

**6. `internal/handlers/` does not exist.**
- `backend/CLAUDE.md:8` describes it, but there is no such directory in the tree. It may be planned. If so, say so, or remove the line.

**7. "Svelte 5 runes only" is unsupported.**
- `frontend/package.json` has no `svelte` or `@sveltejs/kit` dependency at all, so the version can't be confirmed. `+page.svelte` is plain HTML and uses no runes.
- The `vite` and `vitest` dependencies are also missing, though the scripts call them. Either the `package.json` is incomplete or the docs are ahead of the code.

**8. Undocumented commands and tools.**
- `make lint` exists (it needs `golangci-lint`) but is not documented.
- `make migrate-up` needs the `migrate` CLI.
- `pnpm` is assumed, but there is no lockfile or `packageManager` field.
- The `build` script isn't documented.
- The `make run` claim of "server on :8080" can't be checked, because `main()` is empty.

## Weak content

**9. `.docs/ARCHITECTURE.md` is one line.**
- "Hexagonal backend" is consistent with `internal/core/services/`, but there are no `ports` or `adapters` directories yet. It gives an agent nothing to work with.

**10. Missing guidance.**
- The root file has no commands, no test or lint expectations, and no note on the required env vars (`DATABASE_URL`).
- The conventional-commits rule is fine, but it doesn't say whether scopes are expected.

## What's good
- The root rule about staging is specific, gives a reason, and is exactly the kind of guardrail worth keeping.
- The files are short and split sensibly by directory.
- `internal/core/services/` and `cmd/server/` match the tree.

## Suggested fixes, in priority order
1. Reconcile `backend/CLAUDE.md` with the root migration rule (#1).
2. Fix the Go version, remove `make seed` and correct the frontend test script name (#2–#4).
3. Create `DEPLOYMENT.md` or drop the link (#5).
4. Verify the frontend stack and fix `package.json` or the docs (#7).
5. Add `make lint`, prerequisites and env vars, and flesh out `ARCHITECTURE.md`.

I haven't changed anything. I can apply fixes 1–3 if you want.
