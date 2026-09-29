# CLAUDE.md Quality Report

## Summary
- **Files found:** 4 (`CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `.claude/CLAUDE.md`)
- **Average score:** about 61/100
- **Files needing update:** 4

The gotchas are the strongest part of all four files. They're specific, they point at real files, and nearly every file they reference exists. The weakest part is drift: version numbers, directory trees and a few config values no longer match the code. Two instructions also contradict each other in ways that could cause real damage.

**What I couldn't check:** `.claude/settings.json`, `hooks/`, `agents/`, `skills/` and `commands/` are hidden by the sandbox in this session, so I couldn't confirm the hook scripts, subagent names or the graphify skill that the root file describes.

---

## 1. `./CLAUDE.md` (root): 71/100 (B-)

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 16/20 | Verification checklist is correct and matches CI (`gofmt -l`, `go test`, `pnpm run test:run`) |
| Architecture clarity | 14/20 | Good pointers to the package files and `.docs/` |
| Non-obvious patterns | 14/15 | The note that nothing on Sevalla runs migrations, the `master` vs `main` branch gotcha, and `core.hooksPath` being unset in cloud sessions are all useful |
| Conciseness | 6/15 | 247 lines. About 40% is PR, labelling and cloud-vs-local policy prose |
| Currency | 11/15 | See issues |
| Actionability | 10/15 | Contradicts itself in places |

**Issues:**
- **It breaks its own "no `&&` chaining" rule** (`CLAUDE.md:135`). Line 100 says `git checkout main && git pull origin main && git checkout -b`. That example also checks out `main`, but line 21 says the local default branch is `master`, which matches the actual repo.
- **Conflicting advice on `gh pr create`.** Line 42 lists it as the PR command, but the hook (line 218) blocks it and line 72 says PRs are created via `gh api`.
- **Stale reference:** `.claude/scripts/sv-chrome.sh` (line 184) doesn't exist in this checkout.
- **Mac-only instruction:** line 139 says to start Docker with `open -a Docker`.
- **Redundant section:** "Context Lookup (graphify)" (lines 15–17) only points to the section at the bottom, and qmd is described as retired. It can go.
- **Dependent on local state:** `graphify-out/` is gitignored and missing here. The rule is written conditionally, so that's fine, but a fresh checkout gets nothing from it.
- **Misplaced section:** "External references" sits under "Merge Conflict Patterns".

**Recommended:**
- Move PR/label policy (lines 31–38, 80–86, 173–180) into `.docs/PR_WORKFLOW.md` and leave a 3-line summary here.
- Fix the branch command to use `origin/main` without `&&`.
- Replace the `gh pr create` example with the `gh api` form.

---

## 2. `./backend/CLAUDE.md`: 60/100 (C)

This file has the most drift, and one instruction in it is dangerous.

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 11/20 | The Setup line would change the shared database |
| Architecture clarity | 11/20 | The directory tree and several paths are wrong |
| Non-obvious patterns | 14/15 | The paginator `.Error` gotcha, the directive arg reflection note and the gqlgen test-client note all check out against the code |
| Conciseness | 11/15 | Reasonable |
| Currency | 4/15 | Many factual mismatches (below) |
| Actionability | 9/15 | |

**Issues, verified against the code:**

| Line | CLAUDE.md says | Actual code |
|---|---|---|
| 63, 96 | Setup runs `make migrate-up`; "Migrations run against the remote DB" | Root `CLAUDE.md:139` says **never** run `make migrate-up`, because it changes the shared Sevalla database. **This is the dangerous one.** |
| 14 | `internal/middleware/` | Doesn't exist. Middleware is in `pkg/middleware/` |
| 8–17 | Directory tree | Missing `adapters/{auth,realtime,web,wikidata}`, `internal/demo`, `cmd/seed-{bible,demo}`, `pkg/logger` |
| 39, 41 | `adapters/graphql/*.resolvers.go`, `adapters/graphql/helpers.go` | Both are under `adapters/graphql/resolvers/` |
| 102 | "one `schema.graphql`" | `gqlgen.yml` has two schemas (`schema.graphql` and `messaging.graphql`), so messaging is already split out. `layout: follow-schema` is correct |
| 48, 182 | Go 1.25+, `go 1.25` | `go.mod` says `go 1.26` |
| 185 | Dockerfile uses `golang:1.26-alpine` | `Dockerfile:2` uses `golang:1.27-alpine`, which doesn't match `toolchain go1.26.0`. This is a real inconsistency in the code, not only the docs |
| 3, 48 | PostgreSQL 17 | CI uses `postgres:17`, but `docker-compose.yml` uses `postgres:18` |
| 48 | Stack includes golang-migrate and go-playground/validator | Neither is in `go.mod`. `migrate` is an external CLI, so its install step should be documented |
| 57 | User/Category repos "use hand-rolled `encodeCursor`/`decodeCursor`" | Those functions only exist in `*.sqlx.bak` files. The User/Category repos have no pagination at all |
| 87 | `config/config.json` | Only `config/config.example.json` exists. It's the default path in `main.go:80`, and `CONFIG_PATH` overrides it |
| 88 | Optional env vars: `YOUTUBE_API_KEY`, `DATABASE_PASSWORD` | `.env.example` also has `CLERK_SECRET_KEY`, `JWT_SECRET`, `CORS_ORIGINS`, `DEMO_MODE`, `APP_ENV` and more |
| 133 | "CORS allows all origins… hardcoded in main.go" | CORS is set via `CORS_ORIGINS` (`config/security.go:57`) and defaults to `*` |
| 127 | Resolver file `feature_resolver.go` | The convention is `<domain>.resolvers.go` |

**Recommended:** Change the Setup line to `go mod download` and `make install-hooks` only, and remove the `docker-up`/`migrate-up` steps and the "migrations run against remote" sentence. Fix the tree, the paths and the versions. Document the `migrate` CLI install and `make migrate-up-n`/`migrate-down-n`.

---

## 3. `./frontend/CLAUDE.md`: 71/100 (B-)

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 15/20 | Missing `build`, `test:browser` (only mentioned deep in a gotcha), `format`, `demo:test` |
| Architecture clarity | 10/20 | Directory tree is badly out of date |
| Non-obvious patterns | 15/15 | Excellent. Rune/`$effect` traps, bits-ui Escape, `queryKey` mirroring, and the deploy cache and version-skew notes |
| Conciseness | 7/15 | 254 lines. Several gotchas include long bug-history stories that could be one line each |
| Currency | 11/15 | Most of the ~30 file references I checked exist, but some values have drifted |
| Actionability | 13/15 | |

**Issues:**
- **Line 11: `+layout.ts` has `prerender = true`.** The actual file has `prerender = false; ssr = false; csr = true`.
- **Lines 13–27: tree is out of date.** `AGGridTest.svelte` no longer exists. The tree also leaves out `auth/`, `theme/`, `messaging/`, `stores/`, `services/`, the query folders for `bible`/`categories`/`messaging`/`perspectives`/`users`, and the `compare`/`discover`/`messages` routes.
- **Line 230: the text recommends a 64px `rowHeight`, but `grid-theme.ts:31` is `49`.** The code comment even says it was trimmed from 64px and refers back to this CLAUDE.md gotcha, so the doc now contradicts the code that cites it.
- **Line 196 says `_headers` uses `s-maxage=0`.** The actual catch-all is `no-cache, must-revalidate`. Line 200 describes the current approach correctly, so the file contradicts itself.
- **Line 97 says "`$lib/auth` must stay free of `svelte-clerk`".** In fact `$lib/auth/useAuthState.ts` imports it, and only `index.ts` is kept clean, per its own header comment. The rule should say `$lib/auth/index.ts`.
- **Line 36: code breaks the rule.** The rule is that components never call `graphqlClient.request` inline, but `CategoryTypeahead.svelte` does. That's a fix for the code, not the doc.
- **Line 107** says "TanStack Query v5+". The installed version is `@tanstack/svelte-query ^6.2.4`, so this is fine but could be more precise.
- **Correct as written:** column tiers, the 860px `cardMode`, `max-w-screen-xl`, the `COLUMNS` single source of truth, the unregistered service worker, the CI browser-test step, and the shadcn alias.

**Recommended:** Regenerate the tree (or cut it to top-level folders only), fix `prerender`, `rowHeight` and `_headers`, and add a full Commands block.

---

## 4. `./.claude/CLAUDE.md`: about 40/100 (D)

This is a 3-line pointer to `.claude/skills/graphify/SKILL.md`, and it repeats the root file's `## graphify` section. I couldn't check the skill path because the sandbox hides it. **Recommendation:** fold this into the root graphify section and delete the file, so there's one place to maintain.

---

## Suggested priority
1. **Backend Setup line.** Remove `make docker-up && make migrate-up` so no agent runs migrations against the shared Sevalla database.
2. **Dockerfile vs `go.mod`.** Decide whether the Go version is 1.26 or 1.27. This is a code issue that the audit turned up.
3. Update the version numbers, paths and directory trees in the backend and frontend files.
4. Resolve the root file's contradictions (`&&` chaining, `main` vs `master`, `gh pr create`).
5. Trim the long policy prose and bug stories to improve conciseness.

Tip: use `.claude.local.md` for personal, machine-specific notes like `open -a Docker` and the Chrome profile setup, so the shared file stays portable.

Want me to draft the diffs for these updates? I'd start with the backend file.
