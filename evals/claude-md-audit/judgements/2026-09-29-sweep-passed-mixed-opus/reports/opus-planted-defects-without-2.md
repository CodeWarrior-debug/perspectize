I audited the three CLAUDE.md files (42 lines in total) against the Makefile, `go.mod`, `package.json`, the directory tree and the linked docs. The most serious problem is that two of the files contradict each other on a rule that protects the shared staging database. Five other instructions are wrong when checked against the code.

## Findings

### 🔴 Critical: the files contradict each other on a safety rule
**`backend/CLAUDE.md:14`**: `make migrate-up   # first-time setup: apply migrations to your DB`
**`CLAUDE.md:7`**: "Never run `make migrate-up` locally — `DATABASE_URL` points at the shared staging database."

When Claude works in `backend/`, it loads both files. The backend file presents the forbidden command as a normal setup step, and the Makefile target (`backend/Makefile:12-13`) does run `migrate ... -database "$DATABASE_URL" up`. Following the backend instructions would apply migrations to shared staging.
**Fix:** remove that line from the backend commands, or replace it with a pointer to the root rule. If developers need a local database, document a separate target or variable (e.g. `LOCAL_DATABASE_URL`).

### 🟠 Commands that don't exist
| Location | Claim | Reality |
|---|---|---|
| `backend/CLAUDE.md:15` | `make seed` | There's no `seed` target. The Makefile only has `run`, `test`, `lint` and `migrate-up`. |
| `frontend/CLAUDE.md:9` | `pnpm run test:unit` | There's no such script. The real one is `test:run` (`frontend/package.json:7`). |

### 🟠 Facts that don't match the code
| Location | Claim | Reality |
|---|---|---|
| `backend/CLAUDE.md:3` | "Go 1.21" | `go.mod` says `go 1.25`. Claude may avoid 1.22+ features (range-over-int, the new loop-variable behaviour, iterators) for no reason. |
| `backend/CLAUDE.md:8` | `internal/handlers/`: "one file per resource" | That directory doesn't exist. `internal/` only contains `core/services/`. |
| `CLAUDE.md:14` | Link to `.docs/DEPLOYMENT.md` | The file doesn't exist. This matters because the root file says migrations are "applied manually at release time," and that process isn't written down anywhere. |

### 🟡 Gaps
- **`make lint`** exists (golangci-lint) but isn't documented, so Claude won't run it before finishing.
- **`pnpm run build`** exists but isn't documented.
- **`backend/migrations/`** isn't listed in the backend layout.
- **`.docs/ARCHITECTURE.md`** says "Hexagonal backend." The layout (`internal/core/services/`) partly fits that, but the backend CLAUDE.md never mentions ports/adapters, so Claude won't know where new handlers or repositories belong.

### ⚪ Things I couldn't verify
- **"pnpm"**: there's no lockfile and no `packageManager` field, so nothing in the repo confirms pnpm. Adding `"packageManager": "pnpm@x"` to `package.json` would settle it.
- **"Svelte 5 runes only"**: `package.json` doesn't list any dependencies (no svelte, vite or vitest), so the version can't be checked. The rule is useful if it's true.
- **"Conventional commits"**: the only commit (`initial`) doesn't follow the convention. That's harmless, but nothing enforces it.

## Scorecard

| File | Accuracy | Safety | Completeness | Overall |
|---|---|---|---|---|
| `CLAUDE.md` | B (broken link) | A (good rule, clearly stated) | C | **B-** |
| `backend/CLAUDE.md` | D (3 of 7 claims false) | **F** (overrides the root safety rule) | C (no lint) | **D-** |
| `frontend/CLAUDE.md` | C (wrong test script) | n/a | C (no build) | **C** |

**Good points:** all three files are short and scoped per directory, and the root migration rule gives its reason, which helps Claude handle edge cases.

## Suggested fixes, in priority order
1. Remove `make migrate-up` from the setup steps in `backend/CLAUDE.md`.
2. Change `test:unit` to `test:run` in the frontend file (or rename the script).
3. Remove `make seed`, or add the target.
4. Change Go 1.21 to 1.25, and remove `internal/handlers/` or create it.
5. Write `.docs/DEPLOYMENT.md` (including the manual migration process), or remove the link.
6. Document `make lint` and `pnpm run build`.

I haven't changed any files. I can apply fixes 1–4 and 6 now if you want; fix 5 needs input from you on the actual deployment process.
