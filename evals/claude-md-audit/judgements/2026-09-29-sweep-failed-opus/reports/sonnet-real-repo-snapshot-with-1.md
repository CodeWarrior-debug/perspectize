## CLAUDE.md Quality Report

I checked each claim against the code where I could. I could not verify anything under `.claude/` (hooks, agents, commands, skills, `settings.json`). Those paths are unreadable in this sandbox and aren't tracked in the snapshot. I also did not run `make graphql-gen` or the build, since that would modify files.

### Summary
- Files found: 4 (`./CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `.claude/CLAUDE.md`)
- Average score: about 62/100
- Files needing update: 3 of 4

| File | Lines | Score | Grade |
|---|---|---|---|
| `./CLAUDE.md` | 246 | 66 | C |
| `backend/CLAUDE.md` | 201 | 58 | C |
| `frontend/CLAUDE.md` | 253 | 62 | C |
| `.claude/CLAUDE.md` | 4 | 62 | C |

The gotchas sections are the strongest part. Most named files and tests exist (`clearConfigEnvVars`, `extractResourceID`, `versionWatch.ts`, `css-agreement.test.ts`, `OriginalLanguage.svelte`). The weakest parts are the architecture maps, the version and CORS facts, and several rules that contradict each other.

### 1. `./CLAUDE.md` (root): 66/100

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 10/20 | The root `Makefile` targets (`make start`, `stop`, `status`, `demo-*`) are never listed. |
| Architecture clarity | 12/20 | Only a two-line stack summary. `tools/`, `data/`, `testdata/`, `ios/` and `android/` are not mentioned. |
| Non-obvious patterns | 13/15 | Strong: git branch naming, `gh` API workarounds, migration policy. |
| Conciseness | 6/15 | About 25KB. Long PR-label and cloud-versus-local process text dominates. |
| Currency | 11/15 | See stale references below. |
| Actionability | 14/15 | Mostly concrete. |

**Issues (verified against the repo):**
- **Direct contradiction with `backend/CLAUDE.md`.** Root says never run `make migrate-up`, because the database is the shared Sevalla dev database. Backend's Setup block runs `make docker-up && make migrate-up`, and its Configuration section says "Migrations run against the remote DB."
- **Rule broken by its own examples.** Root says never chain commands with `&&`. Root's own branch and merge-conflict snippets do, and so do `backend/CLAUDE.md`'s `make fmt && make lint` and setup lines.
- **`gh pr create` is shown as the example** (line 42) while the same file says PRs must be created via `gh api` and a hook denies `gh pr create`. Line 35 also points to "the commands above" for a `gh api … /pulls` POST that only appears near line 218.
- **Missing files:**
  - `.claude/get-shit-done/` does not exist, but the file describes it as a vendored frozen subset.
  - `.claude/scripts/sv-chrome.sh`, cited for authenticated browser verification, does not exist.
  - `.planning/phases/bugs/BACKLOG.md` is mandatory for logging bugs, but the `bugs/` directory does not exist and the file gives no bootstrap step.
- **Dead "Context Lookup (graphify)" section.** It only says qmd is retired and points to another section. `graphify-out/` doesn't exist, so the graphify rules are conditional and inert here.
- **`make install-hooks` has no location.** The target exists only in `backend/Makefile`. Root's checklist says to run it without saying from where, and running it from the root fails.
- **Unverifiable:** the subagent names (`go-backend`, `graphql-designer`, `db-migration`, `code-reviewer`, `test-writer`), all `.claude/hooks/*.sh` claims, and the plugin and settings claims.

**Recommended:**
- Add a short "Root commands" block for `make start/stop/status` and the `demo-*` targets.
- Delete the qmd and graphify redirect section.
- Move the PR-label and cloud-session process to `.docs/` and leave a pointer, cutting roughly a third of the file.
- Resolve the migrate-up contradiction in one place.

### 2. `backend/CLAUDE.md`: 58/100

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 13/20 | The Makefile targets shown do exist. The Setup line conflicts with the root policy. |
| Architecture clarity | 8/20 | The tree is materially out of date. |
| Non-obvious patterns | 13/15 | Good gotchas (pagination `err`, directive arg introspection, `extraFields`). |
| Conciseness | 9/15 | Deep-modules prose repeats what the frontend file says. |
| Currency | 6/15 | Several confirmed factual errors. |
| Actionability | 9/15 | The "Adding a New Feature" paths are wrong. |

**Confirmed errors:**
- **CORS (security-relevant).** The file says main.go "currently allows all origins (`*`)". `cmd/server/main.go:302-303` uses `AllowedOrigins: secCfg.CORSOrigins` (marked C-05). The warning is stale and misleading.
- **Go versions.** The file says "Go 1.25+", `go 1.25`, and a `golang:1.26-alpine` Dockerfile. Actual values are `go 1.26` and `toolchain go1.26.0` in `go.mod`, and `golang:1.27-alpine` in the Dockerfile.
- **`internal/middleware/` doesn't exist.** The middleware lives in `pkg/middleware/`.
- **Architecture tree omissions.**
  - Under `internal/adapters/`: `auth`, `realtime`, `web`, `wikidata`.
  - Under `internal/`: `demo`, `perf`.
  - Under `cmd/`: `seed-bible`, `seed-demo`.
  - Under `pkg/`: `logger`, `middleware`.
  - Also missing: `messaging.graphql` and the `dataloader`, `directives` and `model` packages.
- **"Adding a New Feature" paths are wrong.**
  - Step 4 names `postgres/feature_repository.go`. The real pattern is `gorm_*_repository.go`, and the `*.sqlx.bak` files are the retired ones.
  - Step 6 names `resolvers/feature_resolver.go`. The real pattern is `{domain}.resolvers.go`.
  - This also contradicts the file's own "One file per domain" rule.
- **The `schema.resolvers.go` explanation is partly outdated.** It says "one `schema.graphql`". `gqlgen.yml` lists both `schema.graphql` and `messaging.graphql`, so `follow-schema` would also want a `messaging.resolvers.go`. The advice may still hold, but the reasoning is wrong.
- **Internal contradiction.** The Setup block runs `make docker-up`, while Configuration says no `make docker-up` is needed because the database is remote.

**Recommended:** replace the tree with the real one (or link `.docs/ARCHITECTURE.md` only), correct the CORS and Go-version lines, fix the feature-checklist paths, and add auth, messaging and realtime and the seed commands.

### 3. `frontend/CLAUDE.md`: 62/100

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 13/20 | Correct scripts. `test:browser` and `demo:test` are buried or missing from the Commands block. |
| Architecture clarity | 7/20 | The tree is badly stale. |
| Non-obvious patterns | 15/15 | The best content of any file. |
| Conciseness | 5/15 | Long bug-history narratives, for example the 10-dispatch `pnpm install` story. |
| Currency | 10/15 | The tree is stale, otherwise good. |
| Actionability | 12/15 | Mostly concrete. |

**Confirmed errors:**
- **The architecture tree is badly out of date.**
  - It shows three components and `shadcn/(button/)` only. The repo has about 50 components, with subdirectories `auth`, `discover`, `interlinear`, `messaging`, `onboarding` and `theme`.
  - `AGGridTest.svelte` no longer exists.
  - `lib/` has `auth`, `data`, `messaging`, `onboarding`, `services`, `stores` and `theme`, which the tree omits.
  - `queries/` has `bible`, `categories`, `messaging`, `perspectives` and `users`, but the tree shows only `content/`.
- **Wrong prerender claim.** The tree says `+layout.ts` sets `prerender = true`. It is actually `prerender = false` (`frontend/src/routes/+layout.ts:1`).
- **`frontend/STRUCTURE.md` exists but isn't referenced.** It may be the better home for the tree.

**Recommended:** replace the tree with a top-level-only sketch and point to `STRUCTURE.md`, fix the prerender line, and move the long bug-history anecdotes out, since the rule and the example file are enough.

### 4. `.claude/CLAUDE.md`: 62/100
It is four lines and only says to use the graphify skill on `/graphify`. It duplicates the graphify section at the bottom of the root file. I couldn't verify `.claude/skills/graphify/SKILL.md`. Consolidate it into one place.

### Suggested fixes, by priority
1. Correct `backend/CLAUDE.md`'s CORS claim and Go versions.
2. Resolve the `migrate-up` and `docker-up` contradiction across root and backend.
3. Refresh the backend and frontend architecture trees.
4. Fix the wrong file patterns in "Adding a New Feature".
5. Remove the dead references (`get-shit-done`, `sv-chrome.sh`, the qmd stub, `AGGridTest`).
6. Trim the root file's process text and the frontend anecdotes.

Do you want me to apply these edits? I'd start with 1–5, which are all factual corrections. Item 6 is judgment-based, so I'd show you a diff first.
