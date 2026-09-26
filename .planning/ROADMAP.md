# Roadmap: Perspectize

## Milestones

- ✅ **v1.0 Frontend MVP** — Phases 1–9, 17 (Shipped 2026-02-16, formalized 2026-09-04)
- 🚧 **v1.1 Platform Expansion** — Phases 4, 4.1, 6, 8.1, 10, 11–16 (Planned)
- 🚧 **v1.2 Jeeves AI Assistant** — Phases 25–28 (runs in parallel with v1.1; 26–28 provisional)

## v1.0 Overview (ARCHIVED)

**Status:** ✅ COMPLETE & SHIPPED

v1.0 delivered a functional SvelteKit frontend for discovering YouTube videos, adding new videos via URL paste, and viewing content in AG Grid. Included post-MVP concerns remediation (architecture cleanup, security hardening, caching fixes).

**See:** `.planning/milestones/v1.0-ROADMAP.md` for full phase details

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - SvelteKit project setup with design system, tooling, and navigation skeleton
- [x] **Phase 2: Data Layer + Activity** - TanStack Query integration, AG Grid table, user selector
- [x] **Phase 2.1: Mobile Responsive Fixes** - Fix header overflow, pagination bar, and table layout at 375px (INSERTED)
- [x] **Phase 3: Add Video Flow** - YouTube URL paste, auto-fetch metadata, toast notifications
- [x] **Phase 3.1: Design Token System** - Implement all 27 Figma color variables, Geist + Charter typography, rating colors in code (INSERTED — rescoped)
- [x] **Phase 3.2: Activity Page Beta Quality** - Rebuild Activity page to beta quality with server-side ops, new columns, popover dialog, data provenance (INSERTED)
- [x] **Phase 3.3: Repository Rename & Folder Restructure** - OBSOLETE — repo already named `perspectize`, folders already `backend/` + `frontend/` (INSERTED)
- [ ] **Phase 3.4: Perspectize Branding & Glasses Identity** - Glasses motif with 3 shapes, 8-color palette picker, JSONB preferences, avatar display, onboarding (INSERTED)
- [ ] **Phase 3.5: Google NL Taxonomy Research Spike** - Deep-dive on Google taxonomy depth, traversal, subcategories, ltree mapping, YouTube classification (INSERTED)
- [ ] **Phase 4: Add Perspective Flow** - TanStack Form with ratings, Like, Review, validation
- [ ] **Phase 4.1: GraphQL Dataloaders for N+1 Query Prevention** - Batch loading for Perspective→User, Perspective→Content, Content→User nested fields (INSERTED)
- [x] **Phase 5: Testing + Deployment** - Coverage met, deployed on Sevalla, CORS working (wildcard — restriction deferred to Phase 9)

## Phase Details

### Phase 1: Foundation
**Goal**: Establish project scaffolding with all core libraries, mobile-first design system, and navigation working end-to-end
**Depends on**: Nothing (first phase)
**Requirements**: SETUP-01, SETUP-02, SETUP-03, SETUP-04, SETUP-05, SETUP-06, SETUP-07, SETUP-08, SETUP-09, NAV-01, NAV-02, NAV-03, NAV-04, NAV-05, API-01, TEST-01, TEST-02
**Success Criteria** (what must be TRUE):
  1. Activity page has "Add Video" button in header (modal placeholder — full modal in Phase 3)
  2. Application loads with custom navy theme (#1a365d) and Inter font applied
  3. Toast notifications appear in top-right and auto-dismiss after 2 seconds
  4. AG Grid renders a test table (validation that wrapper works with Svelte 5)
  5. Layout works on iPhone SE (375px) and scales up to desktop
  6. Folder structure documented with example files in each folder
  7. Test coverage >80% on all foundation source files with enforced thresholds
**Plans**: 5 plans in 3 waves

Plans:
- [x] 01-01-PLAN.md - SvelteKit + Tailwind + shadcn + Inter font + folder structure docs
- [x] 01-02-PLAN.md - Mobile-first layout system (Header, PageWrapper, breakpoints)
- [x] 01-03-PLAN.md - TanStack Query + GraphQL client + Toast + Vitest
- [x] 01-04-PLAN.md - Navigation + AG Grid validation (checkpoint)
- [x] 01-05-PLAN.md - Comprehensive test coverage (>80%) with testing conventions

### Phase 2: Data Layer + Activity
**Goal**: Users can view recently updated content in an AG Grid table (Activity page, default landing)
**Depends on**: Phase 1
**Requirements**: ACT-01, ACT-02, ACT-03, ACT-04, ACT-05, ACT-06, USER-01, USER-02, API-03, TEST-03
**Success Criteria** (what must be TRUE):
  1. User can view Activity page showing most recently updated content (default sort by updatedAt desc)
  2. User can sort the table by any column (ascending/descending)
  3. User can filter the table by text search (searches title, description)
  4. User can paginate with page size selector (10/25/50) using cursor-based navigation
  5. User can select from existing users via dropdown, selection persists across navigation
**Plans**: 2 plans in 2 waves

Plans:
- [x] 02-01-PLAN.md — Backend users query + frontend query definitions + user selection store + tests
- [x] 02-02-PLAN.md — Activity page with AG Grid table, UserSelector in header, visual checkpoint

### Phase 2.1: Mobile Responsive Fixes (INSERTED)
**Goal**: Fix P1/P2 mobile responsive issues at 375px so the Activity page is fully usable on iPhone SE
**Depends on**: Phase 2
**Success Criteria** (what must be TRUE):
  1. Header fits at 375px — logo, user selector, and Add Video button all visible without clipping
  2. AG Grid pagination bar is readable and usable at 375px
  3. Table content aligns within viewport bounds (no left-shift overflow)
**Plans**: 2 plans in 2 waves

Plans:
- [x] 02.1-01-PLAN.md — Header responsive fix (min-w-0, truncate, shrink-0) + AG Grid pagination CSS override
- [x] 02.1-02-PLAN.md — Table responsive column hiding + visual checkpoint at 375px

### Phase 3: Add Video Flow
**Goal**: Users can add YouTube videos by pasting a URL, with automatic metadata fetch and feedback
**Depends on**: Phase 2
**Requirements**: VIDEO-01, VIDEO-02, VIDEO-03, VIDEO-04, VIDEO-05, TEST-04
**Success Criteria** (what must be TRUE):
  1. User can paste a YouTube URL and submit to add a video
  2. Backend auto-fetches video metadata (title, description, thumbnail, duration) on creation
  3. User sees success toast (top-right, 2s auto-dismiss) after video creation
  4. User sees error toast if URL is invalid or fetch fails
  5. User is warned via toast if video already exists (duplicate detection)
**Plans**: 2 plans in 2 waves

Plans:
- [x] 03-01-PLAN.md — YouTube URL validation utility, mutation definition, shadcn Dialog/Input/Label setup
- [x] 03-02-PLAN.md — AddVideoDialog component with mutation, error handling, Header wiring, visual checkpoint

### Phase 3.1: Design Token System (INSERTED — rescoped from Dialog UX Polish)
**Goal**: Implement all Figma design tokens in code — 27 color variables, Geist + Charter dual-font typography, rating colors — so that all shadcn components render correctly and Phase 3.2+ can build on a complete token foundation
**Depends on**: Phase 3
**Success Criteria** (what must be TRUE):
  1. All 22 Theme/Light color tokens from DESIGN_SPEC.md are defined in app.css and usable via Tailwind classes (bg-background, text-foreground, etc.)
  2. All 4 rating color tokens are defined (rating-positive, rating-neutral, rating-negative, rating-undecided)
  3. Charter font is loaded and available via font-serif utility class
  4. Geist + Charter dual-font system works (Geist for UI, Charter for body/content)
  5. Existing components (Dialog, Header, shadcn primitives) render correctly with the new tokens — no visual regressions
**Plans**: 2 plans in 2 waves

Plans:
- [x] 03.1-01-PLAN.md — Complete color token system (27 tokens) + Charter font setup in app.css
- [x] 03.1-02-PLAN.md — AG Grid branded theming + visual verification checkpoint

### Phase 3.2: Activity Page Beta Quality (INSERTED)
**Goal**: Get every element on the Activity page — table, header, layout, dialog — to beta quality. Rebuild on top of Phase 3.1 design tokens. Server-side sorting/filtering/pagination, new YouTube columns, popover dialog, data provenance infrastructure. Source-data columns only.
**Depends on**: Phase 3.1
**Success Criteria** (what must be TRUE):
  1. Server-side sorting — column header clicks send sort params to GraphQL API, backend returns pre-sorted data
  2. Per-column filters — no global search bar; each column header has its own filter control
  3. Server-side pagination — one page at a time from backend, total count displayed, page size selector (10/25/50)
  4. 6 default visible columns: Item (title+thumbnail), Type (YouTube icon), Length, Views, Likes, Date (YouTube publish date)
  5. Column chooser with hidden columns: Channel, Date Added, Date Updated, Tags, Description
  6. New YouTube fields exposed through GraphQL (view count, like count, channel, publish date, tags)
  7. Compact rows (~40-48px height) matching Figma reference (node 3:409)
  8. Sticky page header + sticky table header, table body scrolls independently
  9. Add Video dialog: popover-near-button pattern (no overlay), page stays interactive while open
  10. Data provenance visual infrastructure: columns grouped by source, tooltip on header hover, visual tier indicators
  11. Empty state: "No items yet - add the first one!" in table body area
  12. Mobile: Only Title + Type columns visible at <768px
  13. Mobile: Header shows icon-only buttons at <768px
  14. Mobile: Popovers become dialogs at <768px
  15. All filterable columns have floating filters enabled
  16. Navy header with white text/icons
  17. AG Grid wrapped in card container
  18. YouTube icon centered in cell
  19. Unit tests for all new functionality
**Plans**: 8 plans in 3 waves

Plans:
- [x] 03.2-01-PLAN.md — Backend: expose YouTube fields (channelTitle, publishedAt, tags, description) + extend sort/filter
- [x] 03.2-02-PLAN.md — Frontend: popover dialog redesign (replace modal with non-modal popover)
- [x] 03.2-03-PLAN.md — Frontend: ActivityTable rewrite (server-side pagination, new columns, compact rows, sticky headers, provenance)
- [x] 03.2-04-PLAN.md — Integration polish, test coverage, visual verification checkpoint
- [x] 03.2-05-PLAN.md — Navy header styling, AG Grid card container, theme param fixes (D-01, D-02, D-06)
- [x] 03.2-06-PLAN.md — Column filter types, floating filters on all columns, YouTube icon centering (D-09, D-10)
- [x] 03.2-07-PLAN.md — Mobile responsive: column hiding, icon-only buttons, hidden thumbnails, compact pagination (M-01, M-03, M-05, M-06)
- [x] 03.2-08-PLAN.md — Mobile popovers to dialogs, shadcn Select for UserSelector (M-04, D-03)

### Phase 3.3: Repository Rename & Folder Restructure (INSERTED)
**Goal**: Rename repository from perspectize to perspectize, restructure folders (backend → backend, fe → fe), update all Go imports, fix CI/CD and Sevalla deployment pointers
**Depends on**: Phase 3.2
**Success Criteria** (what must be TRUE):
  1. GitHub repository renamed to `perspectize`
  2. `backend/` renamed to `backend/` with all Go import paths updated and tests passing
  3. `frontend/` renamed to `frontend/` with all config paths updated and build passing
  4. Sevalla deployment updated to point to new directory structure
  5. All CLAUDE.md files, docs, and planning references updated to reflect new paths
  6. CI/CD (if any) updated for new paths
**Plans**: 3 plans in 3 waves

Plans:
- [x] 03.3-01-PLAN.md — OBSOLETE (repo already named perspectize, Go module path already correct)
- [x] 03.3-02-PLAN.md — OBSOLETE (folders already backend/ and frontend/)
- [x] 03.3-03-PLAN.md — OBSOLETE (Sevalla already deployed with current structure)

### Phase 3.4: Perspectize Branding & Glasses Identity (INSERTED)
**Goal**: Establish the Perspectize brand identity through the "glasses" motif — a `<GlassesIcon>` Svelte component with 3 shapes (sunglasses, round pince-nez, oval pince-nez), preset color palette picker, user preferences storage (JSONB), and glasses shown in user avatars across the app.
**Depends on**: Phase 3.3
**Success Criteria** (what must be TRUE):
  1. `<GlassesIcon>` Svelte component renders 3 shapes (sunglasses, round pince-nez, oval pince-nez) with 8-color gradient palette
  2. Preset color palette picker with 8 curated colors (each defines stroke + gradient stops)
  3. Shape toggle + color swatch picker UI wired to local state with live preview
  4. User preferences JSONB column in database (`{"glasses": {"shape": "oval", "color": "purple"}}`)
  5. Go API endpoint to persist/retrieve glasses preferences
  6. Glasses displayed in user avatars across app (header UserSelector + current user AG Grid rows)
  7. "Pick your glasses" onboarding flow for first-run setup (skippable)
  8. ~~Jeeves bot personality brief documented~~ DESCOPED (deferred to future phase)
  9. ~~Chat UI treatment guidelines defined~~ DESCOPED (deferred to future phase)
  10. ~~Brand guidelines document created in frontend/docs/~~ DESCOPED (deferred to future phase)
**Plans**: 4 plans in 3 waves

Plans:
- [ ] 03.4-01-PLAN.md — Backend: domain types, migration 000012, GORM model/mapper, repository, GraphQL schema/resolver
- [ ] 03.4-02-PLAN.md — Frontend: GlassesIcon Svelte component with 3 shapes + 8-color palette + types + tests
- [ ] 03.4-03-PLAN.md — Frontend: GlassesPickerPopover, mutation hook, GQL definition, LIST_USERS preferences field
- [ ] 03.4-04-PLAN.md — Integration: UserSelector wiring, AG Grid cell renderer, onboarding flow, random defaults, visual checkpoint

**Details:**
The glasses motif is the core brand element — "perspectives" seen through different lenses. Three shapes with purple gradient palettes (light: #9F7AEA/#44337A, dark: #B794F4/#9F7AEA). SVG reference designs in phase directory. Implementation order: component → picker UI → backend storage → avatar integration → onboarding.

**Cleanup:** Delete the source reference file from Downloads after execution complete.

**Reference:** `.planning/phases/03.4-jeeves-branding-identity/REFERENCE-glasses.md`

### Phase 3.5: Google NL Taxonomy Research Spike (INSERTED)
**Goal**: Produce implementation-ready taxonomy artifacts -- Postman collection for interactive API exploration, curated category list with ltree paths, SQL seed data, and YouTube category mapping -- to unblock Phase 13 (Content Categories) and Phase 4B (AG Grid grouping)
**Depends on**: Phase 3.4
**Plans**: 2 plans in 2 waves (1/2 complete)

Plans:
- [x] 03.5-01-PLAN.md — Postman collection JSON (11 requests) + step-by-step exploration guide (COMPLETE)
- [ ] 03.5-02-PLAN.md — Curated category list, ltree seed SQL, YouTube mapping document, user review checkpoint (DEFERRED to v1.1)

**Details:**
Research spike to answer blocking questions before committing to categorization architecture:
1. **Taxonomy depth:** How many levels does Google NL taxonomy have? (currently only using top-level 20/27)
2. **Traversal:** How to see all categories at one level, drill deeper, go higher
3. **Subcategory mapping:** What subcategories exist under top categories like Sports, Arts, etc.?
4. **ltree fit:** Does the taxonomy hierarchy map cleanly to PostgreSQL ltree paths?
5. **YouTube mapping:** Can YouTube video metadata (tags, channel, description) reliably map to taxonomy nodes?
6. **Custom categories:** How do user-created categories coexist with Google taxonomy in the hierarchy?

Cross-phase impact: Unblocks Phase 13 (Content Categories), Phase 14 (AG Grid Power Features), and Phase 4B (perspective display with grouping). See `04-CONTEXT.md` and `13-context.md` for architecture decisions already captured.

### Phase 03.5.1: Wikidata Integration and Category Attribution (INSERTED)

**Goal:** Build a Wikidata-backed category system for content items — users manually search Wikidata entities via a typeahead in the AG Grid ActivityTable, select one as the content's primary category, with categories cached locally in a dedicated table
**Requirements**: TBD (inserted urgent phase — no specific requirement IDs)
**Depends on:** Phase 3.5
**Success Criteria** (what must be TRUE):
  1. User can see a "Category" column in the ActivityTable
  2. User can click an empty category cell and search Wikidata entities via typeahead
  3. User can select a Wikidata entity to assign as the content's primary category
  4. User can see the assigned category label in the ActivityTable cell
  5. User can change an existing category by clicking and selecting a different one
  6. Categories persist across page refresh (stored in database)
  7. Wikidata client sends User-Agent header per Wikidata policy
  8. All backend and frontend tests pass
**Plans:** 4/4 plans complete

Plans:
- [ ] 03.5.1-01-PLAN.md — Backend domain model, ports, migration 000014, Wikidata HTTP client adapter
- [ ] 03.5.1-02-PLAN.md — GORM repository, CategoryService, GraphQL schema/resolvers, main.go wiring
- [ ] 03.5.1-03-PLAN.md — Frontend query definitions, mutation hook, query keys, CategoryTypeahead component
- [ ] 03.5.1-04-PLAN.md — AG Grid category column, cell renderer, popover integration, responsive tiers

### Phase 4: Add Perspective Flow
**Goal**: Users can create perspectives on videos with ratings, Like, and Review text
**Depends on**: Phase 3
**Requirements**: PERSP-01, PERSP-02, PERSP-03, PERSP-04, PERSP-05, PERSP-06, PERSP-07, PERSP-08, PERSP-09, USER-03, TEST-05
**Success Criteria** (what must be TRUE):
  1. User can select a video to add a perspective on
  2. User can set Quality, Agreement, Importance, and Confidence ratings via number inputs with progress bar visualization
  3. User can enter Like text and Review text (freeform)
  4. User sees validation error toasts before submission if form is invalid
  5. User sees success toast after perspective is created, attributed to selected user
**Plans**: 3 plans in 3 waves (3/3 complete)

Plans:
- [x] 04-01-PLAN.md — Backend schema migration (perspective refs, claim type), domain/GORM/GraphQL extensions, frontend query definitions + mutation hooks + tests (COMPLETE)
- [x] 04-02-PLAN.md — Modal UI redesign (PR #215 merged), form infrastructure ready (COMPLETE)
- [x] 04-03-PLAN.md — TanStack Form integration, mutation hooks, claim triggers ready (COMPLETE)

**Status**: All plans executed. Form UI redesigned (PR #215), infrastructure ready for v1.1 completion.

### Phase 04.1: GraphQL Dataloaders for N+1 Query Prevention (INSERTED)

**Goal:** Implement dataloader batching for 3 N+1-vulnerable nested GraphQL relationships so that queries like `perspectives { items { user { ... } content { ... } } }` execute 3 SQL queries (batch) instead of 1+N+N (individual)
**Depends on:** Phase 4 (nested fields become queryable after perspective flow exists)
**Source:** Dataloader analysis (2026-02-24) — 3 relationships, 0 batch methods, 0 field resolvers
**Success Criteria** (what must be TRUE):
  1. `vikstrous/dataloadgen` library added as dependency (type-safe generics, gqlgen-native)
  2. Batch repository methods exist: `UserRepository.GetByIDs()`, `ContentRepository.GetByIDs()` with `WHERE id IN (?)` queries
  3. Custom field resolvers for `Perspective.user`, `Perspective.content`, `Content.addedBy` (gqlgen `resolver: true` in gqlgen.yml)
  4. Per-request dataloader middleware injects loaders into context (HTTP middleware, not global cache)
  5. Field resolvers call dataloaders (not direct DB queries) — batching verified via slow query log
  6. Nested fields return populated data (not nil) when requested in GraphQL queries
  7. All existing backend tests pass
**Plans:** 2 plans in 2 waves

Plans:
- [ ] 04.1-01-PLAN.md — Batch repository methods (GetByIDs) + dataloadgen loaders package with per-request middleware
- [ ] 04.1-02-PLAN.md — gqlgen field resolvers + main.go wiring + N+1 prevention integration tests

**Details:**
Analysis found zero dataloader infrastructure: no batch libraries in go.mod, no `GetByIDs()` methods, no custom field resolvers. The 3 generated field resolvers (`_Perspective_user`, `_Perspective_content`, `_Content_addedBy`) return `obj.Field` which is always nil because `helpers.go` converters never populate nested pointers. Architecture: dataloaders live in `internal/adapters/graphql/dataloaders/` (adapter layer), call service/repository batch methods, never leak into domain. Related to Phase 8.1 M-08 (missing nested field resolvers).

### Phase 5: Testing + Deployment
**Goal**: Application is tested, deployed, and accessible via public URL with proper CORS
**Depends on**: Phase 4
**Requirements**: TEST-06, DEPLOY-01, DEPLOY-02, DEPLOY-03, API-02
**Success Criteria** (what must be TRUE):
  1. Final coverage verification shows >=80% of lines covered
  2. Frontend is deployed and accessible via public URL
  3. CI/CD pipeline runs tests and deploys automatically on push
  4. CORS is configured on backend to allow frontend origin
**Plans**: 3 plans in 2 waves

Plans:
- [x] 05-01-PLAN.md — Coverage verification — SKIPPED (thresholds already met: 87.6% stmts, 90.1% lines)
- [x] 05-02-PLAN.md — Sevalla static site deployment (cleanup GitHub Pages artifacts, deploy frontend) — COMPLETED (deployed manually)
- [x] 05-03-PLAN.md — SKIPPED (CORS already working with wildcard `*`; restriction to specific origin deferred to Phase 9 C-05)

---

## Post-MVP: Concerns Remediation (Phases 6-10)

Phases 6-10 address issues from the bug backlog (`.planning/phases/bugs/BACKLOG.md`, gitignored). Ordered by dependency: fix errors first, then architecture, then schema, then security (which depends on clean architecture), then frontend. Each phase is a living checklist -- items can be picked off incrementally.

- [ ] **Bugs (persistent)** - Ongoing bug tracking and fixes (`.planning/phases/bugs/`, gitignored — see `.docs/BUG_TRACKING.md`)
- [ ] **Phase 6: Error Handling & Data Integrity** - Fix silent failures, error leakage, and config validation
- [x] **Phase 7: Backend Architecture** - Hexagonal cleanup, dependency injection, server infrastructure
- [x] **Phase 7.1: ORM Migration -- sqlx to GORM** - Replace sqlx with GORM using hex-clean separate model pattern (INSERTED)
- [x] **Phase 7.2: gorm-cursor-paginator Integration** - Fix C-02 cursor pagination for non-ID sorts, replace hand-rolled cursor encoding (INSERTED)
- [x] **Phase 7.3: Frontend Caching Remediation** - Fix TanStack Query bypass, dual-signal anti-pattern, eruda in prod, query key design, security gaps (INSERTED)
- [x] **Phase 7.4: Performance Monitoring** - Request timing, GORM slow query logging, DB stats, GraphQL timing, Go benchmarks, Web Vitals (INSERTED)
- [x] **Phase 8: User Integration Flow** - Frontend create user flow, shared FormPopover, optional email in schema (INSERTED)
- [ ] **Phase 8.1: API & Schema Quality** - Fix GraphQL types, race conditions, nested resolvers
- [x] **Phase 9: Security Hardening** - Authentication, rate limiting, query complexity, headers, HTTPS (completed 2026-03-03)
- [ ] **Phase 10: Frontend Quality & Test Coverage** - XSS fix, codegen, error boundaries, cleanup, test gaps

### Phase 8: User Integration Flow (INSERTED)
**Goal**: Enable frontend user creation via shared FormPopover component, make email optional in backend schema
**Depends on**: Phase 7.3 (caching patterns established)
**Success Criteria** (what must be TRUE):
  1. CreateUserInput.email is optional (String, not String!) in GraphQL schema
  2. FormPopover is a shared component used by both AddVideoPopover and CreateUserPopover
  3. CreateUserPopover has a single username input field and calls createUser mutation
  4. On successful user creation, users.list query cache is invalidated
  5. On successful user creation, the new user is auto-selected in UserSelector
  6. UserSelector shows a create user trigger that opens CreateUserPopover
  7. AddVideoPopover refactored to use FormPopover (no behavior change)
**Plans**: 1 plan in 1 wave

Plans:
- [x] 08-01-PLAN.md — Backend email optional, FormPopover shared component, CreateUserPopover, UserSelector wiring

### Phase 6: Error Handling & Data Integrity
**Goal**: Eliminate all silent failures so errors are visible, logged, and surfaced correctly to clients
**Depends on**: Phase 5 (CI/CD catches regressions)
**Source**: Bug Backlog C-06, C-07, C-08, H-13, H-16, H-19, H-20, H-21, M-03, M-27
**Success Criteria** (what must be TRUE):
  1. All `json.Unmarshal` calls check and handle errors (C-06, C-08)
  2. All `strconv`/`time.Parse` calls check and handle errors (C-07, C-08)
  3. GraphQL error responses never expose database schema or internal details (H-13)
  4. Not-found handling is consistent across all resolvers -- standardized pattern (H-16, M-07)
  5. `.env` load warns if file missing in dev; YouTube API key validated at startup (H-19, H-20)
  6. `WriteString` return value checked in IntID marshal (H-21)
  7. `CreateFromYouTube` returns existing item on duplicate instead of error (M-03)
  8. `formatDate` handles invalid input gracefully (M-27)
**Plans**: 2 plans in 2 waves

Plans:
- [ ] 06-01-PLAN.md — Fix silent failures: log CategorizedRatings parse, idempotent CreateFromYouTube, IntID WriteString check
- [ ] 06-02-PLAN.md — Standardize not-found handling, sanitize GraphQL errors, enforce YouTube API key in production

**Concern checklist:**
- [ ] C-06: Silent JSON unmarshal in perspective repository → **06-01**
- [x] C-07: Silent duration parse in YouTube client → **ALREADY FIXED** (parser.go returns fmt.Errorf)
- [x] C-08: Five silent parse failures in `domainToModel` helpers → **MOSTLY FIXED** (parseStatCount logs via slog.Warn; remaining: CategorizedRatings in gorm_mappers → 06-01)
- [ ] H-13: Sensitive data leaked in GraphQL errors → **06-02**
- [ ] H-16: Inconsistent not-found error handling across resolvers → **06-02**
- [x] H-19: `.env` load failure silently ignored → **ALREADY FIXED** (main.go warns unless production)
- [ ] H-20: Empty YouTube API key not validated at startup → **06-02** (warn → fatal in production)
- [ ] H-21: `WriteString` return value ignored in IntID → **06-01**
- [ ] M-03: `CreateFromYouTube` returns error instead of idempotent result → **06-01**
- [ ] M-07: Inconsistent not-found (duplicate of H-16) → **06-02**
- [x] M-27: `formatDate` silently produces "Invalid Date" → **ALREADY FIXED** (returns '—' for invalid input)

### Phase 7: Backend Architecture
**Goal**: Clean up hexagonal architecture violations, add proper dependency injection, and harden server infrastructure
**Depends on**: Phase 6 (error handling patterns established first)
**Source**: Bug Backlog H-01, H-02, H-09, M-01, M-02, M-05, M-06, M-09, M-10, M-12, M-17
**Success Criteria** (what must be TRUE):
  1. No adapter-to-adapter imports -- resolvers use service ports only (H-01, H-02)
  2. Service port interfaces defined; resolver depends on interfaces, not concrete types (H-02)
  3. Config path loaded from env var with sensible default (H-09)
  4. Single PostgreSQL driver (`pgx`) -- `lib/pq` removed (M-01)
  5. DB pool settings configurable via env vars (M-02)
  6. YouTube `extractVideoID` injected via constructor, not function param (M-05)
  7. Request logging middleware installed (chi router or similar) (M-06)
  8. Graceful shutdown with SIGTERM handler (M-09)
  9. `/health` and `/ready` endpoints exist (M-10)
  10. DB credentials sanitized before logging (M-12)
  11. `DATABASE_URL` format validated at startup (M-17)
**Plans**: 3 plans in 2 waves

Plans:
- [x] 07-01-PLAN.md — Service port interfaces, ExtractVideoID on YouTubeClient, resolver DI refactor
- [x] 07-02-PLAN.md — Replace lib/pq with custom array types, configurable DB pool, config env var, DSN validation
- [x] 07-03-PLAN.md — Chi router with middleware, /ready endpoint, graceful shutdown coordination

**Concern checklist:**
- [x] H-01: Adapter-to-adapter coupling (resolver imports YouTube adapter directly)
- [x] H-02: Resolver depends on concrete service types (no port interfaces)
- [x] H-09: Hardcoded config path
- [x] M-01: Dual PostgreSQL driver dependencies (`lib/pq` + `pgx`)
- [x] M-02: Hardcoded database connection pool settings
- [x] M-05: Function parameter instead of dependency injection
- [x] M-06: No request logging middleware
- [x] M-09: No graceful shutdown handler
- [x] M-10: No health check endpoint
- [x] M-12: DB credentials in logs on failure
- [x] M-17: No `DATABASE_URL` format validation

### Phase 7.1: ORM Migration -- sqlx to GORM (INSERTED)
**Goal**: Replace sqlx with GORM using hex-clean separate model pattern (domain models stay pure, GORM models in adapter layer). Eliminate ~35% of repository boilerplate while preserving hexagonal architecture.
**Depends on**: Phase 7 (clean architecture + single pgx driver must be in place first)
**Success Criteria** (what must be TRUE):
  1. All 3 repository implementations (user, content, perspective) migrated from sqlx to GORM
  2. Domain models (`core/domain/`) have zero GORM imports or tags -- hex-clean
  3. GORM models live in `adapters/repositories/postgres/` with `gorm:` tags
  4. Cursor pagination works with opaque base64 cursors (reuses existing encoding functions)
  5. Dynamic ORDER BY works for all sort fields including JSONB path expressions
  6. Dynamic WHERE filters work via GORM chaining (no boolean flag pattern)
  7. Custom `StringArray`/`Int64Array` types (from Phase 7) used -- no `lib/pq` imports in any active code
  8. All existing tests pass (mock interfaces unchanged)
  9. No performance regression -- GORM reflection overhead negligible vs DB round-trip
**Plans**: 3 plans in 3 waves

Plans:
- [x] 07.1-01-PLAN.md — GORM deps, models, mappers, ConnectGORM, GormUserRepository
- [x] 07.1-02-PLAN.md — GormContentRepository + GormPerspectiveRepository (pagination, JSONB sort, dynamic filters)
- [x] 07.1-03-PLAN.md — Wire GORM in main.go, archive sqlx files, remove sqlx dependency, verify

**Architecture decision:**
- **Chosen:** GORM with separate GORM models (hex-clean)
- **Rejected:** sqlc (dynamic ORDER BY blocker, jsonb[] bugs), GORM with tags on domain models (architecture compromise), staying with sqlx (missed 35% reduction)
- **Prototype:** See `gorm_*.go` files in `adapters/repositories/postgres/` for side-by-side comparison
- **Research:** ORM comparison research stashed in git (`git stash list` -> orm research)

**Estimated impact:**
| File | Current (sqlx) | GORM prototype | Reduction |
|------|---------------|----------------|-----------|
| user_repository | 132 lines | ~90 lines | 32% |
| content_repository | 364 lines | ~180 lines | 51% |
| perspective_repository | 495 lines | ~260 lines | 47% |
| **Total** | **991 lines** | **~640 lines** | **~35%** |

(Includes shared gorm_models.go ~85 lines + gorm_mappers.go ~140 lines)

### Phase 7.2: gorm-cursor-paginator Integration (INSERTED)
**Goal**: Replace hand-rolled cursor encoding with `gorm-cursor-paginator` library to fix C-02 (cursor pagination broken for non-ID sorts) and simplify pagination code in all GORM repositories
**Depends on**: Phase 7.1 (GORM migration must be complete)
**Source**: Bug Backlog C-02, FEATURE_BACKLOG.md (HIGH PRIORITY)
**Success Criteria** (what must be TRUE):
  1. `gorm-cursor-paginator` library added as dependency
  2. Cursor pagination works correctly for all sort columns (created_at, updated_at, name, JSONB fields), not just ID
  3. Hand-rolled `encodeCursor`/`decodeCursor` replaced with library's built-in cursor handling
  4. Content List and Perspective List methods use library paginator
  5. Compound keyset pagination: cursors encode both sort column value + ID (fixes C-02)
  6. All existing tests pass -- no behavior regression
  7. Frontend cursor contract preserved (opaque base64 strings, hasNext/hasPrev, startCursor/endCursor)
**Plans**: 2 plans in 2 waves

Plans:
- [x] 07.2-01-PLAN.md — Add gorm-cursor-paginator dep, dummy GORM model fields, sort rule builder functions
- [x] 07.2-02-PLAN.md — Rewrite Content + Perspective List() to use paginator, delete old cursor functions

### Phase 7.3: Frontend Caching Remediation (INSERTED)
**Goal**: Fix critical caching architecture issues -- migrate ActivityTable to TanStack Query, remove eruda debug console from production, eliminate dual-signal anti-pattern, add query key factory, remove PII over-fetching, add CSP headers
**Depends on**: Phase 7.2
**Source**: Frontend caching review (2026-02-14) -- 7 findings across P0-P2 priority
**Success Criteria** (what must be TRUE):
  1. Eruda debug script removed from `app.html` (security P0 -- CVSS 7.5)
  2. `email` field removed from `LIST_USERS` query (PII over-fetching, unused field)
  3. ActivityTable uses `createQuery` with `keepPreviousData` instead of raw `graphqlClient.request()` -- eliminates manual fetchData(), custom DOM events, and silent error swallowing
  4. `content-added` custom window event pattern fully removed (both dispatch and listener)
  5. AddVideoDialog bug fixed -- refreshes table after adding video (currently only Popover does)
  6. Shared mutation hook extracted from AddVideoPopover + AddVideoDialog (DRY)
  7. Query key factory at `src/lib/queries/keys.ts` with hierarchical invalidation support
  8. Type parameters on all `graphqlClient.request<T>()` calls -- no `any` types
  9. CSP meta tag or SvelteKit CSP config restricting script/connect/img sources
  10. All existing tests pass, no coverage regression
**Plans**: 4 plans in 3 waves

Plans:
- [x] 07.3-01-PLAN.md — Remove eruda, add CSP meta tag, create query key factory, remove email from LIST_USERS, export types (Wave 1)
- [x] 07.3-02-PLAN.md — Extract shared useAddVideo mutation hook, wire to Popover + Dialog, fix Dialog refresh bug (Wave 2)
- [x] 07.3-03-PLAN.md — Migrate ActivityTable from raw graphqlClient.request() to createQuery with keepPreviousData (Wave 2)
- [x] 07.3-04-PLAN.md — Update all tests for new patterns, coverage gate (Wave 3)

**Details:**
Review findings by priority:
- **P0**: ActivityTable bypasses TanStack Query (root cause of dual-signal, missing cache, silent errors)
- **P0**: Eruda in production (supply chain risk, info disclosure)
- **P0**: AddVideoDialog doesn't refresh table (data consistency bug)
- **P1**: Email PII over-fetched and cached (GDPR concern)
- **P1**: Missing type params -> `any` propagation
- **P1**: No CSP headers
- **P2**: Query keys won't scale (flat arrays)
- **P2**: Duplicate mutation logic across two components

### Phase 7.4: Performance Monitoring (INSERTED)
**Goal**: Establish performance baselines and monitoring across the full stack before application complexity grows
**Depends on**: Phase 7.3
**Success Criteria** (what must be TRUE):
  1. Every HTTP request logs method, path, status code, and duration_ms via slog structured fields
  2. RequestID from chi middleware is propagated into slog log lines
  3. GORM callbacks log slow queries (>100ms) with the SQL statement and duration
  4. A /debug/db-stats endpoint returns sql.DBStats as JSON (open connections, in-use, idle, wait count)
  5. gqlgen AroundOperations extension logs GraphQL operation name and duration_ms
  6. Go benchmark tests exist for ContentService and PerspectiveService with mocked repositories
  7. Frontend captures Core Web Vitals (LCP, CLS, INP) and logs them to console in dev
  8. All existing backend tests pass
  9. All existing frontend tests pass
**Plans**: 1 plan in 1 wave

Plans:
- [x] 07.4-01-PLAN.md — Request timing middleware, GORM slow query logger, DB stats endpoint, GraphQL timing, Go benchmarks, Web Vitals

### Phase 8.1: API & Schema Quality
**Goal**: Fix GraphQL schema types, pagination bugs, race conditions, and missing resolvers
**Depends on**: Phase 7.2 (cursor pagination fixed first)
**Source**: Bug Backlog C-02, H-03, H-04, H-05, H-06, H-07, H-08, M-04, M-08, M-11, M-13, M-16
**Success Criteria** (what must be TRUE):
  1. Cursor pagination works correctly for all sort columns, not just ID (C-02) — ALREADY FIXED in Phase 7.2
  2. `ListAll` users has pagination with configurable limit (H-03)
  3. Timestamps use `DateTime` scalar with proper serialization (H-04)
  4. `contentType` uses `ContentType` enum, not `String` (H-05)
  5. Uniqueness enforced via DB constraints, not app-level TOCTOU checks (H-06, H-07)
  6. YouTube API response stored as structured fields, not raw JSON blob (H-08, M-13)
  7. `deletePerspective` uses `IntID` consistently (M-04)
  8. Perspective `user` and `content` nested fields resolve correctly (M-08)
  9. Input length validation on description, labels, categorizedRatings (M-11)
  10. Update checks `RowsAffected` for optimistic concurrency (M-16)
**Plans**: 5 plans in 3 waves

Plans:
- [ ] 08.1-01-PLAN.md — Schema quality: DateTime scalar, ContentType enum, deletePerspective IntID fix
- [ ] 08.1-02-PLAN.md — YouTube structured fields: remove response, add individual columns, migration
- [ ] 08.1-03-PLAN.md — DB constraints: GORM uniqueIndex tags, migration, service error handling
- [ ] 08.1-04-PLAN.md — Pagination, validation, RowsAffected: users limit param, input validation, concurrency checks
- [ ] 08.1-05-PLAN.md — Nested resolvers: Perspective.user and Perspective.content field resolvers

**Concern checklist:**
- [x] C-02: Cursor pagination broken for non-ID sorts → **ALREADY FIXED in Phase 7.2**
- [ ] H-03: `ListAll()` users has no pagination (unbounded query) → **08.1-04**
- [ ] H-04: Timestamps as `String!` instead of `DateTime` scalar → **08.1-01**
- [ ] H-05: `contentType` uses `String!` instead of `ContentType` enum → **08.1-01**
- [ ] H-06: Race condition on perspective claim uniqueness check (TOCTOU) → **08.1-03**
- [ ] H-07: Race condition on user uniqueness check (TOCTOU) → **08.1-03**
- [ ] H-08: YouTube API response stored verbatim (~5KB bloat per item) → **08.1-02**
- [ ] M-04: `deletePerspective` uses `ID` scalar instead of `IntID` → **08.1-01**
- [ ] M-08: Missing nested field resolvers (perspective->user, perspective->content) → **08.1-05**
- [ ] M-11: Missing input length validation → **08.1-04**
- [ ] M-13: Unbounded JSON field (duplicate of H-08) → **08.1-02**
- [ ] M-16: Update does not check `RowsAffected` → **08.1-04**

### Phase 9: Security Hardening
**Goal**: Add authentication, authorization, rate limiting, and security headers to make the app safe for multi-user deployment
**Depends on**: Phase 8.1 (clean schema + architecture required before layering auth)
**Source**: Bug backlog C-01, C-04, C-05, C-09, C-10, H-10, H-11, H-12, H-14, H-15, H-25, M-14, M-15, M-28
**Success Criteria** (what must be TRUE):
  1. Authentication middleware validates JWT/session on all mutations (C-01)
  2. Authorization checks on all mutations -- users can only modify their own data (C-01)
  3. GraphQL query complexity limit enforced (C-04)
  4. CORS restricted to explicit frontend origin (C-05)
  5. GraphQL playground disabled in production (C-09) — ALREADY FIXED (Plan 07-03)
  6. Introspection disabled in production (C-10)
  7. User email addresses only visible to authenticated user for their own account (H-10)
  8. Rate limiting middleware installed (H-11)
  9. YouTube API key never appears in logs or error responses (H-12)
  10. HTTP server has read/write/idle timeouts configured (H-15) — ALREADY FIXED (Plan 07-03)
  11. TLS/HTTPS via Sevalla reverse proxy (H-14)
  12. Security headers set: `X-Content-Type-Options`, `X-Frame-Options`, HSTS (M-14)
  13. CSRF protection via Content-Type validation (M-15)
  14. Content Security Policy enhanced on frontend (H-25) — PARTIALLY FIXED (CSP meta tag exists from Plan 07.3-01)
  15. Secrets management strategy documented (M-28)
**Plans**: 6 plans in 3 waves

Plans:
- [ ] 09-01-PLAN.md — JWT auth infrastructure: dependencies, AuthService, auth middleware, GraphQL directives, wire to server (Wave 1)
- [ ] 09-02-PLAN.md — Authorization: email visibility check, @owner directive with ownership checks, wire services to directives (Wave 2)
- [ ] 09-03-PLAN.md — API protection: rate limiting, query complexity, CORS restriction, introspection disable, Content-Type validation (Wave 2)
- [ ] 09-04-PLAN.md — Security headers: unrolled/secure middleware, enhanced CSP, HTTPS verification (Wave 3)
- [ ] 09-05-PLAN.md — Error sanitization: YouTube API key removal from logs and GraphQL errors (Wave 3)
- [ ] 09-06-PLAN.md — Secrets management: documentation with rotation procedures, Sevalla best practices (Wave 3)

**Concern checklist:**
- [ ] C-01: No authentication or authorization (CRITICAL) → **09-01, 09-02**
- [ ] C-04: No GraphQL query complexity limiting (DoS vector) → **09-03**
- [ ] C-05: Wildcard CORS configuration → **09-03**
- [x] C-09: GraphQL playground exposed unconditionally → **ALREADY FIXED** (Plan 07-03 gates with APP_ENV)
- [ ] C-10: GraphQL introspection enabled without restriction → **09-03**
- [ ] H-10: User email addresses exposed in public query → **09-02**
- [ ] H-11: No rate limiting → **09-03**
- [ ] H-12: YouTube API key exposure risk in logs/errors → **09-05**
- [ ] H-14: No HTTPS/TLS → **09-04** (verify Sevalla handles TLS termination)
- [x] H-15: No HTTP server timeouts (Slowloris DoS) → **ALREADY FIXED** (Plan 07-03: ReadTimeout, WriteTimeout, IdleTimeout)
- [x] H-25: No Content Security Policy → **PARTIALLY FIXED** (Plan 07.3-01 added CSP meta tag, 09-04 enhances)
- [ ] M-14: Missing security headers → **09-04**
- [ ] M-15: No CSRF protection → **09-03** (Content-Type validation approach)
- [ ] M-28: No secret rotation or vault integration → **09-06** (documentation-based strategy)

### Phase 10: Frontend Quality & Test Coverage
**Goal**: Fix frontend vulnerabilities, add codegen, error boundaries, and close all test coverage gaps
**Depends on**: Phase 8.1 (schema fixes enable codegen; nested resolvers enable frontend cleanup)
**Source**: Bug backlog C-03, H-17, H-18, H-22, H-23, H-24, M-18-M-26, T-01-T-06, L-*
**Success Criteria** (what must be TRUE):
  1. AG Grid cellRenderer uses safe DOM APIs, no raw innerHTML interpolation (C-03)
  2. `+error.svelte` error boundary exists with retry UI (H-17, M-23)
  3. `hooks.client.ts` and `hooks.server.ts` catch unhandled errors (H-18)
  4. `prerender` set to false or properly leveraged (H-22)
  5. `graphql-codegen` generates TypeScript types from schema (H-23, M-18)
  6. GraphQL client has error interceptor, timeout, and auth header support (H-24)
  7. Search input debounced (M-22)
  8. Dead code removed: `AGGridTest.svelte`, unused stores, unused type guards (M-20, M-21, M-24)
  9. Retry config only retries 5xx/network errors (M-26)
  10. `PerspectiveService.Update()` has test coverage (T-01)
  11. Resolver tests exist for User/Perspective queries (T-02)
  12. `helpers.go` conversion tested with malformed input (T-03)
  13. Repository-layer tests exist (T-04)
  14. YouTube API client tested (T-05)
  15. `IntID` scalar tested (T-06)
**Plans**: 6 plans in 3 waves

Plans:
- [ ] 10-01-PLAN.md — GraphQL Code Generator setup (client-preset, codegen.ts, generated types)
- [ ] 10-02-PLAN.md — Error boundaries and GraphQL client enhancements (+error.svelte, hooks.client.ts, timeout, selective retry)
- [ ] 10-03-PLAN.md — Backend service and resolver tests (PerspectiveService.Update, User/Perspective resolvers)
- [ ] 10-04-PLAN.md — Backend helper and scalar tests (helpers.go converters, IntID scalar)
- [ ] 10-05-PLAN.md — Backend repository integration tests (Content/Perspective List with DB, pagination, sorting, filtering)
- [ ] 10-06-PLAN.md — Frontend coverage gaps and dead code detection (Knip setup, tooltip tests, coverage thresholds)

**Concern checklist:**
- [x] C-03: XSS vulnerability in AG Grid cellRenderer → **ALREADY FIXED** (createElement used, not innerHTML)
- [ ] H-17: Missing `+error.svelte` error boundary → **10-02**
- [ ] H-18: Missing `hooks.client.ts` / `hooks.server.ts` → **10-02**
- [x] H-22: `prerender = true` without SSR (architectural mismatch) → **ALREADY FIXED** (prerender false in +layout.ts)
- [ ] H-23: No TypeScript types generated from GraphQL schema → **10-01**
- [ ] H-24: GraphQL client missing error/timeout infrastructure → **10-02**
- [ ] M-18: Duplicated type definitions across components → **10-01** (codegen eliminates duplication)
- [x] M-19: No server-side pagination integration (hard-coded 100) → **ALREADY FIXED** (Phase 3.2)
- [ ] M-20: `selectedUserId` store not consumed → **10-06** (Knip detection)
- [ ] M-21: Unused type guards → **10-06** (Knip detection)
- [ ] M-22: Search input not debounced
- [ ] M-23: No error recovery UI (no retry button) → **10-02**
- [ ] M-24: Dead code (`AGGridTest.svelte`) → **10-06** (Knip detection, note: AGGridTest.svelte not found, may already be removed)
- [ ] M-25: HTTP fallback for GraphQL endpoint → **10-02** (HTTPS auto-upgrade in client)
- [ ] M-26: Retry configuration retries all errors (should only retry 5xx) → **10-02**
- [ ] T-01: `PerspectiveService.Update()` -- zero tests → **10-03**
- [ ] T-02: No resolver tests → **10-03**
- [ ] T-03: No `helpers.go` conversion tests → **10-04**
- [ ] T-04: No repository-layer tests → **10-05**
- [ ] T-05: No YouTube API client tests → **DEFERRED** (requires client refactor for testability, 15 tests currently skipped)
- [ ] T-06: No `IntID` scalar tests → **10-04**
- [ ] L-*: Low priority cleanup (see Bug Backlog L-01 through L-22) → **DEFERRED** (low priority)

### Phase 17: YouTube URL normalization and duplicate upsert

**Goal:** Normalize all YouTube URL variants to canonical form (`https://www.youtube.com/watch?v=<videoID>`), implement idempotent upsert (return existing content instead of error on duplicate), and expose `alreadyExisted` signal to frontend for VIDEO-05 duplicate warning toast
**Depends on:** Phase 7.1 (GORM ORM in place)
**Requirements:** VIDEO-05, M-03
**Success Criteria** (what must be TRUE):
  1. All YouTube URL variants normalize to `https://www.youtube.com/watch?v=<videoID>` before storage
  2. `CreateFromYouTube` returns existing content on duplicate URL (not an error) — M-03 resolved
  3. Repository uses `INSERT ON CONFLICT DO NOTHING` for atomic deduplication (no TOCTOU race)
  4. `createContentFromYouTube` GraphQL mutation returns `CreateContentResult { content, alreadyExisted }`
  5. Frontend shows warning toast when video already exists (VIDEO-05)
  6. Frontend shows success toast when new video is added
  7. Data migration backfills existing raw URLs to canonical form
  8. All backend and frontend tests pass
**Plans:** 6/6 plans complete

Plans:
- [ ] 17-01-PLAN.md — Backend: NormalizeYouTubeURL, GetOrCreateByURL with ON CONFLICT, idempotent CreateFromYouTube, data migration, tests (TDD)
- [ ] 17-02-PLAN.md — GraphQL: CreateContentResult wrapper type, resolver update, frontend mutation/hook update for alreadyExisted signal

### Phase 18: Server-Side Pagination & Filtering with Data Mode Toggle

**Goal:** Add a data mode toggle to ActivityTable that switches between "All Items" (server-side sort/filter/search across full dataset) and "Loaded X Items" (client-side sort/filter/search on currently loaded page). Expand backend filtering and sorting capabilities to support full server-side operation. Reflect query state in URL for shareable views.
**Depends on:** Phase 17
**Success Criteria** (what must be TRUE):
  1. Data mode toggle visible in pagination area with "All Items" / "Loaded X Items" labels
  2. In "All Items" mode, sorting any column triggers server-side sort
  3. In "All Items" mode, filtering any column triggers server-side filter via expanded ContentFilter
  4. In "Loaded Items" mode, sort/filter/search works client-side only
  5. URL reflects current query state (mode, sort, filters, page, search)
  6. Sharing a URL with params restores the exact view (mode, sort, filters, search; page resets to 1)
  7. Default mode is "Loaded Items" with no URL params
  8. Hover tooltip on "Loaded X Items" explains the mode
**Plans:** 3 plans in 2 waves

Plans:
- [ ] 18-01-PLAN.md — Backend expanded filtering & sorting (ContentFilter + ContentSortBy expansion, GORM JSONB WHERE clauses, sort rules)
- [ ] 18-02-PLAN.md — URL state management & grid state utilities (gridUrlState.ts with parse/serialize, filter model ↔ URL converters, unit tests)
- [ ] 18-03-PLAN.md — Data mode toggle UI & grid integration (DataModeToggle component, URL-driven ActivityTable refactor, page search wiring)

### Phase 19: Content Familiarity Tracking

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 18
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 19 to break down)

---

## v1.1 Feature Phases (11-16)

Phases 11-15 planned from FEATURE_BACKLOG.md. Phase 16 added for mobile app research.

- [ ] **Phase 11: Database Optimization** - Indexing, query performance, connection pooling tuning
- [ ] **Phase 12: Authentication** - Clerk-based auth replacing user dropdown selector
- [ ] **Phase 13: Content Categories** - Organize content by category/topic
- [ ] **Phase 14: AG Grid Power Features** - Advanced table features, column grouping, export
- [ ] **Phase 15: Discover Page** - Content discovery and recommendation interface
- [ ] **Phase 16: Mobile App Strategy** - Research native mobile approaches for SvelteKit SPA
- [ ] **Phase 20: Bible Static Assets** - Serve immutable Bible verse text + interlinear from content-hashed per-book static chunks instead of GraphQL/Postgres; measure perf + cost before/after
- [ ] **Phase 21: Query Cache Persistence & Optimistic Writes** - Persist TanStack Query cache to IndexedDB (per-user, wiped on sign-out) + optimistic perspective/content mutations
- [ ] **Phase 22: TanStack DB Pilot (Perspectives)** - One-entity pilot of `@tanstack/svelte-db` query collections over existing GraphQL; adopt or revert on exit criteria
- [ ] **Phase 23: Sync Engine Evaluation (GATED)** - ElectricSQL + TanStack DB Electric collection; only if real-time/collab or measured read-cost growth
- [ ] **Phase 24: Local Database / Desktop (GATED)** - PGlite local Postgres and/or Tauri desktop shell; only on offline or distribution requirement

### Phase 18.1: Mobile Activity Page Redesign (INSERTED)

**Goal:** [Urgent work - to be planned]
**Depends on:** Phase 18
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 18.1 to break down)

### Phase 16: Mobile App Strategy
**Goal**: Research and evaluate native mobile app approaches (Capacitor, Tauri, PWA) for wrapping the existing SvelteKit SPA. Produce a recommendation with proof-of-concept.
**Depends on**: Phase 12 (auth must exist before shipping a mobile app)
**Plans**: 2 plans in 2 waves

**Research scope:**
- Capacitor (Ionic) — WebView wrapper, native plugin ecosystem, App Store/Play Store distribution
- Tauri Mobile — Rust-based, smaller binaries, newer mobile support (stability assessment)
- PWA — Service worker, manifest, offline support, installable from browser (no app store)
- Evaluation criteria: native API access (camera, push notifications, biometrics), offline support, app store distribution, development effort, bundle size, update mechanism
- SvelteKit adapter-static compatibility with each approach
- Proof-of-concept with recommended approach

Plans:
- [ ] 16-01-PLAN.md — Capacitor integration + PWA configuration (install deps, init platforms, manifest, service worker)
- [ ] 16-02-PLAN.md — POC verification in iOS Simulator + recommendation document (checkpoint)

### Local-First Data Strategy (Phases 20–24)

Shared research: `.planning/phases/20-bible-static-assets/20-RESEARCH.md` (value-for-money ranking, TanStack DB Svelte-adapter lag check, local Postgres options). Ordered cheapest/safest first; 23–24 are gated on evidence, not scheduled.

### Phase 20: Bible Static Assets
**Goal**: Bible reads (verse text, then interlinear) come from content-hashed per-book static chunks cached by the browser/CDN, not GraphQL + Postgres, with a measured before/after on latency, API/DB load, and hosting cost.
**Depends on**: Bible passage content + interlinear (shipped; `bible_verse_text`, `bible_word`, `bible_lexicon`)
**Plans**: 2 plans

**Success criteria (must_haves.truths):**
- Warm-cache passage render never issues a `PassageText` GraphQL operation
- Per-book verse chunk ≤ 80 KB gz (Psalms max measured at 79 KB); median ≈ 11 KB
- `PassageText` operation count in prod logs drops ≥ 90% vs. 7-day baseline
- Baseline and after-numbers recorded in `20-01-SUMMARY.md` with the same instrumentation
- GraphQL `passageText` remains as fallback on chunk-load failure; no regression in existing tests

Plans:
- [ ] 20-01 — Verse-text static chunks + instrumentation + before/after measurement → `docs/superpowers/plans/2026-09-26-bible-static-assets-plan.md`
- [ ] 20-02 — Interlinear (`bible_word`/`bible_lexicon`) per-book lazy chunks (TBD; reuses 20-01 pipeline, keep CC BY attribution)

### Phase 21: Query Cache Persistence & Optimistic Writes
**Goal**: Reloads render last-known user data instantly (IndexedDB-persisted TanStack Query cache, background revalidate); key mutations are optimistic.
**Depends on**: Phase 20 (measurement harness reused)
**Plans**: TBD

**Success criteria:** cache keyed by Clerk user id and wiped on sign-out/user switch; no private perspective persisted for a non-owner; reload-to-content p50 improves vs. Phase 20 baseline.

### Phase 22: TanStack DB Pilot (Perspectives)
**Goal**: Evaluate `@tanstack/svelte-db` (pinned 0.1.x) `queryCollectionOptions` for perspectives across Activity grid, details modal, and compare page.
**Depends on**: Phase 21
**Plans**: TBD

**Success criteria / exit:** every needed API verified present in the Svelte adapter before starting (it trails React ~32 releases); pilot adopted only if it deletes net code or invalidation bugs, else reverted and documented.

### Phase 23: Sync Engine Evaluation (GATED)
**Goal**: ElectricSQL shapes → TanStack DB Electric collections, writes still via GraphQL.
**Gate**: real-time/collab requirement OR measured read-driven cost growth. Prereqs: logical replication on Sevalla/Neon, Clerk-scoped shape auth proxy.

### Phase 24: Local Database / Desktop (GATED)
**Goal**: PGlite (WASM Postgres, IndexedDB/OPFS) local store and/or Tauri desktop shell.
**Gate**: explicit offline-first or desktop-distribution requirement. Not a performance play once Phases 20–22 land.

## v1.2 Jeeves AI Assistant (Phases 25–28)

**Requirements:** `.planning/v1.2-REQUIREMENTS.md` · **Research:** `.planning/v1.2-research/SUMMARY.md` · **Decisions:** `ai-tooling/CLAUDE.md`

**Planning note:** Phases are planned and executed through superpowers (`docs/superpowers/specs|plans/`), not GSD phase directories. Planning is progressive: only the next phase is detailed; 26–28 are re-scoped at each transition. Teaching mode applies (Learn blocks, phase quizzes, owner-implemented tasks).

### Phase 25: AI Foundation
**Goal**: Jeeves can answer how-to questions from a verified app guide and read perspectives through provider-neutral `ai-tooling`, exercised via the `botler` CLI and an eval baseline, with no production code depending on it yet
**Depends on**: Nothing (ai-tooling is standalone)
**Requirements**: GUIDE-01..04, CORE-01..05, TOOLS-01..04, CLI-01..03, EVAL-01..04
**Success Criteria** (what must be TRUE):
  1. Every user-facing frontend area has guide entries that passed the independent verifier; guide lint runs in CI
  2. `botler chat` answers a how-to question citing a guide entry ID, and a perspective question using read-only tools
  3. The privacy contract test passes for the GraphQL and fixture `PerspectizeData` implementations
  4. `botler eval --model claude-…` produces a pass-rate/token/latency report; the Claude baseline and "following nicely" threshold are recorded
**Plans**: First: `docs/superpowers/plans/2026-09-26-app-guide-plan.md`. Remaining plans are written after the app-guide checkpoint.

### Phase 26: Bridge (provisional)
**Goal**: The backend can safely import `ai-tooling`
**Depends on**: Phase 25
**Requirements**: BRIDGE-01, BRIDGE-02
**Success Criteria**:
  1. The Sevalla deploy succeeds with the repo-root Docker context; the root dockerignore keeps secret files out of the image
  2. The perspective visibility check lives in `PerspectiveService`; the contract test passes for the in-process implementation

### Phase 27: In-App Jeeves (provisional)
**Goal**: Users chat with Jeeves in a streaming sidebar and can apply suggested changes only through confirm-to-apply
**Depends on**: Phase 26
**Requirements**: INAPP-01..10
**Success Criteria**:
  1. Stop cancels the upstream model call (verified by the usage log)
  2. Only the current page's tools are sent; answers cite guide entries
  3. Nothing is written without Apply; assistant output never renders images
  4. Per-user rate and token limits are enforced for subscriptions, with clear messages

### Phase 28: OpenRouter Pivot (provisional)
**Goal**: Jeeves can run on eval-approved non-Claude models via OpenRouter
**Depends on**: Phase 27 and the EVAL-04 threshold being met
**Requirements**: PROV-01..03
**Success Criteria**:
  1. The OpenAI-compatible adapter passes the same loop and tool tests as the Anthropic adapter
  2. The cross-model eval matrix is published; only models meeting the threshold (with tool support) are selectable

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 2.1 -> 3 -> 3.1 -> 3.2 -> 3.3 -> 3.4 -> 3.5 -> 4 -> 4.1 -> 5 -> 6 -> 7 -> 7.1 -> 7.2 -> 7.3 -> 7.4 -> 8 -> 8.1 -> 9 -> 10 -> 11 -> 12 -> 13 -> 14 -> 15 -> 16 -> 17

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 5/5 | Complete | 2026-02-07 |
| 2. Data Layer + Activity | 2/2 | Complete | 2026-02-07 |
| 2.1 Mobile Responsive Fixes | 2/2 | Complete | 2026-02-07 |
| 3. Add Video Flow | 2/2 | Complete | 2026-02-07 |
| 3.1 Design Token System | 2/2 | Complete | 2026-02-12 |
| 3.2 Activity Page Beta Quality | 8/8 | Complete | 2026-02-16 |
| 3.3 Repository Rename & Restructure | 0/3 | Obsolete | 2026-02-15 |
| 3.4 Perspectize Branding & Glasses Identity | 0/4 | Not started | - |
| 3.5 Google NL Taxonomy Research Spike | 1/2 | In Progress | 2026-02-20 |
| 4. Add Perspective Flow | 3/3 | Complete | 2026-02-15+ |
| 4.1 GraphQL Dataloaders for N+1 Prevention | 0/2 | Planned | - |
| 5. Testing + Deployment | 2/3 | Complete | 2026-02-15 |
| 6. Error Handling & Data Integrity | 0/2 | Not started | - |
| 7. Backend Architecture | 3/3 | Complete | 2026-02-13 |
| 7.1 ORM Migration (sqlx -> GORM) | 3/3 | Complete | 2026-02-14 |
| 7.2 gorm-cursor-paginator | 2/2 | Complete | 2026-02-14 |
| 7.3 Frontend Caching Remediation | 4/4 | Complete | 2026-02-14 |
| 7.4 Performance Monitoring | 1/1 | Complete | 2026-02-15 |
| 8. User Integration Flow | 1/1 | Complete | 2026-02-15 |
| 8.1 API & Schema Quality | 0/5 | Not started | - |
| 9. Security Hardening | 6/6 | Complete | 2026-03-03 |
| 10. Frontend Quality & Test Coverage | 0/6 | Not started | - |
| 11. Database Optimization | 0/3 | Not started | - |
| 12. Authentication | 0/3 | Not started | - |
| 13. Content Categories | 0/3 | Not started | - |
| 14. AG Grid Power Features | 0/3 | Not started | - |
| 15. Discover Page | 0/3 | Not started | - |
| 16. Mobile App Strategy | 0/2 | Planned | - |
| 17. YouTube URL Normalization & Upsert | 2/2 | Complete | 2026-02-22 |
| 18. Server-Side Pagination & Filtering | 0/3 | Planned | - |
| 18.1 Mobile Activity Page Redesign | 0/3 | Planned | - |
| 19. Content Familiarity Tracking | 0/3 | Planned | - |
| 20. Bible Static Assets | 0/2 | Planned | - |
| 21. Query Cache Persistence & Optimistic Writes | 0/0 | Not started | - |
| 22. TanStack DB Pilot (Perspectives) | 0/0 | Not started | - |
| 23. Sync Engine Evaluation | 0/0 | Gated | - |
| 24. Local Database / Desktop | 0/0 | Gated | - |
| 25. AI Foundation (v1.2) | 0/1+ | Planning | - |
| 26. Bridge (v1.2) | 0/0 | Provisional | - |
| 27. In-App Jeeves (v1.2) | 0/0 | Provisional | - |
| 28. OpenRouter Pivot (v1.2) | 0/0 | Provisional | - |
