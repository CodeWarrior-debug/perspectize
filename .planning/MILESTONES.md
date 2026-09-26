# Milestones

Project milestone history for Perspectize.

---

## v1.0 — Frontend MVP (COMPLETE)

**Completed:** 2026-02-16
**Phases:** 1-10 (with decimal insertions)
**Summary:** Functional SvelteKit frontend enabling users to discover YouTube videos, add new videos via URL paste, and view content in an AG Grid table.

### Delivered Capabilities

- SvelteKit + shadcn-svelte + Tailwind CSS v4 foundation
- TanStack Query data fetching with proper caching
- AG Grid data table with server-side pagination, sorting, filtering
- Add Video flow (paste YouTube URL → auto-fetch metadata)
- User selector dropdown with session persistence
- Mobile-responsive design (375px minimum)
- GORM ORM migration with cursor pagination
- Performance monitoring baselines
- Deployed on Sevalla (backend) + Sevalla Static Sites (frontend)

### Phase Summary

| Phase | Name | Plans |
|-------|------|-------|
| 1 | Foundation | 5 |
| 2 | Data Layer + Activity | 2 |
| 2.1 | Mobile Responsive Fixes | 2 |
| 3 | Add Video Flow | 2 |
| 3.1 | Design Token System | 2 |
| 3.2 | Activity Page Beta Quality | 8 |
| 3.3 | Repository Rename | 0 (obsolete) |
| 4 | Add Perspective Flow | 2 (not started) |
| 5 | Testing + Deployment | 3 |
| 6 | Error Handling | 0 (not started) |
| 7 | Backend Architecture | 3 |
| 7.1 | ORM Migration | 3 |
| 7.2 | gorm-cursor-paginator | 2 |
| 7.3 | Frontend Caching Remediation | 4 |
| 7.4 | Performance Monitoring | 1 |
| 8 | User Integration Flow | 1 |

**Total executed plans:** 38

### Remaining v1.0 Work

Phase 4 (Add Perspective Flow) is the final MVP feature. Phases 6, 8.1, 9, 10 are post-MVP concerns remediation.

---

## v1.1 — Platform Expansion (PLANNED)

**Status:** Planning
**Target:** Expand beyond YouTube, add authentication, improve performance, enable social features

### Feature Categories (from FEATURE_BACKLOG.md)

**HIGH PRIORITY:**
- Authentication Architecture Design
- Server-Side Sorting and Filtering for Activity Table
- Slow COUNT(*) and JSONB Sort Queries

**MEDIUM PRIORITY:**
- Multi-Content-Type Schema Design (Books, Articles, Podcasts)
- Content Categories (Google Content Taxonomy)
- AG Grid Power Features Toolbar
- Compress/Trim YouTube Raw JSONB Response

**FUTURE FEATURES:**
- Discover Page (YouTube API search/browse)
- Robustness Score
- Provenance Icons
- Chat/Discussion on Content
- Jeeves AI Assistant

### Phases (Planned)

TBD — See `/gsd:new-milestone` for full planning.

---

## v1.2 — Jeeves AI Assistant (IN PROGRESS — parallel with v1.1)

**Started:** 2026-09-26
**Phases:** 25+ (progressive — only the next phase is planned in detail)
**Summary:** In-app AI assistant on a provider-neutral `ai-tooling/` Go module: app guide, read-only tools, `botler` dev CLI, eval harness, streaming sidebar UI, then an OpenRouter pivot gated by evals. Jeeves moves out of "FUTURE FEATURES" above. Deferred to a later milestone: credits/BYOK billing and the remote MCP server (+ Chrome extension use case).
**Details:** `.planning/PROJECT.md` (Current Milestone), `.planning/v1.2-REQUIREMENTS.md`, `ai-tooling/CLAUDE.md`.

---
*Last updated: 2026-02-16*
