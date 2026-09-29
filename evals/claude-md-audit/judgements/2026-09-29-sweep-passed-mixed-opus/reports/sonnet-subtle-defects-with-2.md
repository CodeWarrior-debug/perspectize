## CLAUDE.md Quality Report

### Summary
- Files found: 3 (`./CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`)
- Average score: about 52/100
- Files needing update: 3 of 3. Most of the problems are claims that contradict the code.

### Checks against the code

| File | Claim | Reality | Verdict |
|---|---|---|---|
| root:4 | "Use Node 20" | `frontend/package.json` says `engines.node >=22` | Wrong |
| frontend:3 | "Requires Node 18+" | `>=22`. It also contradicts the root file's Node 20. | Wrong |
| frontend:7 | `pnpm run check` | The script is named `typecheck`. `check` doesn't exist. | Broken command |
| frontend:11 | Proxy targets port 3000 | `vite.config.ts:6` proxies to `localhost:8080` | Wrong |
| root:3 | API on :8080 | `main.go:10` | Correct |
| backend:13-14 | Validation rules live in `internal/validate/` | The directory is `internal/core/validation/rules/` | Wrong path |
| backend:13 | Every handler calls the rules package | There are no handlers. The only rule is `MaxBodyLen`, and nothing uses it. | Unverifiable, aspirational |
| backend:17 | `postgres.NewNoteRepo()` | The constructor is `NewNoteRepository()` | Wrong name |
| backend:17 | Repos are injected in `main.go` | `main.go` doesn't construct any repository | Not true yet |
| backend:19 | Connection string is `DB_URL` | `main.go:9` and `db.mk` both use `DATABASE_URL` | Wrong env var |
| backend:6-8 | `make run`, `make test`, `make db-reset` | All three exist. `db-reset` comes from the included `mk/db.mk`. | Correct |
| root:6 | Link to `.docs/ARCHITECTURE.md` | The link resolves, but the file is a single line ("Go API + SvelteKit frontend") | Dead-end reference |

### File-by-file assessment

#### 1. `./CLAUDE.md` (root) — 40/100 (D)
| Criterion | Score | Notes |
|---|---|---|
| Commands | 4/20 | None. It doesn't point to the per-package commands. |
| Architecture | 6/20 | Two packages are named, but the linked doc is empty. |
| Non-obvious patterns | 3/15 | None |
| Conciseness | 13/15 | Short |
| Currency | 5/15 | The Node version is wrong. |
| Actionability | 9/15 | Ports and layout are clear. |

**Issues:** the Node 20 claim is wrong and conflicts with the frontend file.
**Add:** a note pointing to the subdirectory CLAUDE.md files, and the actual Node requirement (>=22).

#### 2. `backend/CLAUDE.md` — 52/100 (C)
| Criterion | Score | Notes |
|---|---|---|
| Commands | 15/20 | All three commands are accurate. |
| Architecture | 7/20 | The path and constructor name are wrong. |
| Non-obvious patterns | 6/15 | The validation convention is described as if it were implemented. |
| Conciseness | 13/15 | |
| Currency | 3/15 | Four of the six factual claims are wrong. |
| Actionability | 8/15 | Following the wrong path or env var wastes time. |

**Issues:** the four wrong claims above (path, constructor name, `DB_URL`, injection in `main.go`). The validation and injection text describes an intended design, not the current code.
**Add:**
- The correct `DATABASE_URL`. It is also required by `make db-reset`.
- A note that `db-reset` is destructive: `reset.sql` runs `DROP TABLE`.
- A note that `db-reset` is defined in `mk/db.mk`.
- Go 1.25.

#### 3. `frontend/CLAUDE.md` — 50/100 (C)
| Criterion | Score | Notes |
|---|---|---|
| Commands | 10/20 | `check` is broken. `dev` and `test:e2e` are correct. |
| Architecture | 6/20 | Only the proxy is mentioned. |
| Non-obvious patterns | 8/15 | The proxy note is useful, but its port is wrong. |
| Conciseness | 13/15 | |
| Currency | 4/15 | Wrong Node version, script name and port. |
| Actionability | 9/15 | |

**Issues:** the Node version, the `check` script name and the proxy port are all wrong.
**Add:** the e2e tests live in `tests/e2e` (per `playwright.config.ts`). That directory isn't in the repo yet.

### Proposed fixes

```diff
# ./CLAUDE.md
-Use Node 20 for the frontend.
+Frontend needs Node >=22 (see `frontend/package.json`). Per-package commands are in `backend/CLAUDE.md` and `frontend/CLAUDE.md`.

# backend/CLAUDE.md
-rules package under `internal/validate/` before touching a repository, so
-don't re-check lengths in handlers.
+rules package under `internal/core/validation/rules/` (e.g. `MaxBodyLen`) before
+touching a repository, so don't re-check lengths in handlers.
-Repositories are built with `postgres.NewNoteRepo()` and injected in `main.go`.
+Repositories are built with `postgres.NewNoteRepository()` (`internal/adapters/postgres`).
-The server reads its connection string from `DB_URL`.
+The server and `make db-reset` read the connection string from `DATABASE_URL`.
+`make db-reset` runs `DROP TABLE`. It is destructive.

# frontend/CLAUDE.md
-Requires Node 18+.
+Requires Node >=22.
-pnpm run check     # type-check
+pnpm run typecheck # type-check
-The dev proxy forwards `/api` to the API on port 3000
+The dev proxy forwards `/api` to the API on port 8080
```

Two things to decide:
1. **Handlers and injection:** no handlers exist, and `main.go` doesn't inject repositories. I softened the wording in the diff above. If you'd prefer to describe only what exists, I can remove those two claims instead.
2. **`.docs/ARCHITECTURE.md`:** it is one line. Either expand it or drop the link from the root file.

Want me to apply these changes?
