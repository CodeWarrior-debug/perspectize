# Perspectize

## What This Is

A platform where people can input, browse, and discover perspectives on content — starting with YouTube videos. Perspectives range from a simple agree/disagree with a comment to detailed 0-1000 quality ratings with long-form reviews. The experience is designed to feel effortless to input and calm to browse — users should never feel overwhelmed, lost, interrupted, or out of control (the opposite of social media).

## Core Value

Users can easily submit their perspective on a YouTube video and browse others' perspectives in a way that keeps them in control.

## Requirements

### Validated

*Inferred from existing Go backend codebase:*

- ✓ GraphQL API with gqlgen (schema-first, code generation) — existing
- ✓ Content model with YouTube video metadata (title, description, thumbnails, duration, tags) — existing
- ✓ Perspective model with quality ratings (0-1000), agreement ratings, claims, review text — existing
- ✓ User model with username, email, display name — existing
- ✓ YouTube URL parsing and Data API v3 integration (auto-fetch video metadata) — existing
- ✓ Cursor-based pagination with configurable sort/filter on all list queries — existing
- ✓ PostgreSQL database with migrations (golang-migrate) — existing
- ✓ Hexagonal architecture (domain → ports → services → adapters) — existing
- ✓ Content CRUD operations via GraphQL — existing
- ✓ Perspective CRUD operations via GraphQL — existing
- ✓ User CRUD operations via GraphQL — existing

### Active

**Frontend (SvelteKit Web App):**
- [ ] Discover page: paginated data table of videos with search and filters
- [ ] Video table columns: thumbnail, title, duration, perspective count, avg quality, avg agreement, date added
- [ ] Color-coded score badges for quality/agreement ratings
- [ ] Summary footer with aggregate stats (total videos, total perspectives, avg scores)
- [ ] Add Video flow: paste YouTube URL → backend auto-fetches metadata → content created
- [ ] Add Perspective flow: select a video, fill in perspective form (simple or detailed)
- [ ] Simple perspective: agree/null/undecided/disagree + optional comment
- [ ] Detailed perspective: 0-1000 quality ratings, long paragraph answers, review option
- [ ] User selector dropdown (switch between existing users from database)
- [ ] Responsive layout: mobile-first, scaling to desktop
- [ ] Pagination with page size control

**Design System:**
- [ ] shadcn-svelte component library initialized with Radix 3.0 design tokens
- [ ] Custom theme matching Figma design system (primary navy #1a365d, Inter font, spacing/radius tokens)
- [ ] Data table component with sortable columns, search, and filters

**Backend (fill gaps for frontend):**
- [ ] Any missing GraphQL queries/mutations needed by the frontend
- [ ] Aggregate stats queries (total counts, average scores)

### Out of Scope

- Authentication/login system — v1 uses a simple user dropdown selector, no auth
- AI-assisted perspective input — future feature, not planned for v1
- Side-by-side perspective comparison — v2 feature
- Aggregated views (score distributions) — v2 feature
- Divergence/debate highlighting — v2 feature
- Native mobile app — v1 is responsive web only; Svelte mobile app planned later
- Content types beyond YouTube videos — architecture supports it, but v1 is YouTube only
- Real-time updates / subscriptions — not needed for v1
- Comments/social features — not in v1 scope

## Context

**Existing Backend:** Go 1.25+ backend with PostgreSQL 17, GraphQL (gqlgen), hexagonal architecture. Deployed on Sevalla. Has Content, Perspective, and User models with full CRUD. YouTube Data API integration for auto-fetching video metadata. Cursor-based pagination with sort/filter support.

**Migration:** This repo contains a legacy C# ASP.NET Core implementation in `perspectize/` that is being replaced by the Go backend in `backend/`. The C# code is reference only — all development is in Go.

**Existing Data:** Production database on Sevalla already has users and content data.

**Figma Assets:**
- Design system: Radix 3.0 with shadcn components — [Figma](https://www.figma.com/design/SyvrP9yYbrmCorofJK4Co8/Perspectize---Radix-3.0-Implementation?node-id=2143-2251)
- App design (reference): [Figma](https://www.figma.com/design/K1HaZLeNwCckWvhoyAfRhj/Perspectize-Youtube---Design-1?node-id=3-408&m=dev)
- Prototype: [Figma Site](https://spout-jolly-14050265.figma.site)

**Design Tokens (from Figma):**
- Primary: `#1a365d` (navy), Hover: `#2d3748`, Destructive: `#dc2626`
- Secondary: `#f5f5f5`, Accent: `#f7fafc`
- Font: Inter (full weight scale thin–black)
- Typography: Tailwind-like scale (text-xs through text-9xl)
- Spacing/radius via CSS custom properties (`--spacing/*`, `--border-radius/*`)

**Tracking:** GitHub Issues for all project management.

## Constraints

- **Tech Stack (Backend)**: Go + PostgreSQL + gqlgen — already built, not changing
- **Tech Stack (Frontend)**: SvelteKit + shadcn-svelte + Tailwind CSS — chosen for alignment with Figma design system
- **Hosting**: Inexpensive hosting required — GitHub Pages (static adapter) or similar for frontend; Sevalla for backend
- **Design System**: Must use shadcn-svelte with custom theme matching Radix 3.0 Figma tokens — avoid rework when design system evolves
- **Mobile-First**: Responsive design starting from mobile layouts, scaling up to desktop — need clear breakpoint strategy
- **Deployment**: SvelteKit with static adapter (no SSR) to enable cheap/free static hosting
- **Tests Required**: Every plan that adds or modifies backend/frontend logic MUST include unit test tasks. Backend: Go table-driven tests with testify. Frontend: Vitest + Testing Library. Plans without test tasks are incomplete — the planner must include them or explicitly justify why tests are not applicable (e.g., pure config, styling-only changes)

## Current State: v1.0 Complete ✅

**Shipped:** 2026-02-16 (formalized 2026-09-04 after post-MVP work)  
**Phases:** 1–9, 17 (16 phases, 43+ plans)

**Delivered Features:**
- ✅ Activity page with AG Grid (server-side sort/filter/pagination)
- ✅ Add Video flow with URL validation, duplicate detection, clipboard paste
- ✅ ✓ User selector dropdown with session persistence & create user flow
- ✅ shadcn-svelte design system (navy #1a365d, Geist + Charter fonts)
- ✅ Mobile-responsive design (375px–4K with flexible breakpoints)
- ✅ Production security hardening (JWT auth, @owner directives, rate limiting, CSP)

**Deferred to v1.1:**
- Add Perspective form (modal redesigned, form implementation pending)
- Phase 6: Comprehensive error handling audit
- Phase 8.1: Schema quality (DateTime scalars, nested resolvers, validation)
- Phase 10: Frontend quality (graphql-codegen, error boundaries, dead code cleanup)

---

## Next Milestone: v1.1 Platform Expansion

**Goal:** Build on v1.0 foundation to add authentication, perspective creation, and performance improvements.

**Planned features:**
- Phase 4: Complete Add Perspective flow (form + claim mutations)
- Phase 4.1: GraphQL dataloaders for N+1 prevention
- Phase 6: Error handling and data integrity audit
- Phase 8.1: API & schema quality improvements
- Phase 10: Frontend quality & test coverage
- Phase 11–16: Database optimization, Clerk auth, content categories, AG Grid power features, discover page, mobile app strategy

---

## Current Milestone: v1.2 Jeeves AI Assistant (runs in parallel with v1.1)

**Goal:** Give users an in-app AI assistant ("Jeevesbot" by default, renamable) that answers how-to questions from an app guide and helps them refine their perspectives — built on a provider-neutral `ai-tooling/` Go module that starts on Claude and pivots to OpenRouter once evals show it's ready.

**Target features:**
- Provider-neutral AI foundation (`ai-tooling/`): own message/event types, Anthropic adapter, agent loop, tool registry
- App guide (task-oriented, verified against the frontend code) as Jeeves's how-to knowledge
- Read-only Jeeves tools over a `PerspectizeData` interface (GraphQL, fixture, and in-process implementations)
- `botler` dev CLI (`tools list`, `tools call`, `chat`, `eval`) over GraphQL
- Eval harness: deterministic checks on fixtures, model × prompt-version matrix, token/latency capture
- In-app Jeeves: GraphQL subscription streaming, sidebar UI, per-page tool sets, assistant rename, confirm-to-apply actions, usage logging, rate limits
- OpenRouter (OpenAI-compatible) adapter + model registry, gated by cross-model evals

**Key context:**
- Locked decisions and teaching-mode rules: `ai-tooling/CLAUDE.md`. Detailed specs/plans go through superpowers; GSD tracks the milestone only.
- Progressive: only the next phase is planned in detail; later phases are re-planned from what the previous phase learned.
- Capability ladder: tell (guide) → look (read-only tools) → do with confirmation → (maybe) do autonomously.
- Deferred to a later milestone: usage ledger/credits, BYOK, remote MCP server + OAuth (which will serve a future Chrome extension).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| SvelteKit for frontend | Modern, lightweight, good DX, Svelte mobile path later | — Pending |
| TanStack Query for data fetching | Official Svelte support, caching, GraphQL integration | — Pending |
| TanStack Form for forms | Multi-step support, dynamic fields, data-type picker needs | — Pending |
| AG Grid for data table | Feature-rich grid, handles sorting/filtering/pagination | — Pending |
| shadcn-svelte for components | Direct mapping from Radix 3.0 Figma design system, avoids rework | — Pending |
| Tailwind CSS for styling | Utility-first, pairs with shadcn-svelte | — Pending |
| Static adapter (no SSR) | Enables GitHub Pages hosting, all data via GraphQL client-side | — Pending |
| User dropdown instead of auth | Simplifies v1, leverages existing users in DB | — Pending |
| Mobile-first responsive | Figma design system TBD on mobile, need breakpoint strategy | — Pending |
| Monorepo (frontend in same repo) | Frontend and backend co-located for easier development | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-26 — milestone v1.2 (Jeeves AI Assistant) started alongside v1.1*
