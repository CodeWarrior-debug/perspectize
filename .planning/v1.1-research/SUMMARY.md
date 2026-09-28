# Research Summary: Perspectize v1.1

**Synthesized:** 2026-02-16
**Milestone:** v1.1 Platform Expansion
**Research Files:** 8 comprehensive documents

---

## Executive Summary

Research complete for all major feature categories in FEATURE_BACKLOG.md. Key findings and recommendations:

| Category | Recommendation | Confidence | Effort |
|----------|---------------|------------|--------|
| Authentication | Hybrid JWT (access + refresh tokens) | HIGH | 9-14 days |
| Multi-Content-Type | Enhanced single-table inheritance | HIGH | 4-8 weeks |
| Database Optimization | Column extraction + JSONB trim | HIGH | 3-4 weeks |
| Content Categories | Google NL taxonomy + Claude classification | HIGH | 2-3 weeks |
| Discover Page | YouTube API + TanStack Query caching | HIGH | 6-10 days |
| AG Grid Power Features | localStorage persistence + toolbar | HIGH | 10-15 hours |
| Social Features | ltree comments + gqlgen subscriptions | HIGH | 7+ weeks |
| AI Assistant (Jeeves) | Claude API + sidebar UI | HIGH | 6-10 weeks |

---

## Stack Additions (Final)

| Layer | Package | Version | Purpose |
|-------|---------|---------|---------|
| Auth | golang-jwt/jwt/v5 | ^5.2 | JWT generation/validation |
| Auth | argon2 (golang.org/x/crypto) | latest | Password hashing (OWASP 2026) |
| Auth | go-chi/jwtauth/v5 | ^5.3 | Chi middleware for JWT |
| GraphQL | gqlgen WebSocket | built-in | Real-time subscriptions |
| AI | anthropics-go | ^1.0 | Claude API client |
| Database | ltree extension | PostgreSQL built-in | Hierarchical comments |
| Frontend | graphql-ws | ^5.16 | WebSocket subscriptions |

---

## Critical Design Decisions

### 1. Authentication Architecture
- **Chosen:** Hybrid JWT with httpOnly refresh cookies
- **Access tokens:** 15 min, in-memory
- **Refresh tokens:** 7 days, httpOnly cookies
- **Rationale:** Balances security (no localStorage for tokens) with UX (silent refresh)

### 2. Multi-Content Schema
- **Chosen:** Enhanced single-table inheritance
- **Promoted columns:** creator, published_at, description, duration, page_count
- **Type-specific:** JSONB `metadata` column
- **Rationale:** 10-100x faster B-tree indexes vs GIN on JSONB

### 3. Comment Threading
- **Chosen:** PostgreSQL ltree extension
- **Rationale:** 500% faster than recursive CTEs, native PostgreSQL support

### 4. AI Integration
- **Chosen:** Claude API via official Go SDK
- **Initial capability:** Perspective refinement only
- **UI:** Sidebar panel (2026 dominant pattern)
- **Rationale:** Anthropic's official SDK, prompt caching reduces costs 90%

### 5. Content Categorization
- **Chosen:** Google NL taxonomy (20 of 27 categories)
- **Auto-classification:** Claude Haiku (5x cheaper than Google Cloud NL)
- **Storage:** Lookup table with ltree (not enum)
- **Rationale:** Flexibility for custom categories, hierarchical support

---

## Phase Structure Recommendation

Based on dependencies and risk assessment:

### Phase 11: Database Optimization (Prerequisite)
**Goal:** Fix performance issues before adding features
- JSONB trimming (40-60% storage reduction)
- Column extraction (8 promoted fields)
- Composite indexes for keyset pagination
- Server-side sort/filter in GraphQL
**Effort:** 3-4 weeks
**Risk:** LOW (no new features, optimization only)

### Phase 12: Authentication & Security
**Goal:** Replace user dropdown with proper auth
- JWT middleware in Go
- Login/register pages in SvelteKit
- Password hashing with Argon2id
- TanStack Query cache scoping
**Effort:** 2-3 weeks
**Risk:** MEDIUM (security-critical, needs thorough testing)
**Depends on:** Phase 11 (clean schema first)

### Phase 13: Content Categories
**Goal:** Enable categorization with auto-suggestion
- Categories lookup table
- GraphQL enum integration
- Category picker UI
- Claude API auto-suggestion
**Effort:** 2-3 weeks
**Risk:** LOW (well-understood patterns)
**Depends on:** Phase 12 (auth for user-specific categories later)

### Phase 14: AG Grid Power Features
**Goal:** Add toolbar with filter/column management
- Toolbar component
- localStorage persistence
- Keyboard shortcuts
- CSV export
**Effort:** 1-2 weeks
**Risk:** LOW (AG Grid Community APIs documented)
**Depends on:** None (can parallel with other phases)

### Phase 15: Discover Page
**Goal:** YouTube search and category browsing
- Search with debouncing
- Category grid
- One-click add to library
- Quota management
**Effort:** 1-2 weeks
**Risk:** LOW (YouTube API well-understood)
**Depends on:** Phase 13 (categories for browsing)

### Phase 16: Multi-Content-Type (v1.2+)
**Goal:** Support books, articles, podcasts
- Schema migration (promoted columns)
- Google Books API adapter
- Content type UI
**Effort:** 4-8 weeks
**Risk:** MEDIUM (schema migration complexity)
**Depends on:** Phase 11 (optimized schema foundation)

### Phase 17: Social Features (v2.0)
**Goal:** Comments and discussions
- ltree schema for threading
- GraphQL subscriptions (real-time)
- Moderation with Claude
**Effort:** 4-6 weeks
**Risk:** MEDIUM (real-time adds complexity)
**Depends on:** Phase 12 (auth required)

### Phase 18: AI Assistant (v2.0+)
**Goal:** Jeeves perspective refinement
- Claude API integration
- Sidebar UI
- Streaming responses
**Effort:** 4-6 weeks
**Risk:** MEDIUM (new domain, needs UX validation)
**Depends on:** Phase 12 (auth for user context)

---

## Milestone Scope Recommendation

### v1.1 (Core Platform Improvements)
- Phase 11: Database Optimization
- Phase 12: Authentication
- Phase 13: Content Categories
- Phase 14: AG Grid Power Features
- Phase 15: Discover Page

**Total effort:** 10-15 weeks
**Risk:** LOW-MEDIUM

### v1.2 (Content Expansion)
- Phase 16: Multi-Content-Type

**Total effort:** 4-8 weeks
**Risk:** MEDIUM

### v2.0 (Social & AI)
- Phase 17: Social Features
- Phase 18: AI Assistant

**Total effort:** 8-12 weeks
**Risk:** MEDIUM-HIGH

---

## Open Questions (Require Product Decisions)

1. **Auth requirements:** Email verification required? Social login (Google OAuth)?
2. **Comment depth:** Unlimited nesting or cap at 3-5 levels?
3. **AI pricing:** Free tier or Pro-only for Jeeves?
4. **Category ownership:** User-defined categories in v1.1 or defer?
5. **Real-time priority:** Subscriptions in v1.1 or defer to v2.0?

---

## Research Files Reference

| File | Content |
|------|---------|
| AUTH-ARCHITECTURE.md | JWT patterns, Go middleware, SvelteKit auth, security best practices |
| MULTI-CONTENT-TYPE.md | Schema design, field mappings, API integrations, migration strategy |
| DATABASE-OPTIMIZATION.md | JSONB trimming, column extraction, index design, GORM patterns |
| CONTENT-CATEGORIZATION.md | Taxonomy design, auto-classification, schema, UI patterns |
| DISCOVER-PAGE.md | YouTube API, quota management, search UX, component architecture |
| AG-GRID-POWER-FEATURES.md | API reference, toolbar design, state persistence, Svelte 5 patterns |
| SOCIAL-FEATURES.md | ltree threading, GraphQL subscriptions, moderation, notifications |
| AI-ASSISTANT.md | Claude API, prompt engineering, UI/UX, streaming, cost analysis |

---

*Research complete. Ready for roadmap creation.*
