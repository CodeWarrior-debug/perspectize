# CLAUDE.md quality report

I read all four files and checked their claims against the code. I made no edits.

## Summary
- **Files found:** 4 (`./CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `.claude/CLAUDE.md`)
- **Average score:** about 60/100
- **Files needing update:** 4. Three have factual errors, and one is a stub.

| File | Lines | Score | Grade |
|---|---|---|---|
| `./CLAUDE.md` | 247 (25 KB) | 66 | C |
| `backend/CLAUDE.md` | 201 | 62 | C |
| `frontend/CLAUDE.md` | 253 | 68 | C |
| `.claude/CLAUDE.md` | 3 | 25 | F |

The gotchas are strong across the board and are the most valuable content. The structural sections (architecture trees, feature recipes, version notes) have drifted from the code.

---

## 1. `./CLAUDE.md` (root): 66/100 (C)

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 10/20 | The verification commands are good. The root `Makefile` targets (`make start/stop/restart/status/logs`, `demo-*`) are only partly covered, and there is no Commands section. |
| Architecture clarity | 13/20 | Good pointers to `.docs/*`. It has no map of what lives where. |
| Non-obvious patterns | 12/15 | Strong: the `master`/`main` gotcha, the `_headers` and `gh pr edit` quirks, the migration rules. |
| Conciseness | 6/15 | About 60% is PR, label and cloud-vs-local process. The "qmd is fully retired" section is dead text. |
| Currency | 12/15 | See the list below. |
| Actionability | 13/15 | Mostly concrete. |

**Issues found against the code:**
- **Missing tooling:**
  - `.claude/hooks/`, `.claude/commands/`, `.claude/agents/` and `.claude/skills/` are empty in this checkout.
  - `.claude/settings.json` is not tracked in git. Only 8 files under `.claude/` are tracked.
  - `.claude/get-shit-done/` and `.claude/commands/gsd/` don't exist.
  - The file relies on all of these: the 6 PreToolUse hooks, the `go-backend`, `graphql-designer`, `db-migration`, `code-reviewer` and `test-writer` subagents, the "vendored GSD" section, and "superpowers enabled in `.claude/settings.json`".
  - A fresh clone or cloud session won't have any of it.
- **Self-contradictions:**
  - Line 135 bans `&&` chaining, but line 100 tells you to run `git checkout main && git pull origin main && git checkout -b <name>`. Line 233's `cd` advice is fine, but the ban is violated in the doc's own examples.
  - Line 21 says the local branch is `master`, but line 100 tells you to `git checkout main`. In this repo `main` doesn't exist locally.
- **Conflict with `backend/CLAUDE.md`:** line 139 says never run `make migrate-up`. The backend file's Setup block runs it.
- **Platform-specific:** `open -a Docker` is macOS-only.
- **Dead reference:** `graphify-out/` doesn't exist (it's gitignored). The section is written conditionally, so it's harmless, but it's duplicated in `.claude/CLAUDE.md`.

## 2. `backend/CLAUDE.md`: 62/100 (C)

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 14/20 | The make targets all exist. The Setup block is wrong (see below). |
| Architecture clarity | 10/20 | The tree is stale. |
| Non-obvious patterns | 13/15 | The gqlgen `schema.resolvers.go` collision, the `Paginate()` err gotcha and the directive introspection notes are excellent. |
| Conciseness | 9/15 | The "Deep Modules" essay and the external links are padding. |
| Currency | 5/15 | Several factual errors. |
| Actionability | 11/15 | The "Adding a New Feature" paths are wrong. |

**Factual errors (verified):**
- **Go version:**
  - The file says "Go 1.25+", `go 1.25` minimum and `golang:1.26-alpine`.
  - `go.mod` has `go 1.26` and `toolchain go1.26.0`, and the `Dockerfile` uses `golang:1.27-alpine`.
- **CORS:** it says CORS "allows all origins (`*`). Restrict … before deploying."
  - `cmd/server/main.go:303` uses `secCfg.CORSOrigins`, which comes from config.
  - The warning is stale and misleading on a security topic.
- **Architecture tree:**
  - `internal/middleware/` doesn't exist. Middleware is in `pkg/middleware/`.
  - The tree omits `internal/adapters/{auth,realtime,web,wikidata}`, `internal/{demo,perf}`, `pkg/logger`, `messaging.graphql`, and `cmd/*`.
- **Adding a New Feature:**
  - The recipe says `postgres/feature_repository.go`. The real convention is `gorm_<name>_repository.go`.
  - It says `resolvers/feature_resolver.go`. The real convention is `<domain>.resolvers.go`, which the same file states elsewhere.
- **Config:** it says `config/config.json`, but only `config/config.example.json` exists.
- **Setup command:** it runs `make docker-up && make migrate-up`. This contradicts the "database is remote, no docker-up needed" line, and the root file's ban on `migrate-up`. Pick one story.
- **Test paths:** `test/repositories/` is listed but wasn't in the directory listing I read, which was truncated to the first 40 lines. Check it.
- **Missing pieces:**
  - The `messaging` schema and resolvers are not mentioned in the schema-first section, only `schema.graphql`.
  - There is no mention of the `*.sqlx.bak` leftovers in `repositories/postgres/`.

## 3. `frontend/CLAUDE.md`: 68/100 (C)

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 15/20 | The scripts match `package.json`. `test:browser`, `test:all` and `demo:*` are documented only in passing. |
| Architecture clarity | 10/20 | The tree is badly out of date. |
| Non-obvious patterns | 15/15 | Excellent. |
| Conciseness | 6/15 | Long paragraphs of bug history and per-incident narrative. |
| Currency | 10/15 | See the list below. |
| Actionability | 12/15 | Mostly concrete, with file references. |

**Factual errors (verified):**
- **Prerender:** it says `+layout.ts # Layout config (prerender = true)`. The actual value is `prerender = false`.
- **Architecture tree:**
  - It lists `AGGridTest.svelte`, which doesn't exist.
  - It shows `shadcn/ (button/)` and only a `content/` query folder.
  - The real tree has about 45 components, `queries/{bible,categories,content,messaging,perspectives,users}`, and `auth/`, `theme/`, `messaging/`, `onboarding/`, `stores/`, `services/`, `data/` under `lib/`.
- **TanStack Query:**
  - It says "v5+", but `package.json` has `^6.2.4`.
  - The `isLoading`/`isPending` note is framed around v5. Recheck it against v6 semantics.

**What checked out:**
- The `$lib/utils/grid-config.ts` `COLUMNS` claim.
- `grid-theme.ts`, `versionWatch.ts`, `gen-preset-css.mjs`, `vitest.config.browser.ts` and `static/_headers` / `_redirects`.
- `pollInterval` in `svelte.config.js`.
- The `@lucide/svelte` and AG Grid 32.x claims.

## 4. `.claude/CLAUDE.md`: 25/100 (F)
- It is a 3-line stub that duplicates the root file's `## graphify` section.
- It points to `.claude/skills/graphify/SKILL.md`, which doesn't exist in the checkout.
- Recommend deleting it or folding it into the root file.

---

## Recommended fixes, in priority order

1. **Backend, correctness:** fix the CORS statement, the Go version and toolchain lines, the Dockerfile version, the tree (`pkg/middleware`, the missing adapters), and the "Adding a New Feature" file names.
2. **Resolve the migrate contradiction.** Make the backend Setup block match the root's "never run `migrate-up` against the shared DB" rule, and drop `docker-up` from Setup.
3. **Frontend:** correct `prerender = false`, replace the stale tree with a short pointer or a 5-line summary, and update "TanStack v5+".
4. **Root:** fix the `&&` and `main`/`master` contradictions in the Branch Naming block. Add a Commands section for the root `make start/stop/demo-*` targets. Delete the "qmd retired" section.
5. **Root, tooling:** flag that hooks, subagents and GSD are local and untracked, or commit them. Otherwise the file describes tooling that cloud sessions don't have.
6. **Trim.** Move the PR-label process, the Deep Modules essays and the long bug-history paragraphs to `.docs/`. That would take about 30% off the three long files.
7. **Delete or merge** `.claude/CLAUDE.md`.

## Tips
- Prefer `path:symbol` pointers over trees, since trees rot fastest. Every stale item above except the version numbers is a tree or a recipe.
- Keep personal or machine-specific setup (like `open -a Docker`) in `.claude.local.md`.

Do you want me to apply fixes 1–4 and 7 as targeted edits? I'll show diffs first. I'd leave 5 and 6 for you to decide, since they depend on whether the tooling is meant to be committed.
