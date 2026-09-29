# CLAUDE.md quality report

## Summary
- **Files found:** 4: `./CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `.claude/CLAUDE.md`
- **Average score:** about 62/100
- **Files needing updates:** all 4. The backend file has the most errors.

I checked every file path, Makefile target, package script, config key and version number these files mention against the code. Most of the frontend file is accurate. The backend file has several claims that are now wrong. The root file's main problems are length and rules that contradict each other.

**What I couldn't check:** `.claude/hooks/`, `.claude/agents/`, `.claude/commands/`, `.claude/skills/` and `.claude/settings.json` are blocked by the sandbox and aren't tracked in git in this checkout. `.claude/get-shit-done/` and `.claude/scripts/sv-chrome.sh` don't exist here at all. So I couldn't confirm the hook scripts, the subagent names (`go-backend`, `graphql-designer`, …) or the vendored GSD files. If those files are meant to be committed, this snapshot is missing them.

---

### 1. `./CLAUDE.md` (project root): **64/100 (C)**

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 15/20 | The verification checklist is good; the `gh` guidance contradicts itself |
| Architecture clarity | 15/20 | Correctly hands stack details to the package files |
| Non-obvious patterns | 14/15 | Strong: migrations hit a shared DB, `gh pr edit` breaks, `pnpm --dir` |
| Conciseness | 4/15 | 247 lines / 25 KB, mostly process policy; PR and label rules are repeated in 3–4 places |
| Currency | 8/15 | See below |
| Actionability | 8/15 | Contradictory instructions (below) |

**Contradictions, checked against the repo:**
- Line 100 says "`git checkout main && git pull origin main`", but the only local branch is `master`, and line 21 of the same file says so.
- Line 135 bans `&&`-chained commands, but lines 100 and 233 and `backend/CLAUDE.md:63` all use `&&`.
- Line 23 says "Always use `gh` CLI" and the examples show `gh pr create`. Line 218 then says a hook blocks `gh pr create`, so you must use `gh api`. Line 72 already assumes `gh api`.
- Line 164 says `make install-hooks` works "from `backend/`". That's true, since the target is only in `backend/Makefile`, not the root one. But the root `Makefile` has other targets (`start`, `stop`, `status`, `logs`, `demo-*`), and apart from the `demo-*` ones they aren't mentioned anywhere.

**Out of date or dead content:**
- The `## Context Lookup (graphify)` section (lines 15–17) only says "qmd is fully retired". It can be deleted.
- `graphify` isn't installed in this environment and `graphify-out/` doesn't exist (it's gitignored). The rule "after modifying code, run `graphify update .`" (line 246) has no condition attached, so it will fail wherever the tool is missing.
- The graphify section appears twice, here and in `.claude/CLAUDE.md`.

**Recommendations:** Resolve the three contradictions. Move the PR/label/demo policy (lines 31–97 and 173–180) into `.docs/PR_WORKFLOW.md` and link to it. Delete the qmd stub. Make the graphify step conditional on the tool and graph existing.

---

### 2. `backend/CLAUDE.md`: **55/100 (C)**

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 14/20 | All the Makefile targets exist; the setup line is dangerous |
| Architecture clarity | 10/20 | The directory tree is badly out of date |
| Non-obvious patterns | 14/15 | The paginator `err` gotcha, directive arg reflection and gqlgen collision notes are excellent |
| Conciseness | 11/15 | Reasonable |
| Currency | 3/15 | Many facts are wrong, listed below |
| Actionability | 8/15 | The "Adding a new feature" file names are wrong |

**Wrong compared with the code:**

| Claim | Reality |
|---|---|
| L63: `make docker-up && make migrate-up` as setup | Directly contradicts the root rule "never run `make migrate-up`" and L96 "no `make docker-up` needed". An agent following it would migrate the **shared Sevalla database**. |
| L14: `internal/middleware/` | Doesn't exist. Middleware is in `internal/adapters/web/middleware/` and `pkg/middleware/`. |
| Tree is missing directories | Not listed: `adapters/{auth,realtime,wikidata,web}`, `graphql/{dataloader,directives}`, `ports/services/`, `internal/demo`, `cmd/seed-demo`, `cmd/seed-bible`, `pkg/logger` |
| L39, L41: `adapters/graphql/*.resolvers.go`, `adapters/graphql/helpers.go` | Both are actually under `adapters/graphql/resolvers/` |
| L57: User/Category repos "use hand-rolled `encodeCursor`/`decodeCursor`" | Those functions don't exist anywhere, and neither repo has cursor code |
| L151: "Opaque base64 `cursor:<id>`… helpers in `helpers.go`" | Out of date: `helpers.go` now builds `paginator.Rule`s for gorm-cursor-paginator |
| L87: config from `config/config.json`; required: `DATABASE_URL` only | The file is `config/config.example.json`, overridable with `CONFIG_PATH`. `JWT_SECRET` and `CLERK_SECRET_KEY` are required in production, and `CORS_ORIGINS`, `APP_ENV`, `DEMO_MODE` and others exist too. |
| L102: "one `schema.graphql`" | `gqlgen.yml` now lists `schema.graphql` **and** `messaging.graphql`. The collision still happens for `schema.graphql`, but the "real fix" has already been started. |
| L133: CORS "allows all origins (`*`)" | Out of date: `main.go:302` restricts origins to `secCfg.CORSOrigins` |
| L48: "go-playground/validator" | Not in `go.mod` |
| L48, L182: `go 1.25` minimum | `go.mod` says `go 1.26` |
| L185: Dockerfile uses `golang:1.26-alpine` | It actually uses `golang:1.27-alpine`, while `toolchain` is `go1.26.0`. The versions have drifted apart, which breaks the file's own rule on L189. |
| L124, L127: `postgres/feature_repository.go`, `resolvers/feature_resolver.go` | The real naming is `gorm_feature_repository.go` and `feature.resolvers.go`. The new `ports/services/` step is missing. |

**Recommendations:** Remove `make migrate-up` from the setup line (this is the most important fix). Regenerate the directory tree. Fix the table above. Replace the out-of-date cursor section with a single line.

---

### 3. `frontend/CLAUDE.md`: **72/100 (B)**

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 17/20 | All scripts exist; `test:browser`, `test:coverage`, `build`, `format` and `demo:*` aren't listed in Commands |
| Architecture clarity | 11/20 | The directory tree is badly out of date |
| Non-obvious patterns | 15/15 | Excellent: `$effect` tracking, bits-ui Escape handling, stale chunks, jsdom and AG Grid |
| Conciseness | 5/15 | 254 lines; many entries are long incident write-ups ("Bug history…", "multi-session SDD effort…") |
| Currency | 11/15 | Nearly every file path it cites exists (I checked about 30) |
| Actionability | 13/15 | |

**Wrong compared with the code:**
- **L11: `+layout.ts` says "prerender = true"**. The file actually sets `prerender = false; ssr = false; csr = true`.
- **L18: `AGGridTest.svelte`** doesn't exist. The tree is also missing about 40 components, the `auth/ discover/ interlinear/ messaging/ onboarding/ theme/` component folders, the `lib/{auth,theme,stores,services,messaging}` folders, the `compare/ discover/ messages/` routes, and the query folders `bible/ messaging/`. It lists `shadcn/` as just `button/`, but there are 8 primitives.
- **L196: `_headers` "caps index.html at `s-maxage=0`"**. The actual catch-all is `no-cache, must-revalidate`, which L200 of the same file correctly describes. The two paragraphs disagree with each other.
- The CSP gotcha (L187) and the claim that the PWA service worker is never registered (L208) match the current code (`registerType: 'autoUpdate'` is set, but I found no registration call).

**Recommendations:** Fix the `prerender` line and replace the tree with a short, stable one (top-level folders only). Cut the incident narratives down to one rule each. Add `test:browser`, `build` and `format` to Commands.

---

### 4. `.claude/CLAUDE.md`: **55/100 (C)**

It's 3 lines pointing at `.claude/skills/graphify/SKILL.md`, which I couldn't read because of the sandbox. It duplicates the root `## graphify` section. **Recommendation:** merge it into the root section and delete this file. A second project-level CLAUDE.md that's easy to overlook just invites drift.

---

## Priority fixes
1. **`backend/CLAUDE.md:63`:** remove `make migrate-up` (and `make docker-up`) from the setup line. As written, it tells agents to change the shared dev database.
2. The backend's out-of-date facts: CORS, config file/required env vars, Go versions, directory paths, cursor helpers, feature file names.
3. The root file's contradictions: `main` vs `master`, the `&&` ban, and `gh pr create` vs `gh api`.
4. The frontend's `prerender` claim and its directory tree.
5. Shorten the root and frontend files by moving policy and incident history into `.docs/`.

Two tips:
- Pressing `#` during a session adds a learning to CLAUDE.md.
- Personal preferences belong in `.claude.local.md`. `.gitignore` currently ignores only `.claude/*.local.md`, not a root `.claude.local.md`, so that pattern would need adding.

Want me to apply these fixes? I'd show each change as a diff first. I'd suggest starting with #1–#4, since they're factual corrections, and leaving the restructuring in #5 for your call.
