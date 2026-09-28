# Requirements: Perspectize v1.0 Frontend MVP

**Defined:** 2026-02-05
**Core Value:** Users can easily submit their perspective on a YouTube video and browse others' perspectives in a way that keeps them in control.

---

## v1 Requirements

### Project Setup (SETUP)

- [ ] **SETUP-01**: SvelteKit project initialized with Svelte 5, TypeScript, static adapter
- [ ] **SETUP-02**: Tailwind CSS v4 configured with shadcn-svelte
- [ ] **SETUP-03**: TanStack Query provider configured with GraphQL client
- [ ] **SETUP-04**: TanStack Form available for perspective forms
- [ ] **SETUP-05**: AG Grid integrated and validated (or fallback to TanStack Table)
- [ ] **SETUP-06**: Custom theme applied (navy #1a365d, Inter font) — code-first, not strictly following Figma
- [ ] **SETUP-07**: svelte-sonner configured for toast notifications (top-right position, 2s auto-dismiss default)
- [ ] **SETUP-08**: Vitest configured for unit testing
- [ ] **SETUP-09**: Planned folder structure documented with example files in each folder

### Activity Page (ACT)

- [ ] **ACT-01**: User can view Activity page showing most recently updated content (default landing page)
- [ ] **ACT-02**: Table displays: thumbnail, title, duration, perspective count, date added
- [ ] **ACT-03**: User can sort table by any column (ascending/descending)
- [ ] **ACT-04**: User can filter table by text search (title, description)
- [ ] **ACT-05**: User can paginate through results with page size selector (10/25/50)
- [ ] **ACT-06**: Pagination uses cursor-based navigation from backend

### Add Video (VIDEO)

- [ ] **VIDEO-01**: User can paste a YouTube URL to add a video
- [ ] **VIDEO-02**: Backend auto-fetches video metadata (title, description, thumbnail, duration)
- [ ] **VIDEO-03**: User sees success toast notification (top-right, auto-dismiss 2s) after creation
- [ ] **VIDEO-04**: User sees error toast notification (top-right, auto-dismiss 2s) if URL is invalid or fetch fails
- [x] **VIDEO-05**: User is warned via toast if video already exists in the system (duplicate detection)

### Add Perspective (PERSP)

- [ ] **PERSP-01**: User can select a video to add a perspective on
- [ ] **PERSP-02**: User can set Quality rating (0-10000 via number input, displayed as progress bar visualization)
- [ ] **PERSP-03**: User can set Agreement rating (0-10000 via number input, displayed as progress bar visualization)
- [ ] **PERSP-04**: User can set Importance rating (0-10000 via number input, displayed as progress bar visualization)
- [ ] **PERSP-05**: User can set Confidence rating (0-10000 via number input, displayed as progress bar visualization)
- [ ] **PERSP-06**: User can enter Like text (freeform)
- [ ] **PERSP-07**: User can enter Review text (design TBD)
- [ ] **PERSP-08**: User sees validation error toasts (top-right, auto-dismiss 2s) before submission
- [ ] **PERSP-09**: User sees success toast notification after perspective is created

### User Management (USER)

- [ ] **USER-01**: User can select from existing users via dropdown
- [ ] **USER-02**: Selected user persists across page navigation (session)
- [ ] **USER-03**: All perspective submissions are attributed to selected user

### Navigation & Layout (NAV)

- [ ] **NAV-01**: App has consistent header with navigation
- [ ] **NAV-02**: User can open Add Video modal from Activity page header
- [ ] **NAV-03**: Layout is mobile-first responsive (iPhone SE 375px minimum)
- [ ] **NAV-04**: Responsive breakpoints work correctly (documentation optional)
- [ ] **NAV-05**: Wrapper and layout layers adjust automatically across breakpoints

### Backend Integration (API)

- [ ] **API-01**: Frontend connects to existing Go GraphQL backend
- [ ] **API-02**: CORS configured on backend to allow frontend origin
- [ ] **API-03**: All queries use TanStack Query with proper caching

### Testing (TEST)

- [ ] **TEST-01**: Vitest configured with coverage reporting (Phase 1)
- [ ] **TEST-02**: Shared test fixtures and helpers established (Phase 1)
- [ ] **TEST-03**: Phase 2 components/utilities have unit tests (written alongside code)
- [ ] **TEST-04**: Phase 3 components/utilities have unit tests (written alongside code)
- [ ] **TEST-05**: Phase 4 components/utilities have unit tests (written alongside code)
- [ ] **TEST-06**: Final coverage verification ≥80% of lines (Phase 5)

### Deployment & Infrastructure (DEPLOY)

- [ ] **DEPLOY-01**: Frontend deployment host selected (GitHub Pages, Vercel, Cloudflare Pages, or other)
- [ ] **DEPLOY-02**: Frontend deployed and accessible via public URL
- [ ] **DEPLOY-03**: CI/CD pipeline configured for automatic deployments

---

## Open Decisions

| Decision | Options | Status |
|----------|---------|--------|
| Frontend hosting | GitHub Pages, Vercel, Cloudflare Pages, Netlify | TBD in Phase 5 |
| Database provider | Sevalla (current) vs Neon (PostgreSQL 17, better analytics) | TBD — evaluate Neon for analytics drivers |

**GitHub Project:** https://github.com/users/CodeWarrior-debug/projects/4

---

## Future Requirements (v1.1+)

### Mobile Experience
- **MOB-01**: Mobile card layout transformation for data table
- **MOB-02**: Touch-optimized slider controls
- **MOB-03**: Mobile-first responsive refinements

### Advanced Perspective Features
- **PERSP-10**: Dynamic field types (data-type picker)
- **PERSP-11**: Multi-step wizard for detailed perspectives
- **PERSP-12**: CategorizedRatings support (custom categories)

### Content Types
- **CONT-01**: Claim as a content type (migrate from Perspective.Claim)
- **CONT-02**: Support for non-YouTube content types

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Mobile card layout | User explicitly excluded — desktop table only for v1 |
| Aggregate stats footer | User explicitly excluded — not wanted |
| Authentication/login | v1 uses user dropdown selector, no auth |
| Manual metadata entry | Backend auto-fetch should handle all cases |
| Infinite scroll | Against "calm browsing" goal — use pagination |
| Quick mode (agree/disagree) | All 4 ratings + Like + Review are the basic view |
| Real-time updates | Not needed for v1 |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SETUP-01 | Phase 1 | Complete |
| SETUP-02 | Phase 1 | Complete |
| SETUP-03 | Phase 1 | Complete |
| SETUP-04 | Phase 1 | Complete |
| SETUP-05 | Phase 1 | Complete |
| SETUP-06 | Phase 1 | Complete |
| SETUP-07 | Phase 1 | Complete |
| SETUP-08 | Phase 1 | Complete |
| NAV-01 | Phase 1 | Complete |
| NAV-02 | Phase 1 | Complete |
| NAV-03 | Phase 1 | Complete |
| NAV-04 | Phase 1 | Complete |
| NAV-05 | Phase 1 | Complete |
| SETUP-09 | Phase 1 | Complete |
| API-01 | Phase 1 | Complete |
| ACT-01 | Phase 2 | Complete |
| ACT-02 | Phase 2 | Complete |
| ACT-03 | Phase 2 | Complete |
| ACT-04 | Phase 2 | Complete |
| ACT-05 | Phase 2 | Complete |
| ACT-06 | Phase 2 | Complete |
| USER-01 | Phase 2 | Complete |
| USER-02 | Phase 2 | Complete |
| API-03 | Phase 2 | Complete |
| VIDEO-01 | Phase 3 | Pending |
| VIDEO-02 | Phase 3 | Pending |
| VIDEO-03 | Phase 3 | Pending |
| VIDEO-04 | Phase 3 | Pending |
| VIDEO-05 | Phase 3 | Complete |
| PERSP-01 | Phase 4 | Pending |
| PERSP-02 | Phase 4 | Pending |
| PERSP-03 | Phase 4 | Pending |
| PERSP-04 | Phase 4 | Pending |
| PERSP-05 | Phase 4 | Pending |
| PERSP-06 | Phase 4 | Pending |
| PERSP-07 | Phase 4 | Pending |
| PERSP-08 | Phase 4 | Pending |
| PERSP-09 | Phase 4 | Pending |
| USER-03 | Phase 4 | Pending |
| TEST-01 | Phase 1 | Complete |
| TEST-02 | Phase 1 | Complete |
| TEST-03 | Phase 2 | Complete |
| TEST-04 | Phase 3 | Pending |
| TEST-05 | Phase 4 | Pending |
| TEST-06 | Phase 5 | Pending |
| DEPLOY-01 | Phase 5 | Pending |
| DEPLOY-02 | Phase 5 | Pending |
| DEPLOY-03 | Phase 5 | Pending |
| API-02 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 42 total
- Mapped to phases: 42/42
- Unmapped: 0

---
*Requirements defined: 2026-02-05*
*Last updated: 2026-02-05 after roadmap creation*
