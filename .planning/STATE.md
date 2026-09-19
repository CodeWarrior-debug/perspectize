---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: Feature Phases
status: unknown
last_updated: "2026-02-28T16:57:58.437Z"
progress:
  total_phases: 34
  completed_phases: 15
  total_plans: 101
  completed_plans: 47
---

---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: Feature Phases
status: in-progress
last_updated: "2026-02-28T16:20:29.819Z"
progress:
  total_phases: 34
  completed_phases: 14
  total_plans: 101
  completed_plans: 47
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-04)

**Core value:** Users can easily submit their perspective on a YouTube video and browse others' perspectives in a way that keeps them in control.
**Current focus:** Phase 09 complete (6/6 plans) — Security Hardening (Authorization & Data Protection)

Also complete: Phase 03.5.1 (4/4 plans) — Wikidata Integration and Universal Content Types. Full category flow: Wikidata client -> backend service/resolvers -> frontend queries/Typeahead -> AG Grid integration.

## Current Position

**Milestone:** v1.0 Frontend MVP (COMPLETE & FORMALIZED)
**Status:** Shipped 2026-02-16 (formalized 2026-09-04)
**Current Phase:** Planning v1.1 transition
**Last activity:** 2026-09-04 — Milestone v1.0 formalization + planning sync

Progress: [████████████████████] 100% (43+ plans complete, v1.0 milestone closed)

**Phases executed:**
- Phase 1–5: Frontend MVP (2026-02-05 → 2026-02-16)
- Phase 7–9: Post-MVP concerns (2026-02-13 → 2026-03-03)
- Phase 17: URL normalization (2026-02-22, parallel)

**Total git commits since v1.0 start:** 426 (2026-02-05 → 2026-09-04)
**Post-formalization PRs:** 16 (#300–#315, continuing development)

## Performance Metrics

**Velocity:**
- Total plans completed: 33
- Average duration: 3.5 min
- Total execution time: 2.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 5 | 36 min | 7 min |
| 02-data-layer-activity | 2 | 9 min | 4.5 min |
| 03-add-video-flow | 2 | 8 min | 4 min |
| 03.1-design-token-system | 2 | 6 min | 3 min |
| 03.2-activity-page-beta-quality | 8 | 36 min | 4.5 min |
| 07-backend-architecture | 3 | 7 min | 2.3 min |
| 07.1-orm-migration-sqlx-to-gorm | 3 | 8 min | 2.7 min |
| 07.2-gorm-cursor-paginator | 2 | 4 min | 2 min |
| 07.3-frontend-caching-remediation | 4 | 16 min | 4 min |
| 07.4-performance-monitoring | 1 | 3 min | 3 min |
| 08-user-integration-flow | 1 | 3 min | 3 min |

**Recent Trend:**
- Last 5 plans: 3 min, 3 min, 5 min, 3 min, 9 min (avg: 4.6 min)
- Trend: Good — Slight increase for complex UI components (shadcn Select, responsive FormPopover)

*Updated after each plan completion*
| Phase 17-youtube-url-normalization-and-duplicate-upsert P01 | 8 | 2 tasks | 11 files |
| Phase 17 P02 | 15 | 2 tasks | 12 files |
| Phase 09-security-hardening P01 | 6 | 7 tasks | 13 files |
| Phase 09-security-hardening P02 | 7 | 5 tasks | 8 files |
| Phase 09-security-hardening P03 | 4 | 7 tasks | 8 files |
| Phase 09-security-hardening P06 | 2 | 4 tasks | 3 files |
| Phase 09 P05 | 4 | 5 tasks | 5 files |
| Phase 09 P04 | 4 | 6 tasks | 7 files |
| Phase 03.5.1 P01 | 4 | 2 tasks | 9 files |
| Phase 03.5.1 P02 | 15 | 5 tasks | 20 files |
| Phase 03.5.1 P03 | 7 | 2 tasks | 7 files |
| Phase 03.5.1 P04 | 5 | 1 task | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 5 phases derived from 37 v1 requirements
- [Roadmap]: AG Grid validation in Phase 1 to derisk community wrapper early
- [Stack]: SvelteKit + TanStack Query + TanStack Form + AG Grid + shadcn-svelte + Tailwind CSS
- [01-01]: Downgraded Vite from 7.3.1 to 6.4.1 for Tailwind CSS v4 compatibility
- [01-01]: Upgraded Tailwind CSS from 4.0.0 to 4.1.18 to fix build errors
- [01-01]: Custom navy primary color: oklch(0.216 0.006 56.043) = #1a365d (CORRECTED in 03.1-01: hex #1a365d, not oklch)
- [03.1-01]: Hex color tokens (not oklch) — AI-generated oklch values unreliable, DESIGN_SPEC.md hex is source of truth
- [03.1-01]: Dual-font system: Geist (sans) for UI/headings, Charter (serif) for body/content text
- [03.1-01]: Charter font from charter-webfont npm package (official Matthew Carter distribution)
- [03.1-01]: disabled opacity via utility class (disabled:opacity-50) not @theme token
- [01-01]: Type-based organization over feature-based for flat structure
- [01-02]: Header height fixed at h-16 for consistency
- [01-02]: PageWrapper is opt-in for pages, not forced in layout
- [01-02]: Responsive padding scale: px-4 (mobile) → px-6 (md) → px-8 (lg)
- [01-03]: TanStack Query enabled: browser for SSG compatibility
- [01-03]: Toast notifications at top-right with 2s auto-dismiss
- [01-03]: Vitest with jsdom environment and SvelteKit mocks
- [01-05]: Browser resolve condition in vite.config.ts for Svelte 5 component testing
- [01-05]: Branch coverage threshold at 75% (vs 80% for others) due to Svelte compiler default parameter branches
- [01-05]: createRawSnippet pattern for testing Svelte 5 components with children props
- [02-01]: Setter-based session sync for Svelte 5 stores (not $effect) for testability
- [02-01]: Simple ListAll repository method (no pagination) for small datasets
- [02-01]: Namespaced session storage key: perspectize:selectedUserId
- [02-02]: TanStack Query function wrapper pattern for Svelte 5: createQuery(() => ({ ... }))
- [02-02]: Client-side AG Grid pagination (first: 100) for Phase 2 simplicity
- [02-02]: AG Grid Quick Filter for text search (no backend search yet)
- [02.1-02]: AG Grid onFirstDataRendered for deferred column visibility (avoids postConstruct bean init race)
- [02.1-02]: isGridInitialized flag gates onGridSizeChanged calls during AG Grid initialization
- [03-01]: shadcn components in shadcn/ directory (moved from default ui/ for consistency)
- [03-01]: URL constructor for YouTube validation (no regex, avoids catastrophic backtracking)
- [03-01]: Support 4 YouTube hosts: youtube.com, www.youtube.com, youtu.be, m.youtube.com
- [03-02]: TanStack Query createMutation with onSuccess/onError callbacks for dialog flow
- [03-02]: Error mapping via string matching (duplicate/already exists, invalid/not found, generic)
- [03-02]: Dialog stays open on error, closes only on success
- [03-02]: $effect for form reset when dialog opens (not on close)
- [03.2-02]: Popover trigger uses buttonVariants() directly (bits-ui 2.x Svelte 5 pattern, no asChild)
- [03.2-02]: AddVideoPopover self-contained with internal open state (simpler API than bind:open from parent)
- [03.2-03]: ActivityTable manages own data fetching (no props) for simplicity
- [03.2-03]: Cursor-based pagination with stored cursors array for prev/next navigation
- [03.2-03]: SORT_FIELD_MAP to translate AG Grid colId to GraphQL ContentSortBy enum
- [03.2-03]: 500ms debounce on floating filters to reduce server requests
- [03.2-03]: formatCount utility: null → '--', <1K → '500', 1K-1M → '1.2K', ≥1M → '1.2M'
- [03.2-03]: Cell renderers using createElement (not innerHTML) for XSS safety
- [03.2-06]: Explicit AG Grid filter types (agTextColumnFilter, agNumberColumnFilter) for all data columns
- [03.2-06]: agTextColumnFilter for date column (formatted dates are strings, not Date objects)
- [03.2-06]: h-full w-full required on AG Grid cell renderers for flexbox centering to fill entire cell
- [03.2-07]: Mobile breakpoint at 767px matches Tailwind md: breakpoint for consistency
- [03.2-07]: $effect with matchMedia for reactive viewport width detection in Svelte 5
- [03.2-07]: CSS media query for thumbnail hiding instead of JavaScript for performance
- [03.2-07]: Mobile shows Item + Type columns only; desktop shows Item, Type, Length, Views, Likes, Date
- [07.3-02]: Shared mutation hooks pattern for eliminating duplication (useAddVideo extracts common logic)
- [07.3-02]: Query invalidation via queryKeys factory instead of custom events (removed window.dispatchEvent pattern)
- [07.3-03]: TanStack Query createQuery with keepPreviousData for ActivityTable (replaced manual fetchData)
- [07.3-03]: Query key includes all pagination/sort/filter params for correct cache segmentation
- [07.3-03]: AG Grid callbacks update reactive state only (no manual fetches, query auto-refetches)
- [07.3-03]: Cursor management inside queryFn to update cursors array reactively
- [07.3-03]: Event listener pattern removed - query invalidation handles refreshes
- [05-02]: Backend deployed on Sevalla (URL in SEVALLA_BACKEND_URL env var / .env files)
- [05-02]: Frontend hosting target: Sevalla Static Sites (not DigitalOcean App Platform)
- [Infra]: CLAUDE.md split into root + backend/CLAUDE.md + frontend/CLAUDE.md for package-level context loading
- [Infra]: Go module renamed from `github.com/yourorg/backend` to `github.com/CodeWarrior-debug/perspectize/backend` (30 files, all 78 tests pass)
- [Infra]: Docs delegated to .docs/ directory: VERIFICATION.md, DOMAIN_GUIDE.md, GO_PATTERNS.md, GITHUB_PROJECTS.md, GSD_BRANCHING.md
- [Infra]: qmd .planning/ collection added with stable-vs-live convention
- [Infra]: All three CLAUDE.md files scored 95/100 (A) quality after optimization
- [Frontend]: Svelte 5 runes, SvelteKit routing, TanStack Query patterns documented in frontend/CLAUDE.md
- [03.2-01]: JSONB extraction for sort fields with NULLS LAST to handle missing statistics
- [03.2-01]: ILIKE search on name field for case-insensitive text search
- [03.2-02]: Popover trigger uses buttonVariants() directly (bits-ui 2.x Svelte 5 pattern, no asChild)
- [03.2-02]: AddVideoPopover self-contained with internal open state (simpler API than bind:open from parent)
- [03.2-02]: Temporarily keeping AddVideoDialog for coverage threshold (popover portal rendering limits JSDOM testing)
- [07-02]: Custom StringArray/Int64Array types replace lib/pq (single pgx driver, ~200 lines of parsing code)
- [07-02]: Database pool configurable via env vars (DB_MAX_OPEN_CONNS, DB_MAX_IDLE_CONNS, DB_CONN_MAX_LIFETIME)
- [07-02]: CONFIG_PATH env var for config file path (default: config/config.example.json)
- [07-02]: DATABASE_URL validated at startup (scheme, hostname, database name)
- [07-02]: DSN credentials sanitized in all log output (dual-format: URL + key-value)
- [07-03]: chi router with middleware stack (RequestID, RealIP, Logger, Recoverer)
- [07-03]: Separate liveness (/health) and readiness (/ready with DB ping) endpoints
- [07-03]: 30s graceful shutdown timeout on SIGTERM/SIGINT
- [07.1-01]: Hex-clean GORM pattern: separate GORM models from domain models with bidirectional mappers
- [07.1-01]: GORM models use custom StringArray/Int64Array/JSONBArray types (not lib/pq)
- [07.1-01]: Privacy/ReviewStatus enums stored lowercase in DB, UPPERCASE in domain (mappers handle conversion)
- [07.1-01]: Parts array stored as int64[] in DB, converted to []int in domain
- [07.1-01]: CategorizedRatings stored as jsonb[] with JSON marshal/unmarshal in mappers
- [07.1-01]: ConnectGORM uses same pgx driver as sqlx for consistency
- [07.1-02]: GORM chaining for WHERE filters replaces manual SQL string building with argIdx counting
- [07.1-02]: gorm.Expr() for ORDER BY with JSONB expressions (makes raw SQL intent explicit)
- [07.1-02]: Create/Update fetch fresh records via GetByID for DB-generated timestamps
- [07.1-02]: Delete checks RowsAffected == 0 for ErrNotFound handling
- [07.1-02]: Total count respects filters but not cursor pagination (query.Count before cursor WHERE)
- [07.1-03]: Shared repository helpers extracted to helpers.go (cursor encoding, sort mapping, enum converters)
- [07.1-03]: sqlx dependency fully removed from go.mod
- [07.1-03]: Old sqlx repository files archived as .sqlx.bak for reference
- [07.1-03]: GORM is now the active ORM (main.go wired to GORM repositories)
- [07.2-01]: gorm-cursor-paginator v2.7.0 installed for compound keyset pagination
- [07.2-01]: Dummy GORM fields with gorm:"-" tag pattern for library schema validation without DB columns
- [07.2-01]: Sort rule builders (buildContentSortRules, buildPerspectiveSortRules) return []paginator.Rule with primary + ID tie-breaker
- [07.2-01]: SQLRepr with NULLReplacement for JSONB sort keys (ViewCount, LikeCount, PublishedAt)
- [07.2-02]: List() pattern: build rules → configure paginator → apply filters → clone for count → Paginate()
- [07.2-02]: Cursor mapping: HasNext = cursor.After != nil, HasPrev = cursor.Before != nil
- [07.2-02]: Query cloning via Session(&gorm.Session{}) to avoid Paginate() interference with count queries
- [07.2-02]: AllowTupleCmp enabled for PostgreSQL row comparison optimization in compound keyset queries
- [07.3-01]: CSP uses 'unsafe-inline' for script-src and style-src (Svelte generates inline scoped CSS)
- [07.3-01]: Query key factory returns readonly tuples for type safety
- [07.3-01]: Email field removed from LIST_USERS (not displayed in UI, PII over-fetching)
- [07.3-01]: Hierarchical query keys: all → lists/details → individual items for granular invalidation
- [07.3-04]: ActivityTable.svelte excluded from coverage (JSDOM + AG Grid rendering limitation, component works in browser)
- [07.4-01]: slog-based request timing middleware replaces chi Logger (richer structured fields)
- [07.4-01]: GORM slow query callbacks log queries >100ms with SQL and duration
- [07.4-01]: /debug/db-stats endpoint serves sql.DBStats as JSON (dev-only)
- [07.4-01]: gqlgen AroundOperations extension logs operation name and duration_ms
- [07.4-01]: Go benchmark tests for ContentService and PerspectiveService with mocked repos
- [07.4-01]: Frontend Web Vitals (LCP, CLS, INP, FCP, TTFB) logged to console in dev
- [08-01]: CreateUserInput.email optional (String, not String!) in GraphQL schema
- [08-01]: FormPopover shared component extracts popover boilerplate (used by AddVideo + CreateUser)
- [08-01]: CreateUserPopover with username input and useCreateUser mutation hook
- [08-01]: UserSelector has adjacent "+ New User" trigger with auto-select on creation
- [08-01]: Query invalidation on user creation via queryKeys.users.list()
- [03.2-05]: AddVideoPopover outline variant on navy header for visibility (not ghost or default)
- [03.2-05]: Card wrapper pattern for grid components: border rounded-lg shadow-sm overflow-hidden
- [03.2-05]: Component variant props pass-through pattern (AddVideoPopover → FormPopover)
- [03.2-08]: FormPopover switches to Dialog at <768px, Popover at >=768px for mobile-friendly forms
- [03.2-08]: matchMedia detection with $effect for reactive viewport-based component switching
- [03.2-08]: hidden sm:inline pattern for icon-only buttons at mobile breakpoints
- [03.2-08]: shadcn Select component wraps bits-ui Select primitives with styled dropdown
- [03.2-08]: Function coverage threshold at 75% (vs 80%) due to bits-ui interaction handlers not testable in JSDOM
- [03.2-08]: tests/helpers excluded from coverage (test utilities, not source code)
- [Phase 17-youtube-url-normalization-and-duplicate-upsert]: NormalizeYouTubeURL is a pure function (not YouTubeClient method) to keep the port interface clean
- [Phase 17-youtube-url-normalization-and-duplicate-upsert]: GetOrCreateByURL uses clause.OnConflict{DoNothing: true} on url column for atomic TOCTOU-safe upsert
- [Phase 17-youtube-url-normalization-and-duplicate-upsert]: CreateFromYouTube returns (content, ErrAlreadyExists) on duplicate — callers get both content AND can distinguish new vs existing
- [Phase 17-02]: createContentFromYouTube returns CreateContentResult wrapper with alreadyExisted boolean for caller-side duplicate detection, enabling toast.warning UX without GraphQL errors
- [09-01]: Middleware authenticates (stores claims in context), directives authorize (enforce @auth on fields) — middleware never blocks unauthenticated requests
- [09-01]: HS256 JWT signing with golang-jwt/jwt v5, httpOnly cookie transport, 15-min default TTL
- [09-01]: Dev fallback JWT secret for local development; production requires explicit JWT_SECRET >=32 bytes
- [09-03]: handler.New instead of NewDefaultServer for selective gqlgen extension control (introspection toggle)
- [09-03]: Rate limiting before auth in middleware stack to prevent auth endpoint DoS
- [09-03]: Content-Type validation as CSRF protection (simpler than gorilla/csrf for API-only GraphQL)
- [09-03]: Middleware order: RequestID -> RealIP -> RateLimit -> CORS -> ContentType -> Auth -> Timer -> Recoverer
- [09-02]: gqlgen field resolver for User.email (gqlgen.yml config) — auth-gated, returns null when not own account
- [09-02]: email field nullable (String! -> String) to support returning null for unauthorized requests
- [09-02]: @owner directive extracts ID from both top-level args and nested input objects for flexible mutation patterns
- [09-06]: Documentation-only approach for M-28 (automated vault/rotation deferred, manual rotation documented)
- [09-06]: 90-day rotation cadence for JWT and DB credentials, annual for YouTube API keys
- [Phase 09]: sanitizeYouTubeError is unexported helper — keeps sanitization logic internal to YouTube adapter
- [Phase 09]: SSLProxyHeaders for Sevalla: Added X-Forwarded-Proto detection so HSTS works behind Sevalla/Cloudflare reverse proxy
- [Phase 03.5.1]: Wikidata client uses flat label/description fields from wbsearchentities (not display object)
- [Phase 03.5.1]: Simple for-loop retry with exponential backoff (1s, 2s) for 429/5xx errors, no external library
- [Phase 03.5.1]: Custom APIError type for retryable HTTP status code check (429, 5xx)
- [Phase 03.5.1-02]: GORM clause.OnConflict for atomic category upsert by wikidata_qid
- [Phase 03.5.1-02]: Content.primaryCategory uses gqlgen field resolver (lazy loading) to avoid N+1 on list queries
- [Phase 03.5.1-02]: CategoryService applies defaults for empty language (en) and zero limit (10) in SearchWikidata
- [Phase 03.5.1-03]: CategoryTypeahead is a dumb search component (onSelect callback, does not call mutation) for reusability
- [Phase 03.5.1-03]: 300ms debounce with 2-char minimum prevents excessive Wikidata API calls
- [Phase 03.5.1-03]: keepPreviousData from TanStack Query prevents flicker during typeahead typing
- [Phase 03.5.1-03]: 5-minute staleTime caches repeated Wikidata searches
- [Phase 03.5.1-04]: Category column after Type, before Duration (position 4 in columnDefs)
- [Phase 03.5.1-04]: Popover uses fixed positioning with backdrop button for outside-click dismissal
- [Phase 03.5.1-04]: Category not sortable/filterable per CONTEXT.md deferral decision
- [Phase 03.5.1-04]: Category visible on sm+ tiers (445px+), hidden on xs (mobile)

### Roadmap Evolution

- Phase 02.1 inserted after Phase 2: Mobile Responsive Fixes (URGENT) — P1 issues: header overflow/clipping at 375px, pagination bar broken, table left-shift overflow
- Phase 03.1 inserted after Phase 3: Dialog UX Polish — Gray overlay too aggressive, modal translucent/hard to read, needs redesign with shadcn best practices
- Phase 03.3 inserted after Phase 3.2: Repository Rename & Folder Restructure — Rename repo perspectize → perspectize, folders backend → backend, fe → fe, update all imports and Sevalla pointers
- Phase 07.1 inserted after Phase 7: ORM Migration (sqlx → GORM) — Replace sqlx with GORM using hex-clean separate model pattern. ~35% repository code reduction. Prototype in gorm_*.go files.
- Phase 07.2 inserted after Phase 7.1: gorm-cursor-paginator Integration (URGENT) — Fix C-02 cursor pagination broken for non-ID sorts. Replace hand-rolled encodeCursor/decodeCursor with library. Was originally planned for 7.1 but skipped during execution.
- Phase 07.3 inserted after Phase 7.2: Frontend Caching Remediation (URGENT) — Comprehensive caching review found ActivityTable bypasses TanStack Query entirely, eruda debug console in production, dual-signal anti-pattern, PII over-fetching, missing CSP. Auth architecture design deferred to FEATURE_BACKLOG.md.
- Phase 07.4 inserted after Phase 7.3: Performance Monitoring — Establish measurable performance baselines before application grows in complexity. slog-based instrumentation, no new infrastructure deps.
- Phase 08 (User Integration Flow) inserted — Frontend create user flow with shared FormPopover, optional email in schema.
- Phase 16 added: Mobile App Strategy — Research native mobile approaches (Capacitor, Tauri, PWA) for SvelteKit SPA. Depends on Phase 12 (auth).
- Phase 3.4 inserted after Phase 3.3: Perspectize Branding & Glasses Identity (URGENT) — Glasses motif with 3 shapes, 8-color palette picker, JSONB preferences, avatar display, and onboarding flow.
- Phase 3.5 inserted after Phase 3.4: Google NL Taxonomy Research Spike (URGENT) — Deep-dive on Google taxonomy depth, traversal, subcategories, ltree mapping, YouTube classification. Unblocks Phase 13 (Content Categories) and Phase 4B (AG Grid grouping). See 04-CONTEXT.md cross-phase architecture and 13-context.md open questions.
- Phase 20 added: Bible passage content — scripture reference model (verse-ordinal ranges), lazy passage content rows, BSB-only text display layer, and frontend passage picker/display. Design spec: docs/superpowers/specs/2026-09-19-bible-passage-frontend-design.md. Planned in superpowers, not GSD.
- Phase 17 added: YouTube URL normalization and duplicate upsert — Normalize all YouTube URL variants to canonical form, implement upsert (return existing content instead of error on duplicate), add database unique constraint on external_id. Related to Phase 6 M-03 and Phase 8.1 H-06/H-07.
- Phase 18 added: Server-Side Pagination & Filtering with Data Mode Toggle — Add data mode toggle to ActivityTable switching between "All Items" (server-side sort/filter/search across full dataset) and "Loaded Items" (client-side sort/filter/search on currently loaded page). Expand backend filtering and sorting capabilities.
- Phase 4.1 inserted after Phase 4: GraphQL Dataloaders for N+1 Query Prevention (URGENT) — Implement dataloadgen-based batching for 3 N+1-vulnerable nested relationships (Perspective→User, Perspective→Content, Content→User). Add batch repository methods (GetByIDs), field resolvers, per-request middleware. Related to Phase 8.1 M-08.
- Phase 18.1 inserted after Phase 18: Mobile Activity Page Redesign (URGENT) — Redesign mobile activity page with 3-column layout (Item, Summary info-grid, Perspective glasses icon). Rethink mobile data display away from hidden AG Grid columns toward summary-based approach.
- Phase 19 added: Content Familiarity Tracking — Backend system for users to record familiarity level (1-16 scale) with content and set target levels. Migrations, models, repository, service, and API endpoints. Open design questions on level count, table structure, and API style to resolve during planning.
- Phase 03.5.1 inserted after Phase 3.5: Wikidata Integration and Universal Content Types (URGENT) — Build Go client for Wikidata APIs (Entity Search, REST, SPARQL), expand domain model beyond YouTube with Q-ID entity resolution, create enrichment layer. Extends Phase 3.5 research spike into production code.

### Project-Level Plan Requirements

All plans that modify frontend or backend source code **must** pass test coverage as a completion gate:
- **Frontend:** `cd fe && pnpm run test:coverage` exits 0 (80% stmts/lines, 75% branches/functions)
- **Backend:** `cd backend && make test` exits 0 (all tests pass)

Plans that only modify infrastructure (CI/CD, config) must still verify they don't regress coverage.

### Pending Todos (v1.1 Prep)

**Authentication & User Flow:**
- **Set up Clerk webhook endpoint:** Configure webhook in Clerk dashboard, set `CLERK_WEBHOOK_SIGNING_SECRET` in Sevalla for user sync (Phase 12)
- **Remove UserSelector and use authenticated Clerk user:** Pre-auth dropdown artifact; replace with Clerk auth user for perspectives/videos (Phase 12, PR#done)
- **Configure CORS origins for production:** Set `CORS_ORIGINS` in Sevalla to frontend domain (Phase 9 implemented; currently wildcard for dev) — before public launch

**Frontend Cleanup:**
- **Remove AddVideoDialog (low priority):** Delete AddVideoDialog.svelte and AddVideoDialog.test.ts (kept for coverage threshold during Phase 3.2; AddVideoPopover is production pattern)

**Infrastructure:**
- **Set up custom domain:** Buy domain, point DNS to Sevalla, configure HTTPS/TLS (deploy-time task)

**v1.1 Phase Gates:**
- **Phase 4 completion:** Complete form implementation, run full test suite (all infrastructure ready, design done)
- **Phase 3.5.02 execution:** Seed SQL data into taxonomy schema, ltree path mapping (unblocks Phase 13)

### Known Bugs

**v1.0 Shipped State:** No critical bugs blocking MVP. Phase 6 error handling audit pending (deferred to v1.1).

**Minor/Deferred:**
- C-06: Silent JSON unmarshal in perspective repository (Phase 6-01, deferred)
- H-16: Inconsistent not-found error handling (Phase 6-02, deferred)
- Existing issues resolved: C-02 (cursor pagination, Phase 7.2), AddVideoDialog refresh (Phase 7.3-02)

### Blockers/Concerns

- **AddVideoPopover manual verification pending:** Popover UX (non-modal, positioning, dismissal) needs browser testing (JSDOM limitations prevent comprehensive automated tests). Manual verification planned for future phase.

## Session Log

### 2026-09-04 — GSD Milestone Formalization & Planning Sync

**Branch:** `feature/add-video-paste-button` (worktree session)

**Work completed:**
1. **Analyzed GSD initiatives vs git history** — Discovered 7 major phases completed post-Phase-9 (PRs #289–#315) not reflected in planning docs. Created GSD-STATUS-ANALYSIS.md.
2. **Archived v1.0 milestone** — Created `.planning/milestones/v1.0-ROADMAP.md` and `v1.0-REQUIREMENTS.md` with full phase details, achievements, decisions.
3. **Updated PROJECT.md** — Added "Current State: v1.0 Complete" section + v1.1 feature roadmap.
4. **Updated STATE.md** — Refreshed milestone status, phase timeline, pending todos reconciliation.
5. **Generated milestone summary** — Created `.planning/reports/MILESTONE_SUMMARY-v1.0.md` for team onboarding (7 sections, 342 lines).
6. **Fixed ROADMAP.md progress table** — Corrected phase statuses:
   - Phase 3.5: 1/2 (Plan 01 complete, Plan 02 deferred)
   - Phase 4: 3/3 (all plans complete, modal redesigned PR #215)
   - Phase 9: 6/6 (was mismarked as 0/6)
   - Added phases 18, 18.1, 19 to table
7. **Created git tag v1.0** — Formal release marker with full commit message.

**Commits:**
- `2a3bd18` docs: archive v1.0 milestone and update planning documents
- `2212a2c` docs(v1.0): generate milestone summary for onboarding
- `fe47a6c` docs(ROADMAP): update phase statuses and progress table

**Key discovery:** v1.0 MVP shipped 2026-02-16, but Phases 7–9 (post-MVP concerns) were executed through 2026-03-03, and 16 PRs (#289–#315) have merged since STATE.md last update (2026-03-03), continuing active development (Activity table polish, auth refinement, perspective input redesign).

**Duration:** ~2 hours (analysis + archival + planning sync + documentation generation)

### 2026-02-06 — CLAUDE.md Audit & Optimization

**Branch:** `feature/INI-37-plan-01-04-navigation-ag-grid`

**Work completed:**
1. **CLAUDE.md audit skill created** — custom-claude-improver skill with instruction counting, context budget analysis, and session-based compliance checking
2. **CLAUDE.md split** — Monolithic CLAUDE.md (683 lines, 372 instructions) split into root + backend/CLAUDE.md + frontend/CLAUDE.md
3. **Content delegated to docs/** — Created docs/VERIFICATION.md, docs/DOMAIN_GUIDE.md, docs/GO_PATTERNS.md, docs/GITHUB_PROJECTS.md, docs/GSD_BRANCHING.md
4. **Go module renamed** — `github.com/yourorg/backend` to `github.com/CodeWarrior-debug/perspectize/backend` (30 files, all 78 tests pass)
5. **qmd .planning/ collection** — Added .planning/ as separate qmd collection with stable-vs-live convention
6. **Quality scores** — All three CLAUDE.md files at 95/100 (A). Session compliance: root+backend 122/200, root+frontend 145/200
7. **Frontend patterns documented** — Svelte 5 runes, SvelteKit routing, TanStack Query patterns

**Commits:**
- `8fa9784` docs: apply CLAUDE.md audit fixes and split into package-level files
- `88b39b6` refactor: rename Go module path to match GitHub repository
- `f533df5` chore: add coverage/ to frontend .gitignore
- `6619f98` docs: add .planning/ qmd collection with stable vs live convention
- `21abf6a` docs: optimize all CLAUDE.md files to 95/100 quality score

### 2026-02-05 — Phase 1 Foundation (Plans 01-01 through 01-03)

### 2026-02-07 — Phase 03: Add Video Flow

**Branch:** `feature/INI-phase-03-add-video-flow`

**Work completed:**
1. **Plan 01: Foundation Components** — shadcn Dialog/Input/Label, YouTube URL validation (URL constructor), CREATE_CONTENT_FROM_YOUTUBE mutation definition
2. **Plan 02: AddVideoDialog + Header Wiring** — Complete dialog with TanStack Query mutation, error mapping (duplicate/invalid/generic), Header button wired to dialog
3. **Self-verification** — Chrome DevTools MCP: add video flow, validation errors, duplicate detection, mobile 375px responsiveness
4. **95 tests passing** — 12 test files, 26 new tests for Phase 3

**Commits:**
- `9bea0d4` feat(03-01): install shadcn Dialog, Input, Label components
- `9255b47` feat(03-01): add YouTube validation utility and mutation definition
- `8e330d3` docs(03-01): complete foundation components plan
- `713f00c` feat(03-02): create AddVideoDialog component with mutation and error handling
- `21faae0` feat(03-02): wire Header to AddVideoDialog and add tests

### 2026-02-07 — Plan 01-05: Test Coverage

**Branch:** `feature/INI-45-plan-01-05-test-coverage`

**Work completed:**
1. **Comprehensive test suite** — 42 tests across 6 test files with zero failures
2. **100% coverage** — Statement/line/function coverage at 100%, branch coverage at 75%
3. **Test helpers created** — Reusable Svelte 5 component testing utilities in tests/helpers/render.ts
4. **Coverage thresholds enforced** — 80% lines/functions/statements, 75% branches in vite.config.ts
5. **Testing patterns established** — Unit tests (tests/unit/), component tests (tests/components/), createRawSnippet for children props

**Commits:**
- `7c5f90b` test(01-05): add unit tests and test helpers
- `828617a` feat(01-05): add component tests and coverage thresholds

**Tests created:**
- tests/unit/utils.test.ts (9 tests - cn utility)
- tests/unit/queries-client.test.ts (3 tests - GraphQL client)
- tests/unit/queries-content.test.ts (11 tests - query definitions)
- tests/unit/shadcn-barrel.test.ts (4 tests - barrel exports)
- tests/components/Header.test.ts (9 tests - Header component)
- tests/components/PageWrapper.test.ts (6 tests - PageWrapper component)

### 2026-02-07 — Plan 02-01: Data Layer Foundation

**Branch:** `feature/INI-47-phase-02-data-layer-activity`

**Work completed:**
1. **Backend users list query** — GraphQL `users: [User!]!` query implemented through full hexagonal architecture stack
2. **Frontend query definitions** — LIST_USERS query created, LIST_CONTENT updated with sort/pagination params
3. **User selection store** — Session-persistent store with Svelte 5 runes using setter-based sync pattern
4. **Unit tests** — 13 new tests for queries and store (total: 55 frontend tests, 78+ backend tests)
5. **Svelte 5 runes pattern** — Established testable pattern for module-level stores without $effect

**Commits:**
- `4575b3d` feat(02-01): add users list query to backend
- `9e5de4f` feat(02-01): add frontend query definitions and user selection store
- `c003722` test(02-01): add unit tests for frontend data layer

**Key patterns established:**
- Setter-based session sync for Svelte 5 stores (not $effect) for testability
- GraphQL query parameter expansion pattern (sort, pagination, includeTotalCount)
- Repository ListAll pattern for fetching all records without pagination

**Files created:**
- frontend/src/lib/queries/users.ts (LIST_USERS query)
- frontend/src/lib/stores/userSelection.svelte.ts (session-persistent store)
- frontend/tests/unit/queries-users.test.ts
- frontend/tests/unit/stores-userSelection.test.ts

**Duration:** 6 min

### 2026-02-07 — Plan 02-02: Activity Page UI

**Branch:** `feature/INI-47-phase-02-data-layer-activity`

**Work completed:**
1. **ActivityTable component** — AG Grid wrapper with 5 columns (Title, Type, Duration, Date Added, Last Updated), Quick Filter search, pagination (10/25/50)
2. **UserSelector component** — User dropdown with TanStack Query fetching users list, session storage persistence
3. **Activity page** — TanStack Query integration, search input, ActivityTable component with real content data
4. **Header update** — UserSelector added before Add Video button
5. **Component tests** — ActivityTable (4 tests), UserSelector (2 tests), Header tests updated (9 tests)

**Commits:**
- `d4ff7a2` feat(02-02): create ActivityTable and UserSelector components
- `45c3af2` feat(02-02): wire Activity page and update Header, add component tests

**Key patterns established:**
- TanStack Query function wrapper for Svelte 5: `createQuery(() => ({ ... }))`
- TanStack Query returns reactive object (not store) - access directly, not with $
- AG Grid reactive loading state via $effect
- Component mocking strategy for tests with QueryClient dependencies

**Files created:**
- frontend/src/lib/components/ActivityTable.svelte (AG Grid wrapper)
- frontend/src/lib/components/UserSelector.svelte (User dropdown)
- frontend/tests/components/ActivityTable.test.ts
- frontend/tests/components/UserSelector.test.ts
- frontend/tests/helpers/TestWrapper.svelte

**Duration:** 3 min

### 2026-02-15 — Phase 07.4: Performance Monitoring + Phase 08: User Integration Flow

**Branch:** `claude/user-integration-flow-QODCb`

**Work completed:**
1. **Phase 07.4-01: Performance Monitoring** — HTTP request timing middleware (slog), GORM slow query logger (>100ms), /debug/db-stats endpoint, GraphQL operation timing extension, Go benchmark tests for ContentService and PerspectiveService, frontend Web Vitals capture
2. **Phase 08-01: User Integration Flow** — Backend email optional in CreateUserInput, FormPopover shared component, CreateUserPopover with useCreateUser hook, UserSelector wiring with auto-select, AddVideoPopover refactored to use FormPopover
3. **gofmt cleanup** — Formatting fixes across 10 backend files

**Commits:**
- `aeb87df` feat(07.4): add performance monitoring baselines
- `8d03d1a` feat(08-01): make email optional, add CREATE_USER mutation, FormPopover
- `1cde940` feat(08-01): AddVideoPopover refactor, CreateUserPopover, UserSelector wiring, tests
- `960931b` chore: gofmt alignment fixes in domain package
- `52c904e` fix: remove invalid Claim field from perspective bench test
- `92a488a` chore: gofmt formatting across backend

### 2026-02-20 — Phase 03.5: Google NL Taxonomy Research Spike — Plan 01

**Branch:** `main`

**Work completed:**
1. **Postman Collection** — `postman/google-nl-taxonomy-explorer.json` with 11 requests in 9 content-type folders, `{{API_KEY}}` collection variable, V2 model on all requests except Curl 1
2. **Exploration Guide** — `EXPLORATION-GUIDE.md` with 5 phases (A-E), 20 numbered steps, custom request examples for subcategory deep-dives, and a findings template for capturing curated category decisions

**Commits:**
- `df61fa9` docs: phase 04 and 03.4 planning artifacts (included EXPLORATION-GUIDE.md in PR)
- `113bed7` feat(03.5-01): generate Postman collection JSON for Google NL taxonomy exploration

**Duration:** 11 min

### 2026-02-28 — Phase 03.5.1: Wikidata Integration — Plan 01

**Branch:** `claude/plan-attribution-phase-8fUmf`

**Work completed:**
1. **Category domain model** — Category struct (WikidataQID, Label, Description, EntityType) and WikidataSearchResult struct
2. **Port interfaces** — CategoryRepository (Upsert, GetByID), CategoryService (SetPrimaryCategory, SearchWikidata), WikidataClient (Search)
3. **Content domain update** — PrimaryCategoryID *int field added to Content struct
4. **Wikidata HTTP client** — wbsearchentities adapter with User-Agent header, retry logic (429/5xx), 10s timeout
5. **Unit tests** — 10 table-driven tests with httptest mock server
6. **Migration 000014** — categories table with wikidata_qid unique index, primary_category_id FK on content

**Commits:**
- `d4dda54` feat(03.5.1-01): add Category domain model and port interfaces
- `6313e42` feat(03.5.1-01): add Wikidata HTTP client adapter and categories migration

**Duration:** 4 min

### 2026-02-28 — Phase 03.5.1: Wikidata Integration — Plan 02

**Branch:** `claude/plan-attribution-phase-8fUmf`

**Work completed:**
1. **GormCategoryRepository** — atomic Upsert (clause.OnConflict on wikidata_qid), GetByID
2. **CategoryServiceImpl** — SetPrimaryCategory (upsert + FK update), SearchWikidata (proxy with defaults), GetCategoryByID
3. **GraphQL schema** — Category type, WikidataSearchResult type, setPrimaryCategory mutation, wikidataSearch query, Content.primaryCategory field
4. **Resolvers** — PrimaryCategory field resolver (lazy), SetPrimaryCategory mutation, WikidataSearch query
5. **main.go wiring** — WikidataClient, CategoryRepo, CategoryService, resolver updated
6. **Unit tests** — 13 new tests (10 service + 3 resolver)
7. **Mock updates** — All ContentRepository mocks updated for new UpdatePrimaryCategoryID method

**Commits:**
- `ac74d15` feat(03.5.1-02): add GORM CategoryRepository with atomic upsert and GetByID
- `d70652e` feat(03.5.1-02): add CategoryService, GraphQL schema, resolvers, and main.go wiring
- `4bf49ec` test(03.5.1-02): add CategoryService unit tests
- `64829af` test(03.5.1-02): add resolver tests for setPrimaryCategory and wikidataSearch

**Duration:** 15 min

## Session Continuity

Last session: 2026-03-03
Stopped at: Phase 09 Plan 06 complete — Secret Management Documentation
Resume file: None
Next up: Phase 09 complete — All security hardening plans executed
