# CLAUDE.md Audit Report

**Files audited:** `CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`. I checked each claim against the Makefile, `go.mod`, `package.json`, and the directory tree.

**Overall grade: D.** The files are short and well organised, but about half of what they state is wrong. One of the errors could damage a shared database.

---

## 🔴 Critical

### 1. The two files disagree on `make migrate-up`, and following the wrong one could damage the staging database
- `CLAUDE.md:7-8` says: *"Never run `make migrate-up` locally — `DATABASE_URL` points at the shared staging database."*
- `backend/CLAUDE.md:14` says: `make migrate-up   # first-time setup: apply migrations to your DB`
- `backend/Makefile:13` confirms the risk: it runs `migrate ... -database "$$DATABASE_URL" up`.

An agent working in `backend/` will load the more specific file, and that file tells it to run migrations against staging during setup.
**Fix:** Remove that line from `backend/CLAUDE.md`, or replace it with a pointer to the root rule. If there's a safe local option (e.g. a local `DATABASE_URL`), document it instead.

---

## 🟠 High: commands that don't exist

| Location | Claim | Reality |
|---|---|---|
| `backend/CLAUDE.md:15` | `make seed` | There's no `seed` target in `backend/Makefile`. Targets are `run`, `test`, `lint`, `migrate-up`. |
| `frontend/CLAUDE.md:9` | `pnpm run test:unit` | There's no such script. `package.json:7` defines `test:run` (`vitest run`). |

Both commands fail as soon as they're run, and they're the kind an agent runs without asking first.

---

## 🟡 Medium: stale facts

| Location | Claim | Reality |
|---|---|---|
| `backend/CLAUDE.md:3` | "Go 1.21" | `backend/go.mod:3` says `go 1.25`. This affects which language features an agent will use (e.g. range-over-func, the new `for` loop variable scoping). |
| `backend/CLAUDE.md:8` | `internal/handlers/`: HTTP handlers, one file per resource | The directory doesn't exist. Only `internal/core/services/` exists. An agent may create files in a layout that was never adopted, or go looking for handlers that aren't there. |
| `CLAUDE.md:14` | Link to `.docs/DEPLOYMENT.md` | The file doesn't exist; only `.docs/ARCHITECTURE.md` does. |

---

## 🔵 Low: gaps and claims I couldn't check

- **Undocumented target:** `make lint` (`golangci-lint run`) exists but isn't listed in `backend/CLAUDE.md`. Agents should know to run it before committing.
- **Frontend build is missing:** `pnpm run build` isn't documented.
- **Server port `:8080`** (`backend/CLAUDE.md:16`): I can't check this because `cmd/server/main.go` is an empty `func main() {}`. Fine if it's aspirational, but worth knowing.
- **"Svelte 5 runes only" and `pnpm`** (`frontend/CLAUDE.md:3,8`): `package.json` has no dependencies, no `packageManager` field and no lockfile, so the repo confirms neither the Svelte version nor pnpm. The runes rule is a useful instruction, so keep it; just be aware nothing enforces it.
- **The migrations directory** (`backend/migrations/`) is missing from the Layout section.
- **`.docs/ARCHITECTURE.md`** is only two lines, so the link from the root file adds almost nothing.

---

## ✅ What's working
- The root file's split into Rules and Docs is short and easy to act on.
- The staging-DB warning is exactly the kind of non-obvious, high-stakes rule a CLAUDE.md should hold. It just needs to not be contradicted.
- The conventional-commits rule is clear.
- Per-package files are the right structure for a monorepo.

---

## Fixes, in priority order
1. Remove or rewrite `backend/CLAUDE.md:14` so it stops contradicting the root migration rule.
2. `frontend/CLAUDE.md:9`: change `test:unit` to `test:run`.
3. `backend/CLAUDE.md:15`: remove `make seed`, or add the target.
4. `backend/CLAUDE.md:3`: change "Go 1.21" to "Go 1.25".
5. `backend/CLAUDE.md:8`: remove `internal/handlers/`, or mark it as planned; add `migrations/`.
6. `CLAUDE.md:14`: remove the Deployment link, or write the doc.
7. Add `make lint` and `pnpm run build`.

I can make fixes 1–7 now if you want, though fixes 3 and 6 need a decision from you: remove the reference or build the missing thing.
