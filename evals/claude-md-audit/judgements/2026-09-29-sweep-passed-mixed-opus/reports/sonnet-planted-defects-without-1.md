# CLAUDE.md quality report

There are three files: `CLAUDE.md`, `backend/CLAUDE.md` and `frontend/CLAUDE.md`. I checked each against the tracked code. The most serious problem is a contradiction between the root file and the backend file about `make migrate-up`.

## Critical

**1. The root and backend files contradict each other on `make migrate-up`.**
- `CLAUDE.md:7` says never to run it locally, because `DATABASE_URL` points at the shared staging database.
- `backend/CLAUDE.md:14` lists it as "first-time setup: apply migrations to your DB".
- An agent working in `backend/` reads both files. It could follow the backend instruction and run migrations against shared staging.
- **Fix:** Remove the "first-time setup" framing from `backend/CLAUDE.md`. Either drop the command from that list or mark it "DO NOT RUN locally, see root CLAUDE.md". Also state how to set up a local database safely, since the file currently gives no other way.

## Inaccurate against the code

| File | Claim | Reality |
|---|---|---|
| `backend/CLAUDE.md:3` | "Go 1.21" | `backend/go.mod` says `go 1.25` |
| `backend/CLAUDE.md:15` | `make seed` | The Makefile has no `seed` target, so the command fails |
| `backend/CLAUDE.md:8` | `internal/handlers/` exists | The directory doesn't exist. Only `cmd/server` and `internal/core/services` do |
| `frontend/CLAUDE.md:9` | `pnpm run test:unit` | `package.json` defines `test:run`, not `test:unit` |
| `CLAUDE.md:14` | Link to `.docs/DEPLOYMENT.md` | The file doesn't exist. This is a broken link |

## Unverifiable or thin

- **"Svelte 5 runes only"** (`frontend/CLAUDE.md:3`): `package.json` lists no `svelte` or `@sveltejs/kit` dependency, and `+page.svelte` has no script block. I can't confirm the claim. If it's a real convention, say what to avoid, such as `$:` and `export let`.
- **`pnpm`**: there is no lockfile or `packageManager` field, so nothing confirms pnpm is the package manager.
- **`.docs/ARCHITECTURE.md`** is one line ("Hexagonal backend, SvelteKit frontend"). The root file links to it as if it were useful. Nothing else in the repo shows a hexagonal structure, since there are no ports or adapters directories. `internal/core/services` is the only hint.
- **`make lint`** exists in the Makefile but isn't documented. `make test` is documented and correct. `make run` is correct, but nothing in the code shows the `:8080` port because `main()` is empty.
- **`make migrate-up`** needs the `migrate` CLI and `DATABASE_URL`. Neither is documented, though the root file does mention the variable.

## What's good

- The root file has a clear, actionable safety rule with its reason. That's the most valuable line in the repo, and it needs to stay consistent with the backend file.
- All three files are short and use the standard structure of commands, layout and rules.
- The conventional-commits rule is concise. I didn't check it against git history, which has only one commit, "initial", and that doesn't follow the convention.

## Scores (out of 10)

| File | Score | Main reason |
|---|---|---|
| `CLAUDE.md` | 6 | Good rule, but it has a broken doc link and the contradiction with the backend file |
| `backend/CLAUDE.md` | 3 | Dangerous instruction, wrong Go version, nonexistent `make seed` target and nonexistent `handlers/` directory |
| `frontend/CLAUDE.md` | 4 | Wrong test script name, and the runes and pnpm claims can't be verified |

## Suggested priority

1. Fix the `migrate-up` contradiction in `backend/CLAUDE.md`.
2. Correct the test script name, the Go version, and the `seed` and `handlers/` references.
3. Create `.docs/DEPLOYMENT.md` or remove the link.
4. Expand or drop `ARCHITECTURE.md`, and add `make lint`.

I haven't edited anything. I can apply the fixes for items 1 and 2 if you want. For the `seed` target and the `handlers/` directory, I'd need you to say whether the docs or the code is wrong.
