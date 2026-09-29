I found 4 CLAUDE.md files and checked their claims against the code. **Backend has the most stale facts; root and frontend are mostly accurate but far too long.** Nothing has been edited.

## Summary

| File | Score | Grade | Main problem |
|---|---|---|---|
| `./CLAUDE.md` | 68 | C | Contradicts `backend/CLAUDE.md` on migrations; too long |
| `backend/CLAUDE.md` | 58 | C | Several facts are outdated |
| `frontend/CLAUDE.md` | 67 | C | Directory map is outdated; too long |
| `.claude/CLAUDE.md` | 40 | D | Repeats the root file's graphify section |

**What I couldn't check:** the sandbox hides `.claude/hooks/`, `agents/`, `commands/`, `skills/` and `settings.json` from me. So I can't confirm the 5 hook scripts, the 5 subagents in the delegation table, the superpowers plugin setting, or `.claude/scripts/sv-chrome.sh`. `graphify-out/` and `.planning/phases/bugs/` are gitignored, so they're correctly absent.

---

## 1. `./CLAUDE.md` (root) — 68/100

| Criterion | Score | Notes |
|---|---|---|
| Commands | 15/20 | Verification checklist is good; `test:run`, `install-hooks` and `demo-*` targets exist |
| Architecture | 12/20 | Mostly points to the package files and `.docs/` (all 16 linked docs exist) |
| Non-obvious patterns | 14/15 | Useful: master/main branch naming, gh API workarounds, migration safety, pre-commit hook |
| Conciseness | 5/15 | 247 lines, about 60% of them on PR, label and planning process |
| Currency | 10/15 | See issues below |
| Actionability | 12/15 | Some rules contradict each other |

**Issues:**
- **It contradicts the backend file.** Root says "Never run `make migrate-up`" because `DATABASE_URL` points at the shared Sevalla database. `backend/CLAUDE.md:63` gives the setup line `make docker-up && make migrate-up`, and line 96 says "Migrations run against the remote DB." An agent following the backend file would change shared state.
- **It contradicts itself on PR creation.** The command block lists `gh pr create`, but the hook section says a hook blocks that and PRs should be made with `gh api`. It also says "Always use `gh` CLI… Do not use MCP", then tells cloud sessions to use the MCP tools.
- `## Context Lookup (graphify)` (lines 15–17) only points to another section. It can be deleted.
- Planning workflow rules (superpowers vs GSD) take about 12 lines and say "superpowers preferred" twice.
- The "Cowork session cleanup" and "Merge Conflict Patterns" sections sit next to a misplaced "External references" list.

## 2. `backend/CLAUDE.md` — 58/100

| Criterion | Score | Notes |
|---|---|---|
| Commands | 14/20 | All Makefile targets listed exist; the setup line is dangerous (see above) |
| Architecture | 9/20 | The directory tree is out of date |
| Non-obvious patterns | 15/15 | Paginator error gotcha, directive argument reflection, gqlgen test client: all confirmed in code |
| Conciseness | 11/15 | Reasonable |
| Currency | 3/15 | Many outdated facts (below) |
| Actionability | 6/15 | Several paths would send an agent to the wrong place |

**Outdated facts I confirmed:**
- **Resolver location:** Line 39 says `adapters/graphql/{content,…}.resolvers.go` and `adapters/graphql/helpers.go`. Both actually live in `internal/adapters/graphql/resolvers/`.
- **"One `schema.graphql`" gotcha (lines 102–104):** `gqlgen.yml` now lists both `schema.graphql` and `messaging.graphql`. The split the doc calls "the real fix" has partly happened. The stray-file problem probably still applies to `schema.graphql`, but the explanation is out of date.
- **Go versions (lines 48, 182–185):** `go.mod` says `go 1.26`, not 1.25. The Dockerfile uses `golang:1.27-alpine`, not `1.26-alpine`, which is also newer than the `toolchain go1.26.0` line. That breaks the doc's own rule to keep them matched.
- **CORS section:** Says CORS is hard-coded to `*` in `main.go`. It is actually read from `CORS_ORIGINS` (`internal/config/security.go:57`); `*` is only the default.
- **Config:** Says `config/config.json`. Only `config/config.example.json` exists; it's the default path and `CONFIG_PATH` overrides it (`cmd/server/main.go:78-80`). The "Required: DATABASE_URL" list also leaves out `JWT_SECRET` and `CLERK_SECRET_KEY` (required in production), `CORS_ORIGINS`, `DEMO_MODE`, `APP_ENV` and others.
- **Directory tree:** `internal/middleware/` doesn't exist; middleware is in `internal/adapters/web/middleware/` and `pkg/middleware/`. The tree is also missing `adapters/{auth,realtime,wikidata,web}`, `internal/demo`, `cmd/seed-demo`, `cmd/seed-bible` and `pkg/logger`.
- **"Adding a New Feature":** Step 4's `feature_repository.go` should follow the `gorm_*_repository.go` naming. Step 6's `feature_resolver.go` should be `<domain>.resolvers.go`.
- **Stray backup files:** `postgres/` contains three `*.sqlx.bak` files from the old sqlx code. Either add a line about them or delete them.

## 3. `frontend/CLAUDE.md` — 67/100

| Criterion | Score | Notes |
|---|---|---|
| Commands | 14/20 | Accurate; leaves out `build`, `test:browser`, `demo:test` and `format` |
| Architecture | 8/20 | The directory tree is out of date |
| Non-obvious patterns | 15/15 | Excellent. Every file it cites exists (theme store, `grid-config.ts` `COLUMNS`, the 860px `cardMode` switch and the 4 width tiers, `stale-chunk-recovery`, `pollInterval`, the auth wrapper). The service worker really isn't registered anywhere. |
| Conciseness | 5/15 | 254 lines; many entries tell the story of past bugs when one rule would do |
| Currency | 12/15 | Mostly current apart from the tree |
| Actionability | 13/15 | Specific and grounded in the code |

**Issues:**
- **`+layout.ts`:** The doc says `prerender = true`; the file has `prerender = false; ssr = false`. That's a meaningful difference for an agent reasoning about SSR.
- **Tree:** `AGGridTest.svelte` doesn't exist. `shadcn/` has 8 components, not just `button/`. The tree also leaves out `lib/{auth,theme,stores,services,messaging,onboarding,data}`, the `compare/`, `discover/` and `messages/` routes, and the component subfolders.
- TanStack Query is now v6 (`^6.2.4`); the doc says "v5+". Harmless, but it's worth updating.
- Long sections that could be moved to `.docs/`: Deployment/Cloudflare (about 16 lines), Vitest browser capture gotchas, and the "stale node_modules" story (one sentence would do).

## 4. `.claude/CLAUDE.md` — 40/100

This is a 3-line pointer to `.claude/skills/graphify/SKILL.md`, which I can't see from the sandbox. Claude loads this file in addition to the root one, so it repeats the root's `## graphify` section. I'd merge it into the root file or delete it.

---

## Suggested fixes, in priority order
1. **Fix the backend setup line and the "Migrations run against the remote DB" line** so they match the root rule never to run `migrate-up`. This one can cause real damage.
2. Fix the backend facts: resolver and `helpers.go` paths, two schema files, Go versions, CORS, config path, required env vars, and the directory tree.
3. Fix the frontend `+layout.ts` claim and redraw its tree.
4. Remove the contradictions in root: the `gh pr create` example versus the hook, and "gh only" versus MCP in the cloud.
5. Cut about 30–40% from root and frontend by moving process and bug-history text into `.docs/`.
6. Merge `.claude/CLAUDE.md` into root.

Want me to draft these as diffs? I'd start with items 1–4, which are fact fixes rather than style.
