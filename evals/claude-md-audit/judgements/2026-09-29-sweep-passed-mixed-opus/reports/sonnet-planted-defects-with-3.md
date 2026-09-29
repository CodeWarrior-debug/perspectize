## CLAUDE.md Quality Report

### Summary
- Files found: 3 (`./CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`)
- Average score: about 41/100
- Files needing update: 3 of 3
- I checked every documented command, path and version against the code. I haven't edited anything.

### Critical issue: contradictory and dangerous migration guidance
- Root `CLAUDE.md:7` says **never** run `make migrate-up` locally, because `DATABASE_URL` points at shared staging.
- `backend/CLAUDE.md:14` tells you to run `make migrate-up` as "first-time setup: apply migrations to your DB".
- The Makefile confirms the target runs `migrate ... up` against `$DATABASE_URL`, so following the backend file would apply migrations to staging.
- Claude reads both files when working in `backend/`, so this is the most important fix.

### 1. `./CLAUDE.md` (Project Root): 58/100 (Grade C)

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 8/20 | No commands. It only points to the sub-files. |
| Architecture clarity | 10/20 | It names the two halves. The linked ARCHITECTURE.md is a single line ("Hexagonal backend"). |
| Non-obvious patterns | 13/15 | The staging-DB rule is a valuable gotcha. |
| Conciseness | 14/15 | Tight. |
| Currency | 6/15 | `.docs/DEPLOYMENT.md` doesn't exist. |
| Actionability | 7/15 | The rule is clear, but nothing says what to do instead, such as how to get a local DB. |

**Issues**
- The link to `.docs/DEPLOYMENT.md` is broken. Only `ARCHITECTURE.md` exists.
- The rule doesn't say that `DATABASE_URL` is set in the environment, or where.
- It doesn't warn that `backend/CLAUDE.md` contradicts it.

### 2. `backend/CLAUDE.md`: 30/100 (Grade D)

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 6/20 | 2 of 4 commands are valid, and one of those is dangerous. |
| Architecture clarity | 8/20 | 1 of 3 paths is wrong. |
| Non-obvious patterns | 3/15 | The dangerous instruction is the opposite of a gotcha. |
| Conciseness | 10/15 | Short. |
| Currency | 2/15 | Several stale claims. |
| Actionability | 1/15 | Following it causes harm or errors. |

**Verified against code**
- `make migrate-up` exists but is unsafe (see above).
- `make seed` **doesn't exist**. The Makefile only has `run`, `test`, `lint` and `migrate-up`, and there's no seed script.
- `make run` and `make test` exist. The "server on :8080" claim can't be verified, because `main()` is empty and no port is configured.
- `internal/handlers/` **doesn't exist**. The only internal package is `internal/core/services/`.
- "Go 1.21" is wrong. `go.mod` says `go 1.25`.
- `cmd/server/` and `internal/core/services/` are correct.
- `make lint` exists (golangci-lint) but isn't documented.

### 3. `frontend/CLAUDE.md`: 45/100 (Grade D)

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 8/20 | `pnpm run test:unit` doesn't exist. |
| Architecture clarity | 4/20 | No structure is described. |
| Non-obvious patterns | 8/15 | "Svelte 5 runes only" would be useful if true. |
| Conciseness | 14/15 | Tight. |
| Currency | 5/15 | Stale script name, and two claims I couldn't verify. |
| Actionability | 6/15 | The dev command works, and the test command fails. |

**Verified against code**
- `pnpm run dev` maps to `vite dev`, which is correct. Port 5173 is Vite's default, but there's no config to confirm it.
- `test:unit` **doesn't exist**. The script is `test:run` (`vitest run`).
- The `build` script exists but isn't documented.
- Unverifiable: `package.json` has no dependencies at all, so nothing confirms Svelte 5, SvelteKit or vitest. There's also no lockfile to confirm pnpm.

### Recommended fixes (for your approval)

**Root `CLAUDE.md`**
```diff
- - [Deployment](.docs/DEPLOYMENT.md)
```
(Remove the link, or create the doc.) Also add: "`DATABASE_URL` is staging. Don't run anything that writes to it."

**`backend/CLAUDE.md`**
```diff
- Go 1.21 HTTP API.
+ Go 1.25 HTTP API.
- - `internal/handlers/` — HTTP handlers, one file per resource
  - `internal/core/services/` — business logic
- make migrate-up   # first-time setup: apply migrations to your DB
- make seed         # load sample notes
+ make lint         # golangci-lint
+ # DO NOT run `make migrate-up`: DATABASE_URL is the shared staging DB (see root CLAUDE.md)
```
I'd also drop the "server on :8080" comment unless you confirm the port.

**`frontend/CLAUDE.md`**
```diff
- pnpm run test:unit  # run unit tests once
+ pnpm run test:run   # vitest, run once
+ pnpm run build      # production build
```

### Questions for you
1. Is there a safe local-DB workflow, such as a local `DATABASE_URL` or docker-compose? If so, I'll document it in place of the migrate instruction.
2. Do you want `make seed` added to the Makefile, or just removed from the docs?
3. Are the Svelte 5 runes rule and pnpm still accurate? `package.json` doesn't show either.
4. Should `.docs/DEPLOYMENT.md` be written, or the link removed?

Shall I apply these edits? I'd start with the migration contradiction.
