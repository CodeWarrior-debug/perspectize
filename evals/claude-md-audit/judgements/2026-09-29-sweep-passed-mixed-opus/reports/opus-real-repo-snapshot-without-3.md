# CLAUDE.md audit report

There are four files: `CLAUDE.md` (246 lines), `backend/CLAUDE.md` (201), `frontend/CLAUDE.md` (253) and `.claude/CLAUDE.md` (3). I checked their claims against the code, Makefiles, configs and CI workflows. Most of the gotchas are accurate and detailed. The main problems are **stale facts in the older, structural sections** and **a few places where the files contradict each other**. An agent would act on these wrongly.

## Scores

| File | Accuracy | Consistency | Signal/noise | Overall |
|---|---|---|---|---|
| `CLAUDE.md` (root) | B+ | C | C+ (long; process-heavy) | **B−** |
| `backend/CLAUDE.md` | C | C− | B | **C+** |
| `frontend/CLAUDE.md` | B− | B | B+ | **B** |
| `.claude/CLAUDE.md` | ? (couldn't check) | C (duplicates root) | – | **C** |

## 🔴 Wrong: contradicted by the code

**backend/CLAUDE.md**
1. **CORS (line 133):** it says CORS "allows all origins (`*`)" and is configured in `main.go`. In fact `main.go:302` uses `secCfg.CORSOrigins` from `internal/config/security.go:57` (`CORS_ORIGINS` env var). It only falls back to `*` when that variable is unset. The instruction to "restrict before deploying" is out of date.
2. **Go versions (lines 48, 182–185):** it says `go 1.25` minimum and a `golang:1.26-alpine` Dockerfile. `go.mod` actually says `go 1.26` / `toolchain go1.26.0`, and the Dockerfile uses `golang:1.27-alpine`. So the Dockerfile is now *ahead* of the toolchain, which breaks the "keep them matched" rule the doc itself sets out.
3. **`helpers.go` location (line 41):** it says `adapters/graphql/helpers.go`. The real file is `adapters/graphql/resolvers/helpers.go`.
4. **Cursor helpers (lines 57, 151):** it says `GormUserRepository`/`GormCategoryRepository` "still use hand-rolled `encodeCursor`/`decodeCursor`" and that these live in `helpers.go`. Neither function exists anywhere in the codebase any more.
5. **Config file (line 87):** it says `config/config.json`. That file doesn't exist. `main.go:80` defaults to `config/config.example.json` and can be overridden with `CONFIG_PATH`, which the doc never mentions. The list of optional env vars also leaves out `CLERK_SECRET_KEY`, `CORS_ORIGINS` and others that are in `.env.example`.
6. **Architecture tree (lines 7–17):** `internal/middleware/` doesn't exist; middleware is in `adapters/web/middleware/` and `pkg/middleware/`. The tree also leaves out `auth/`, `realtime/`, `web/`, `wikidata/`, `dataloader/`, `directives/`, `internal/demo`, and `cmd/seed-*`.
7. **"Adding a New Feature" (lines 124, 127):** it gives the filenames `postgres/feature_repository.go` and `resolvers/feature_resolver.go`. The real conventions are `gorm_feature_repository.go` and `feature.resolvers.go`, and the same file's Deep Modules section already says the latter. It also sends tests only to `test/`, but many are co-located `_test.go` files under `internal/`.

**frontend/CLAUDE.md**
8. **AG Grid `rowHeight` (line 230):** it says to use "a 64px `rowHeight` (not something closer to 45-50px)". The code has `rowHeight: 49` (`grid-theme.ts:31`), and a comment there says it was deliberately trimmed from 64 *and points to this CLAUDE.md gotcha*. An agent following the doc would undo that fix.
9. **`_headers` (line 196):** it says `index.html` is capped with `s-maxage=0`. The real rule is `/* Cache-Control: no-cache, must-revalidate`. Line 200 of the same file describes this correctly, so the file contradicts itself.
10. **PWA (line 208):** it says "#312's `skipWaiting`/`clientsClaim`". Those settings are in `vite.config.ts` and are dormant only because the service worker is never registered. The substance is right; the wording suggests the settings are gone.
11. **Theme blocks (line 169):** it says "the four `[data-theme]` blocks". `app.css` has **26** (and there are 28 presets). An agent told to check "four blocks" would miss most of them.
12. **Architecture tree (lines 8–27):** `AGGridTest.svelte` doesn't exist. `+layout.ts` sets `prerender = false; ssr = false`, not `prerender = true`. The tree also leaves out most of `lib/`: `auth`, `theme`, `stores`, `services`, `messaging`, `onboarding`, and the `compare`/`discover`/`messages` routes. `shadcn/` has 8 components, not only `button/`.
13. **TanStack version (line 107):** it says "v5+". `package.json` has `@tanstack/svelte-query ^6.2.4`. This is minor, but worth updating since the section is marked CRITICAL.

## 🟠 The files contradict each other

- **Migrations:** root line 139 says **never** run `make migrate-up` (it hits the shared Sevalla DB). But the backend Setup section (line 63) runs `make migrate-up`, lines 75–79 list it under "Migrations", and line 96 says "Migrations run against the remote DB". An agent that reads only the backend file would change the shared database.
- **Docker:** backend line 63 runs `make docker-up` as setup, but line 96 says "No `make docker-up` needed".
- **"No chained bash commands" (root line 135)** is broken by the docs' own examples: root line 100 (`git checkout main && git pull …`), backend lines 63 and 71 (`make fmt && make lint`), and frontend line 66 (`cd frontend && pnpm exec`).
- **Creating PRs:** root line 42 shows `gh pr create`. Lines 72 and 218 say PRs are created via `gh api` because a hook blocks `gh pr create`. The command block should show the `gh api` form.
- **`schema.resolvers.go` collision (backend lines 100–106):** this can happen, since `gqlgen.yml` has `layout: follow-schema` and `schema.graphql` is one file. But line 100 says to "implement resolvers in `resolvers/`" with no hint of the per-domain split until two paragraphs later.
- **graphify** is covered three times: root line 17, root lines 238–246, and `.claude/CLAUDE.md`. Both root and `.claude/` locations get loaded, so the pointer at line 17 is just noise.

## 🟡 Couldn't check in this checkout

These paths are neither tracked in git nor readable here (the sandbox masks `.claude/{hooks,settings.json,skills,commands}`):
- `.claude/hooks/*.sh` (5 hooks described in detail), `.claude/scripts/sv-chrome.sh`, `.claude/get-shit-done/`, `.claude/commands/gsd/`, `.claude/skills/graphify/SKILL.md`.

If they're meant to be shared, they should be committed. If they're local-only, the root file should say so, because it currently presents them as repo features.

## ✅ Checked and accurate

All the linked `.docs/*`, `frontend/docs/*` and `.claude/docs/*` files exist. These also match the code:
- the `.hooks/pre-commit` behaviour (gofmt, prettier, hex block, `hex-ok:`) and `make install-hooks`
- CI's `gofmt -l .` Build step, `go-version-file`, the browser-mode step in `frontend-test.yml`, and the `demo-e2e` job
- `extractResourceID`/`fieldByJSONTag`, the `ReviewStatus` values, `extraFields: PrimaryCategoryID`, `clearConfigEnvVars`, and `Paginate()` being used only by the content and perspective repos
- `COLUMNS: readonly ColumnMeta[]` with the other lists derived from it, the 445/640/900 tiers, the 860px `cardMode`, `max-w-screen-xl`, and `headerMinWidth`
- `$lib/auth` being free of `svelte-clerk`, `versionWatch`, `#stale-chunk-recovery`, `pollInterval`, `_redirects`, and the vitest browser config (`PW_CHROMIUM_EXECUTABLE`, the `svelte-clerk` alias)
- every component and test file cited in the gotchas

**Heads-up:** the "shared Sevalla DB" guidance is still correct: the Neon migration plan (`docs/superpowers/plans/2026-09-03-neon-postgres-migration-plan.md`) has 0 of 47 steps checked. When it lands, root line 139 and backend lines 92–96 will all need updating.

## Recommended fixes, by impact

1. Delete or rewrite the Migrations and Setup blocks in `backend/CLAUDE.md` so they match the root "never migrate-up" rule. That's the one that can do real damage.
2. Change the `rowHeight` gotcha to 49px and state the real margin.
3. Fix the CORS section, the Go/Dockerfile versions and the `config.json` path, and remove the `encodeCursor` references.
4. Regenerate both architecture trees, or replace them with a short "key dirs" list that is less likely to go stale.
5. Pick one rule on `&&` and make the examples follow it.
6. Remove the duplicate graphify pointer (root line 17) and decide whether `.claude/CLAUDE.md` is needed.
7. Remove process duplication from the root file: the PR label rules and the hook descriptions could move to `.docs/`. At about 250 lines it's heavy for something loaded every session.

I haven't changed anything. I can apply any of these fixes if you'd like.
