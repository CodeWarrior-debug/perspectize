# User Feedback Collection System — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-09-28-user-feedback-collection-design.md`  
**Execution skill:** `superpowers:executing-plans`

## Overview

Enable users to report bugs and request features directly from the app via a dialog. Feedback flows into a secured admin review page for triage and status management.

**Phase 1 scope:** Dialog + admin triage page + database table.  
**Phase 2 (future):** GitHub issue automation.

---

## Backend Tasks

- [ ] Database migration: Create `feedback` table with user_id, type, title, description, page_url, screenshot_url, app_version, status, admin_notes, github_issue_url, timestamps
- [ ] GraphQL schema updates: Add `Feedback` type, `FeedbackType` enum (BUG, FEATURE), `FeedbackStatus` enum (OPEN, ACKNOWLEDGED, IN_PROGRESS, RESOLVED, WONTFIX)
- [ ] GraphQL mutations: `submitFeedback(input: SubmitFeedbackInput!): Feedback!`
- [ ] GraphQL mutations: `updateFeedbackStatus(feedbackID: ID!, status: FeedbackStatus!, adminNotes: String, githubIssueURL: String): Feedback!` (admin-only)
- [ ] GraphQL query: `feedbackList(first: Int, after: String, type: FeedbackType, status: FeedbackStatus, sortBy: FeedbackSortBy): FeedbackConnection!` (admin-only)
- [ ] `FeedbackRepository` implementation (GORM) — List, Get, Create, UpdateStatus methods with pagination support
- [ ] `FeedbackService` implementation — business logic (validation, authorization checks)
- [ ] Resolvers: `feedback.go` with QueryFeedback, QueryFeedbackList, MutationSubmitFeedback, MutationUpdateFeedbackStatus
- [ ] Admin auth: Add `@requireAuth(admin: true)` directive checks on List/UpdateStatus queries/mutations
- [ ] Tests: Resolver tests (happy path, auth checks), repository tests (Create, List with filters, UpdateStatus)
- [ ] Verification: `go test ./...` all passing

---

## Frontend Tasks

- [ ] Create `frontend/src/lib/components/FeedbackDialog.svelte`
  - Type selection: Bug / Feature idea (radio)
  - Title input (200 char limit)
  - Description textarea (5000 char limit)
  - Auto-capture current page URL
  - Optional screenshot upload (defer to Phase 1.5 if no CDN ready)
  - Form validation before submit
  - Success/error states
- [ ] Add menu entry in `frontend/src/lib/components/Header.svelte` → Help menu → "Send feedback"
- [ ] Create `frontend/src/lib/pages/admin/+page.svelte` for `/admin/feedback` route
  - Filters: Type (All/Bug/Feature), Status (All/Open/Acknowledged/In Progress/Resolved/Won't Fix)
  - Table: Type, Title, User email, Status (dropdown), Created at
  - Expandable row detail view: Full description, screenshot, page URL, app version, admin notes textarea, status dropdown with save, GitHub issue URL field (manual paste), delete button
  - Pagination: Use cursor-based pagination (gqlgen + TanStack Query)
  - Sort: By created_at (descending default)
- [ ] `frontend/src/lib/services/feedbackApi.ts` — GraphQL client helpers for submitFeedback, feedbackList, updateFeedbackStatus
- [ ] `frontend/src/lib/config.ts` — Expose `APP_VERSION` from build (VITE_APP_VERSION env var)
- [ ] Wire APP_VERSION into FeedbackDialog submission
- [ ] Tests: FeedbackDialog submit (form validation, mutation call), admin page filters (type/status), table rendering
- [ ] `pnpm run test:run` all passing, `pnpm run check` zero new errors

---

## Shared Tasks

- [ ] Build tool: Set up VITE_APP_VERSION env var in build process (commit SHA, semver, or CI build ID) — check backend build for precedent
- [ ] Documentation: Update `FEATURE_BACKLOG.md` with Phase 2 scope (GitHub issue automation, Slack digest, etc.)
- [ ] Manual QA checklist
  - Submit feedback as regular user → dialog closes, success message shown
  - Admin navigates to `/admin/feedback` → sees all feedback, can filter by type
  - Admin changes feedback status → table updates, updated_at timestamp changes
  - Admin adds notes → notes persist and are visible on re-fetch
  - Screenshot upload (if Phase 1.5): Upload, see preview in detail view
  - Error cases: Missing title/description → form shows validation error, submit disabled

---

## Definition of Done

- All checkboxes above are ticked
- Backend: All resolver tests passing, migration created
- Frontend: All component tests passing, no new linting errors
- Manual QA: All checklist items verified in running app
- No merge conflicts with `origin/main`
- Demo (optional): Brief screen recording of user submitting feedback → admin reviewing it

---

## Execution Notes

**Migration strategy:** The `feedback` table is new. On production:
1. Run migration manually against Sevalla database (documented in `.planning/phases/bugs/` or notes)
2. No data loss concern (table starts empty)

**Auth pattern:** Reuse existing `@requireAuth(admin: true)` pattern from other admin-protected resolvers. Check `backend/resolvers` for examples.

**GraphQL pagination:** Use cursor-based approach (matching existing `ContentConnection` pattern). TanStack Query on frontend will handle re-fetching on filter changes.

**Phase 1.5 blocker (screenshot upload):** If no pre-signed URL CDN available, defer screenshot field to Phase 1.5. Dialog and admin pages work without it — just skip screenshot upload in FeedbackDialog and set `screenshot_url` to NULL.

**Future phases (not this plan):**
- Phase 1.5: GitHub issue URL auto-linking when issue is manually created by admin
- Phase 2: GitHub issue auto-creation from admin panel (one-click "Create issue" button, needs GitHub token stored as secret)
- Phase 3: Sentiment analysis, trending feedback dashboard, Slack digest for new high-priority feedback

---

## References

- Spec: `docs/superpowers/specs/2026-09-28-user-feedback-collection-design.md`
- Existing resolver patterns: `backend/resolvers/content.go`, `backend/resolvers/me.go`
- Existing admin checks: Search `admin` in `backend/schema.graphql`
- GraphQL schema: `backend/schema.graphql`
- Dialog patterns: `frontend/src/lib/components/SettingsDialog.svelte`
- Table patterns: `frontend/src/lib/components/ActivityTable.svelte` (AG Grid reference)
- Auth patterns: `backend/internal/adapters/auth/clerk_middleware.go`
