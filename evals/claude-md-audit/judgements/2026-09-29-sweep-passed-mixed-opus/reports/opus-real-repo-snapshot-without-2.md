# CLAUDE.md audit report

I audited 4 files (703 lines) and checked about 90 of their claims against the code. Overall grade: **C+**. Most of the gotchas are specific, still true, and useful. But the structural and reference sections have fallen well behind the code, and a few instructions contradict each other or the code in ways that will send an agent the wrong way.

| File | Lines | Grade | Main problem |
|---|---|---|---|
| `CLAUDE.md` (root) | 246 | B− | Too long. Points at tooling that isn't in the repo |
| `backend/CLAUDE.md` | 201 | **D+** | Many out-of-date facts: CORS, Go versions, paths, config, pagination |
| `frontend/CLAUDE.md` | 253 | B | The architecture tree is old and a few numbers are wrong. The gotchas are very good |
| `.claude/CLAUDE.md` | 3 | C | Points to a skill file that isn't in the repo |

**Couldn't check:** `.claude/settings.json`, `hooks/`, `skills/`, `commands/` and `agents/` are blocked by the sandbox and aren't tracked in git here. So I couldn't confirm the hook descriptions (`deny-env-read.sh`, `require-session-reflection-before-pr.sh`, etc.) or the subagent names in the delegation table.

---

## 🔴 Wrong: these will cause bad actions

### backend/CLAUDE.md
1. **CORS (line 133):** the file says it "Currently allows all origins (`*`)". The code actually uses `cors.Handler` with `AllowedOrigins: secCfg.CORSOrigins` (`cmd/server/main.go:302`), set by the `CORS_ORIGINS` env var. This section is out of date and should be removed or rewritten.
2. **Go versions (lines 48, 181–185):** the file says `go 1.25` / `golang:1.26-alpine`. `go.mod` actually says `go 1.26` / `toolchain go1.26.0`, and the Dockerfile says `golang:1.27-alpine`. The Dockerfile image is now newer than the toolchain, which is exactly the mismatch this section says to avoid.
3. **The database instructions contradict each other.** The Setup block (line 63) says `make docker-up && make migrate-up`. Line 96 says "No `make docker-up` needed… Migrations run against the remote DB". The root file forbids `make migrate-up` entirely because it changes the shared Sevalla DB. An agent following the backend Setup block would mutate shared state. The Setup and Migrations blocks should be removed or fenced off.
4. **Config file (line 87):** the file says `config/config.json`, which doesn't exist. `main.go:78-80` reads `CONFIG_PATH` and falls back to `config/config.example.json`. The file in the repo is `internal/config/config.example.json`.
5. **"Required: `DATABASE_URL`. Optional: `YOUTUBE_API_KEY`, `DATABASE_PASSWORD`" (line 88):** this leaves out `JWT_SECRET`, `CLERK_SECRET_KEY`, `CORS_ORIGINS`, `APP_ENV`, `DEMO_MODE` and more. Two of those are required in production (`security.go:33,46`). Better to point to `.env.example` and drop the list.
6. **Pagination (line 57):** the file says "`GormUserRepository`/`GormCategoryRepository` still use hand-rolled `encodeCursor`/`decodeCursor`". Neither function exists anywhere in `internal/` now. The cursor-pagination gotcha on line 151 ("Helpers in `helpers.go`") is out of date too: `helpers.go` now builds `paginator.Rule`s.

### frontend/CLAUDE.md
7. **`+layout.ts` (line 11):** the file says `prerender = true`. The actual file has `prerender = false; ssr = false; csr = true`.
8. **`rowHeight` (line 230):** the file recommends "a 64px `rowHeight` (not something closer to 45–50px)". The actual value is `rowHeight: 49` in `grid-theme.ts:31`. Either the gotcha is out of date (fonts or line-height changed) or the code has regressed. Someone needs to decide which, because right now the two disagree.
9. **"The four `[data-theme]` blocks" (line 169):** `app.css` has about 26 `[data-theme=…]` blocks and `presets.ts` has 28 `id:` entries.

### Root CLAUDE.md
10. **Vendored GSD (lines 153–157):** `.claude/get-shit-done/`, its `VERSION` file and `.claude/commands/gsd/` are not in the repo. The rule tells agents not to reinstall GSD, but the paths it describes don't exist.
11. **`.claude/scripts/sv-chrome.sh` (line 188):** not in the repo, so authenticated self-verification can't follow this pointer.

---

## 🟠 Out of date: misleading but lower risk

**backend/CLAUDE.md**
- **Architecture tree:**
  - `internal/middleware/` doesn't exist; it's `pkg/middleware/`.
  - `pkg/logger` is missing from the tree.
  - Missing adapters: `auth`, `realtime`, `web`, `wikidata`.
  - Missing internal packages: `internal/demo` and `internal/perf`.
- **Line 41:** the file says `adapters/graphql/helpers.go`. The real path is `adapters/graphql/resolvers/helpers.go`; `modelToCreatePerspectiveInput` is at line 430.
- **Line 102:** the file says there is "one `schema.graphql`". There's now a `messaging.graphql` too, which has its own `messaging.resolvers.go`. The advice to split the schema by domain has been partly done, so this paragraph needs a refresh.
- **"Adding a New Feature" steps 4 and 6:** the filenames are wrong. They should be `gorm_feature_repository.go` (not `feature_repository.go`) and `feature.resolvers.go` (not `feature_resolver.go`).
- **Stack line:** it lists `go-playground/validator` and `golang-migrate` as libraries. Neither is in `go.mod`; `migrate` is only used as an external CLI.
- **`make test` / `make test-coverage`:** these are correct. `make migrate-up-n`, `make migrate-down-n` and `make test-duplication` exist but aren't documented.

**frontend/CLAUDE.md**
- **Architecture tree:**
  - `AGGridTest.svelte` no longer exists.
  - Missing from `lib/`: `auth/`, `theme/`, `messaging/`, `stores/`, `services/`, `onboarding/`, `data/`.
  - The shadcn folder has 8 primitives, not just `button/`.
- **Commands:** `test:browser`, `test:all`, `test:coverage`, `build`, `format` and `demo:*` are all real scripts but aren't listed, even though later sections depend on `test:browser` and `build`.

**Root CLAUDE.md**
- **Line 13:** "Claude loads root + the relevant package file per session" isn't quite how it works. Subdirectory CLAUDE.md files load on demand, when Claude reads files in that directory.
- **Migration numbering:** it says `ls backend/migrations/ | tail -5` and bans `&&` chaining, which is fine. But the later `pnpm-lock` recipe and the backend Setup block both use `&&` chains, which breaks the file's own rule.

---

## ✅ Checked and accurate (keep these)

**Backend**
- `extractResourceID` and `fieldByJSONTag` in `directives/auth.go`
- `clearConfigEnvVars` in `test/config/config_test.go`
- The gqlgen config: `layout: follow-schema`, the `JSON → graphql.Map` mapping, the `SortOrder` binding and `extraFields.PrimaryCategoryID`
- `first: Int = 10`
- The paginator v2.7.0 and `pageResult.Error` check
- `ReviewStatus` values
- The `go-version-file` setting in CI
- `make dev` uses air; `install-hooks` sets `core.hooksPath` to `.hooks`
- Demo Postgres on port 5434

**Frontend**
- Responsive tiers at 445, 640 and 900px; the `cardMode` breakpoint at 860px
- The `COLUMNS` single source of truth in `grid-config.ts`
- `setColumnsVisible` being called from effects
- `#stale-chunk-recovery` in `app.html`, `pollInterval`, `versionWatch`
- The capture-phase Escape handler in `InterlinearPassage.svelte`
- `isPending` in `OriginalLanguage.svelte`
- `PW_CHROMIUM_EXECUTABLE` and the `svelte-clerk` stub in the browser test config
- The browser test step in `frontend-test.yml`
- `max-w-screen-xl`
- shadcn at `shadcn/`, set in `components.json`
- Every file referenced in the Testing Gotchas section exists
- The Svelte 5, TanStack and Clerk-facade guidance matches the code

**Root:** every `.docs/*`, `frontend/docs/*`, `.claude/docs/*`, `.github` template, `docs/superpowers/...` plan and `FEATURE_BACKLOG.md` link resolves. `graphify-out/` and `.planning/phases/bugs/` are missing, but both are gitignored and the docs only use them when they exist, which is fine.

---

## 🟡 Structure and style

- **Root file is too long (246 lines).** Most of it is PR and label process (cloud vs. local, `needs-demo-video`, takeover), which matters only when opening a PR. Moving it to `.docs/PR_WORKFLOW.md` with a 5-line summary would cut the root file roughly in half.
- **The graphify content is split across three places:** a one-line stub near the top of the root file, a section at the bottom, and `.claude/CLAUDE.md`. Merge them into one. Also, the "qmd is fully retired" note is history and can go.
- **The "External references" line** sits under "Merge Conflict Patterns", which is the wrong section.
- **The Agent Delegation table** names five subagents that I couldn't confirm exist, because `.claude/agents` is blocked by the sandbox. Please check them.
- **Some backend sections duplicate `.docs/`:** Deep Modules is near-duplicated in both package files, and Go Version Management is long for four rules.
- **A few gotchas are war stories with a rule inside.** The "7 errors / 8 failing tests" story on frontend line 253 is an example. Cutting each down to the rule plus one clause of why would save tokens without losing guidance.

## Suggested fix order
1. Fix or delete the backend CORS, Go version, config path, env var and cursor-helper claims, and remove `make docker-up && make migrate-up` from the backend Setup block (finding 3).
2. Settle the `rowHeight` conflict between the doc (64) and the code (49), and fix the `prerender` line.
3. Regenerate both architecture trees from `ls`, or replace them with a short "where things live" list that goes out of date less easily.
4. Remove or restore the GSD vendoring and `sv-chrome.sh` references.
5. Move the PR process out of the root file and merge the graphify sections.

I haven't edited anything. I can make the 🔴 and 🟠 fixes as one docs commit if you'd like.
