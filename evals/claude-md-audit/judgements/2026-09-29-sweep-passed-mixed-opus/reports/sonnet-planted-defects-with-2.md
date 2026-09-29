## CLAUDE.md Quality Report

### Summary
- Files found: 3 (`./CLAUDE.md`, `./backend/CLAUDE.md`, `./frontend/CLAUDE.md`)
- Average score: about 42/100
- Files needing update: 3 of 3
- I checked every documented command, path and version against the Makefile, `package.json`, `go.mod` and the file tree. I changed nothing.

### Critical issue: contradictory and unsafe migration guidance
- `backend/CLAUDE.md:14` tells you to run `make migrate-up` for first-time setup against your DB.
- `CLAUDE.md:7` says never to run it locally, because `DATABASE_URL` points at the shared staging database.
- The Makefile confirms the risk. `migrate-up` runs `migrate ... -database "$$DATABASE_URL" up` with no guard.
- Anyone following the backend file, or an agent reading it, would apply migrations to staging.
- Fix the backend file first.

### File-by-file assessment

#### 1. `./CLAUDE.md` (root): 58/100 (C)
| Criterion | Score | Notes |
|-----------|-------|-------|
| Commands/workflows | 6/20 | No commands. It points to subdirectories only. |
| Architecture clarity | 10/20 | One line, plus a link to a 2-line ARCHITECTURE.md. |
| Non-obvious patterns | 13/15 | The staging-DB rule is exactly the kind of gotcha that belongs here. |
| Conciseness | 14/15 | Tight. |
| Currency | 6/15 | One broken link (below). |
| Actionability | 9/15 | The rule is clear but doesn't say what to do instead. |

**Issues:**
- `.docs/DEPLOYMENT.md` doesn't exist. Only `.docs/ARCHITECTURE.md` does.
- "Never run `make migrate-up`" gives no safe alternative for local development.
- Conventional commits is stated, but no enforcement or scope convention is documented. That's fine, just thin.

**Recommended additions:**
- Remove the DEPLOYMENT link or create the file.
- State how to get a local DB, or say that none is set up. Also say where `DATABASE_URL` comes from.
- Add a one-line pointer to the `make lint` and `make test` commands.

#### 2. `./backend/CLAUDE.md`: 30/100 (D)
| Criterion | Score | Notes |
|-----------|-------|-------|
| Commands/workflows | 7/20 | 2 of 4 commands are valid. `make migrate-up` is unsafe and `make seed` doesn't exist. |
| Architecture clarity | 8/20 | One of three layout entries is wrong. |
| Non-obvious patterns | 2/15 | Nothing captured. |
| Conciseness | 10/15 | Short. |
| Currency | 2/15 | Wrong Go version, a missing directory and a missing target. |
| Actionability | 1/15 | Following it fails or causes harm. |

**Issues:**
- `make migrate-up` is presented as safe first-time setup (see the critical issue above).
- `make seed` doesn't exist. The Makefile's `.PHONY` list is `run test lint migrate-up`.
- "Go 1.21" is wrong: `go.mod` says `go 1.25`.
- `internal/handlers/` doesn't exist. Only `internal/core/services/` (with `NoteService`) does.
- `make lint` (golangci-lint) exists but isn't documented.
- `migrations/` (golang-migrate format) isn't mentioned.
- Two commands are correct: `make run` and `make test`. Nothing in the repo confirms that `make run` serves on `:8080`, since `main()` is empty.

**Recommended changes:**
- Remove `migrate-up` from the setup steps and refer to the root rule instead.
- Remove `make seed`, or add the target.
- Change the version to 1.25.
- Fix the layout to match the tree, and add `migrations/` and `make lint`.
- The root `.docs/ARCHITECTURE.md` says "Hexagonal". A note on the port/adapter layout would help once more of it exists.

#### 3. `./frontend/CLAUDE.md`: 38/100 (D)
| Criterion | Score | Notes |
|-----------|-------|-------|
| Commands/workflows | 8/20 | `dev` is correct. `test:unit` doesn't exist. |
| Architecture clarity | 4/20 | No structure at all. |
| Non-obvious patterns | 9/15 | "Svelte 5 runes only" is a useful convention. |
| Conciseness | 12/15 | Short. |
| Currency | 4/15 | Wrong script name, and pnpm isn't backed by anything. |
| Actionability | 1/15 | The test command fails as written. |

**Issues:**
- `pnpm run test:unit` doesn't exist. The script in `package.json` is `test:run` (`vitest run`).
- `pnpm` isn't confirmed anywhere. There's no lockfile or `packageManager` field.
- `build` is undocumented.
- `package.json` has no svelte or sveltekit dependency, and `+page.svelte` uses no runes. So "Svelte 5 runes only" and "SvelteKit" can't be verified from the code. They may be aspirational, or the manifest may be incomplete.
- `vite dev` normally serves on 5173, but the repo doesn't confirm it.

**Recommended changes:**
- Use `pnpm run test:run`, or rename the script to `test:unit`, whichever you intend.
- Add `build`.
- Confirm the package manager and record it.
- Add a one-line layout note about `src/routes/`.

### Repo-level observations
- The repo is mostly stubs (`main() {}`, an empty `NoteService`). The docs describe a more finished project than exists, which is why so many entries drift from the code.
- Documenting the intended structure is fine. Label it as planned so it isn't read as fact.

### Proposed fixes (nothing applied yet)
1. **Backend:** delete the `migrate-up` and `seed` lines, add `make lint`, set Go to 1.25, and fix the layout.
2. **Frontend:** change `test:unit` to `test:run` and add `build`.
3. **Root:** drop the dead DEPLOYMENT link and add a safe local-DB note. I need you to supply that, since the repo doesn't say how.

Want me to apply these? Two questions first: should `test:unit` be renamed in `package.json` instead? And what's the intended local-DB workflow?
