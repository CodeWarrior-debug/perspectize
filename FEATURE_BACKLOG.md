# Feature Backlog

Ideas and future enhancements captured during development. Not committed to any milestone — evaluated when planning new work.

---

## OAuth External Account Sync (Optional)

Brainstormed 2026-09-27: let users connect external accounts via OAuth (YouTube first) to **import** existing activity (liked videos → `Content` + draft, private perspectives) and **publish** a perspective back out (as a YouTube comment / like) as an explicit per-item action. Manual "Sync now" with a dry-run preview by default; scheduled sync only as an opt-in, import-only setting. Conflicts use a three-way diff against the last-synced snapshot with per-field ownership, and true conflicts are queued for the user. YouTube has no "list my comments" API and no like/comment webhooks, so comments are publish-only and all sync is polling.

Full design: [docs/superpowers/specs/2026-09-28-oauth-external-sync-design.md](docs/superpowers/specs/2026-09-28-oauth-external-sync-design.md)

**Priority:** Optional / unscheduled. Prerequisites: Google OAuth app verification.

---

## Saved Views (Activity Table)

Named, persisted presets that capture column visibility + filters + sort +
page size for `ActivityTable`, so a user can switch between "My reading queue",
"Admin audit", etc. without re-toggling each time.

- Persist per user (localStorage first; backend `user_views` table later for
  cross-device).
- Builds directly on the session-only column picker shipped 2026-09-02
  (`ColumnPickerDialog` + `userColumnOverride` in `ActivityTable.svelte`) —
  promote that transient state into a saveable/loadable view object.
- Serialize via `gridApi.getColumnState()` / `getFilterModel()` and restore via
  `applyColumnState()` / `setFilterModel()`.
- UI: a view dropdown next to the gear icon; "Save current as…", rename,
  delete, set default.

**Priority:** Medium — natural follow-up once users start customizing columns.

**Source:** Column picker design discussion (2026-09-02)

---

## Contributor License Agreement (CLA)

Enable automatic contributor agreement signing for external contributions. One checkbox on first contribution — keeps it simple.

**Options:**
- [CLA Assistant](https://cla-assistant.io/) — Free GitHub integration, stores signatures, auto-comments on PRs from new contributors
- [CLA Assistant Lite](https://github.com/contributor-assistant/github-action) — GitHub Action alternative, signatures stored in repo
- Custom DCO (Developer Certificate of Origin) — Lightweight alternative using `Signed-off-by` in commits

**What contributors agree to:**
- They have the right to submit the contribution
- The contribution is licensed under AGPL-3.0 (same as project)
- No additional obligations — AGPL version stays open and available

**Template reference:** [Apache ICLA](https://www.apache.org/licenses/icla.pdf) (for inspiration, ours would be simpler)

**Priority:** Low — set up before accepting external contributions

---

## Provenance Icons

Visual indicators showing the source/origin of content items. At a glance, users should know where content came from.

**v1 scope (YouTube only):**
- YouTube icon/badge on all content (since only YouTube is supported initially)

**Future multi-source scope:**
- Distinct icons per content type: YouTube, Podcast, Article, Book, etc.
- Icon displayed in the Activity Table, content detail views, and anywhere content is listed
- Could use platform brand icons (YouTube play button, Spotify waves, etc.) or abstract content-type icons
- Consider a "verified source" variant for content fetched directly via API vs. manually added

**Source:** Feature discussion (2026-02-16)

---

## Chat / Discussion on Content

Enable conversation threads on content items, allowing users to discuss perspectives with each other.

**Possible scope:**
- Comment threads on individual content items
- Reply threads on specific perspectives
- Real-time or near-real-time messaging
- Threaded vs. flat discussion structure

**Design considerations:**
- Moderation strategy (community-driven, AI-assisted, manual)
- Notification system for replies
- How chat interacts with perspectives — is a chat message a lightweight perspective, or a separate concept?
- Could start as simple comment threads and evolve toward real-time chat

**Source:** Feature discussion (2026-02-16)

---

## Migration Tests

Add automated tests for SQL migrations to catch syntax errors and verify up/down roundtrips.

**What to test:**
- **Up/down roundtrip** — Apply all migrations up, then down to zero, then back up. No errors = schema is reversible.
- **Individual migration syntax** — Each `.up.sql` and `.down.sql` runs without errors against a clean or migrated DB
- **Data preservation** — For data-transforming migrations (column renames, type changes), seed test data before `up` and verify it survives the roundtrip
- **Idempotency** — Running `up` twice doesn't break (IF NOT EXISTS patterns)

**Implementation approach:**
- Go integration test that spins up a test PostgreSQL container (testcontainers-go or Docker Compose)
- Iterate through `backend/migrations/` files in order
- Could run in CI as a separate job (slower, needs Docker)

**Priority:** Medium — prevents broken migrations from reaching production. Especially valuable as schema evolves (Phase 11 denormalization, multi-content-type work).

**Source:** Development discussion (2026-02-20)

---

## Jeeves AI Assistant

An AI-powered assistant integrated into the platform to help users discover, refine, and engage with content and perspectives.

**Possible capabilities:**
- **Perspective refinement** — Help users articulate their perspectives more clearly, suggest evidence, flag logical gaps
- **Content discovery** — "Based on your perspectives, you might find this interesting"
- **Summarization** — Summarize the range of perspectives on a given piece of content
- **Challenge mode** — Present counter-arguments to strengthen a user's thinking
- **Category/tag suggestions** — Auto-suggest categories and tags based on content analysis

**Design considerations:**
- Name "Jeeves" evokes a knowledgeable, helpful butler — the AI should feel like a thoughtful assistant, not a chatbot
- Could be a sidebar panel, a chat interface, or contextual suggestions inline
- Start with one focused capability (e.g., perspective refinement) rather than trying to do everything

**Source:** Feature discussion (2026-02-16)

---

## Perspectize Column Sorting & Filtering

The Perspectize column in the ActivityTable currently shows a glasses icon for adding/viewing perspectives but doesn't support AG Grid sorting or filtering. Users should be able to sort and filter content by perspective status.

**Sorting options:**
- Has perspective vs. no perspective (binary)
- Number of perspectives per content item
- Most recently perspectized

**Filtering options:**
- Show only items with perspectives
- Show only items without perspectives (to find content needing review)
- Filter by perspective count range

**Implementation considerations:**
- May require a computed/derived field (perspective count or boolean) exposed in the GraphQL content query
- Backend needs to support sorting/filtering on perspective-related fields (JOIN or denormalized count column)
- AG Grid column definition needs `sortable: true` and appropriate filter type

**Priority:** Medium — improves discoverability of un-perspectized content.

**Source:** User feedback (2026-02-27)

---

## AG Grid Sort Cycle: Unsorted → Descending → Ascending

The default AG Grid sort cycle is ascending → descending → unsorted. Preferred behavior is **unsorted → descending → ascending → unsorted** — so the first click shows highest values first (most views, newest date, etc.), which is the more common use case.

**Implementation:**
- Set `sortingOrder: ['desc', 'asc', null]` on the grid's `defaultColDef` or per-column
- This changes the click cycle to: unsorted → desc → asc → unsorted

**Priority:** Low — UX polish.

**Source:** User preference (2026-03-23)

---

## Server-Side Pagination Sort Inconsistencies

When server-side pagination is active, AG Grid sort events don't consistently trigger server re-fetches. Clicking a column header to sort sometimes only reorders the current page of rows instead of sending the sort parameters to the backend for a full dataset sort.

**Observed issues:**
- Sort change events not firing on every column header click
- Inconsistent behavior between first sort click and subsequent clicks
- May be related to event handler debouncing or AG Grid's `onSortChanged` not always propagating in server-side mode

**What to investigate:**
- Verify `onSortChanged` fires reliably — add debug logging
- Check if AG Grid's `sortModel` is being read and sent to the GraphQL query on every change
- Ensure TanStack Query's `queryKey` includes sort parameters so cache invalidation triggers re-fetch
- Consider using `onGridReady` + `onSortChanged` with a stable callback ref to prevent stale closures

**Priority:** Medium — data correctness issue when using server-side pagination with sorting.

**Source:** User report (2026-03-23)

---

## Re-run graphify with a Real LLM Backend Token

**Type:** Dev × Feature Request

The initial graphify knowledge-graph build (see CLAUDE.md's `## graphify` section) was run with `graphify extract . --code-only` because no `ANTHROPIC_API_KEY`/`GEMINI_API_KEY` was available in the shell — this skips semantic extraction entirely.

**Current state:** `graphify-out/graph.json` has 2345 nodes / 6398 edges / 192 communities from local AST parsing only. Communities are unlabeled placeholders ("Community 0"–"191") since naming requires an LLM call. 475 doc files, papers, and images were skipped (`--code-only` only indexes code). 29 `.sql` files contributed nothing (missing `tree_sitter_sql` — `pip install "graphifyy[sql]"` fixes that separately).

**What to do:**
- Get an API key (Anthropic from console.anthropic.com — separate billing from the Claude subscription — or Gemini) and export it in a real terminal, not through an AI session
- Re-run `graphify extract . --backend claude` (or `--backend gemini`) with `--force` to get semantic/INFERRED edges and doc/paper/image extraction
- Run `graphify cluster-only .` (without `--no-label`) afterward to get real community names instead of "Community N" placeholders

**Priority:** Low-Medium — the code-only graph is already usable for query/path/explain against code symbols; this upgrade mainly improves natural-language question matching and cross-doc community structure.

**Source:** Dev request (2026-09-02), during graphify initialization.

---

## Cache Clerk ID → Local User Lookup in Auth Middleware

**Type:** Dev × Performance

`clerk_middleware.go` verifies the incoming Clerk JWT (cheap — the SDK caches Clerk's JWKS in-memory, so signature verification is a local check, no network call per request) and then resolves the token's Clerk ID to a local `users` row via `GetByClerkID`, a Postgres query. That DB lookup runs on **every** authenticated request — there's no caching layer between the middleware and the database.

At current traffic this is fine. At real scale (many requests per second from the same signed-in users — polling, rapid successive GraphQL mutations, etc.) it becomes redundant load: the same user's row gets re-fetched on every request in a burst.

**What to do:**
- Add a short-TTL cache (in-memory LRU, or Redis if the app already has one) keyed by Clerk ID → local `domain.User`, TTL ~30–60s.
- Invalidate on the Clerk webhook events the app already listens for (user updated/deactivated) rather than relying purely on TTL expiry, so role/deactivation changes don't have a stale window longer than necessary.

**Priority:** Low — not worth the complexity at current (Sevalla-hosted, low-traffic) scale. Revisit if/when request volume from authenticated users grows meaningfully.

**Source:** Dev discussion (2026-09-10), during PR #356 (issue #246 userID-spoofing fix) — question about whether `auth.RequireAuth`'s context lookup or the upstream middleware's DB call would ever become a cost concern.

---

## Research Spike: Jev (TypeSafe AI "System One" model) for the future AI bot

**Type:** Research Spike — not scoped, no code/config changes made.

**Status:** Confirmed as a real product (TypeSafe AI, founder Diogo Almeida ex-OpenAI, $40M seed led by DCVC, early access 2026-09-15). It is a fast decision/classification model ("System One" — returns typed Choice/Score/Noul answers with calibrated probabilities in ~70-500ms), **not** a code-generation or reasoning model. It does not compete with Claude Code; it's a candidate cheap-and-fast "yes/no/classify" layer that could sit *alongside* an AI agent.

**Why this is logged now instead of piloted:** research turned up ~15 third-party/community repos and Claude Code plugin/MCP integrations (`jev-kit`, `jev-code`, `limpet`, `fast-jev-compaction`, `jev-ci-triage`, two unrelated `jev-harness` projects, `jevtriage`, `jev-test-triage`, `jev-logtriage`, `graphql-classifier`, `jevcal`, plus four "awesome-jev" list repos) that appeared almost immediately after launch — a pattern worth treating with real suspicion (typosquatting / unvetted supply-chain risk), especially since several are pitched as plugging directly into CI merge gates, Claude Code's tool-call approval flow, or agent Stop hooks (i.e., things that could approve destructive commands or silently fail open). None of these should be installed without independently reading their source and confirming maintainer legitimacy first — a vendor README claim is not verification.

**Where Jev could be worth real evaluation later:** when Perspectize implements its own AI bot feature (not yet built), Jev's fast/cheap classification could plausibly be useful as a pre-filter/guard layer in that bot's pipeline (e.g., cheap moderation/routing/confidence checks before an expensive model call) — that's the point at which a proper spend of time vetting official SDKs (Python/JS have official ones; Go only has unofficial community clients so far — `jev-go`, `go-jev`, `typesafe-go`) and re-running this research against the actual bot design would be worthwhile.

**Do not pilot any of the community CI/agent-guard repos listed above until:** (1) the AI bot feature has a concrete design that identifies a real use case, and (2) each candidate repo is independently source-reviewed for what it actually does with any credentials/permissions it's given.

**Priority:** Deferred — revisit specifically when AI bot implementation work is scoped, not before.

**Source:** Dev research spike (2026-09-27/28), requested as "where can Jev enhance my workflow" — full findings captured in session, official links: https://typesafe.ai/blog/introducing-system-one-models-and-jev, https://docs.typesafe.ai/introduction/coding-agents.

## Subtasks on Plans, and Sharing Task Lists

Two related extensions to the Plan page (user todos, PR #576). Both are exploration, not commitments.

- **Subtasks:** let a Todo have child Todos (a plan inside a plan). Open questions: one level or nested; does the parent's percent complete roll up from its children; how drag-reorder and list position work inside a parent; whether a child can live in a different list; what the card list and the grid show (indent, expand/collapse, count badge).
- **Sharing task lists generally:** let a user share a Todo list, not just their own view of it. Open questions: read-only vs collaborative editing; who sees what when Todos link to items that have private perspectives; per-list vs per-Todo privacy (Todos already carry a privacy setting); how this relates to the sharing model gating [Multiple Perspectives per Content](#multiple-perspectives-per-content-public--private-slots).

**Depends on:** the sharing model direction in [ADR 0002](docs/adr/0002-sharing-model.md) (sharelists and audience rules are reusable; this feature still needs its own spec), and the shared BaseTable work in #577 so a shared or nested list does not become a third copy of the grid.

**Priority:** Optional / unscheduled.

---

## Facebook Video / Reel Content Type

**Spec:** [docs/superpowers/specs/2026-10-19-facebook-video-content-type-design.md](docs/superpowers/specs/2026-10-19-facebook-video-content-type-design.md) (proposal, unscheduled, written without superpowers).

Paste a public Facebook video or Reel link; it plays inline behind a click-to-load gate and collects perspectives. Unlike YouTube, Meta offers no lawful metadata source (oEmbed lost title/thumbnail in 2025 and may not be stored; Graph needs Page Public Content Access; scraping is banned), so title and creator are user-entered and there is no thumbnail, duration or view count. No migration, no API key.

**Blocks public launch (not the build):** the app has no privacy policy, terms, DMCA agent or report flow yet; the spec's §6.2 lists them. Seven decisions to confirm are in its §9.

**Priority:** Deferred by [ADR 0001](docs/adr/0001-defer-facebook-video-content-type.md): storing metadata needs a Meta App Review and Business Verification we probably wouldn't pass. Revisit conditions are in the ADR.

## Food & Drink Content Type

**Spec:** [docs/superpowers/specs/2026-11-01-food-item-content-type-design.md](docs/superpowers/specs/2026-11-01-food-item-content-type-design.md) (proposal, unscheduled, written without superpowers). **Intent:** [project-management/intents/food-item-content-type.md](project-management/intents/food-item-content-type.md) (draft).

One `FOOD_ITEM` type for packaged foods, generic foods and beverages, added by barcode, USDA/Open Food Facts URL or Discover search. Nutrition comes from USDA FoodData Central (CC0, free key, 1,000 req/h) with Open Food Facts (ODbL, no key, 15 reads/min per IP) for images, Nutri-Score, NOVA and allergens. It is normalised to per-serving and per-100 g/ml so items sort side by side. No migration. Nine decisions to confirm are in its §14.

---

## Native Shell and Service Worker (Deferred)

The Capacitor native shell (`frontend/ios`, `frontend/android`) and the PWA service worker were removed in chore/remove-capacitor-pwa (#704). The app keeps a static web manifest so Add to Home Screen still works, but nothing is precached or registered. Re-adding a native shell or a service worker is deferred until a mobile release is scheduled; re-scope it then against what the app needs (push, deep links, auth in a WebView, offline). History is recoverable from git.

**Priority:** Deferred until a mobile release is scheduled.
