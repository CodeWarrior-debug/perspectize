# User Feedback Collection System Design

**Date:** 2026-09-28  
**Author:** Claude Haiku 4.5  
**Status:** Spike / Design spec for review before plan creation  

---

## Executive Summary

Enable users to report bugs and request features directly from the app. Feedback flows into a secured admin review page where reports are triaged, categorized, and optionally converted to GitHub issues.

**User value:** Direct signal from the community on what's broken and what's wanted — replaces external feedback channels (email, Discord).

**Scope:** Two-phase delivery. Phase 1 (this plan) is a feedback dialog + basic admin triage. Phase 2 (future) adds GitHub issue automation.

---

## 1. Problem & Motivation

**Current state:**  
- Users find bugs or want features
- No in-app channel to report them
- Feedback goes nowhere (email, word-of-mouth, lost)
- Maintainers miss signal

**Target user journey:**  
1. User clicks "Send feedback" in the header menu
2. Dialog appears: type feedback, select "Bug" or "Feature idea", optionally upload a screenshot
3. Feedback saves with user ID, app version, page context, timestamp
4. Admin reviews a simple page listing all feedback, filters by type/user, decides next steps

---

## 2. Phase 1: Feedback Collection + Admin Review (This Plan)

### 2.1 Data Model

#### New Table: `feedback`

```sql
CREATE TABLE feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('bug', 'feature')),
  title TEXT NOT NULL, -- short summary, max 200 chars
  description TEXT NOT NULL, -- detailed report
  page_url TEXT, -- current page when submitted
  screenshot_url TEXT NULL, -- optional uploaded image
  app_version TEXT NOT NULL, -- tag or commit SHA from frontend
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'in_progress', 'resolved', 'wontfix')),
  admin_notes TEXT NULL, -- private notes from reviewer
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX feedback_user_id_idx ON feedback(user_id);
CREATE INDEX feedback_type_idx ON feedback(type);
CREATE INDEX feedback_status_idx ON feedback(status);
CREATE INDEX feedback_created_at_idx ON feedback(created_at DESC);
```

### 2.2 Backend: GraphQL API

#### Mutation: `submitFeedback`

```graphql
type Mutation {
  submitFeedback(input: SubmitFeedbackInput!): Feedback!
}

input SubmitFeedbackInput {
  type: FeedbackType! # "BUG" | "FEATURE"
  title: String! # max 200 chars
  description: String! # max 5000 chars
  pageURL: String
  screenshotURL: String # optional, pre-signed upload URL
  appVersion: String! # from frontend build info
}

enum FeedbackType {
  BUG
  FEATURE
}

type Feedback {
  id: ID!
  type: FeedbackType!
  title: String!
  description: String!
  pageURL: String
  screenshotURL: String
  appVersion: String!
  status: FeedbackStatus!
  user: User!
  createdAt: DateTime!
  updatedAt: DateTime!
}

enum FeedbackStatus {
  OPEN
  ACKNOWLEDGED
  IN_PROGRESS
  RESOLVED
  WONTFIX
}
```

#### Query: `feedbackList` (admin-only)

```graphql
type Query {
  feedbackList(
    first: Int = 20
    after: String
    type: FeedbackType
    status: FeedbackStatus
    sortBy: FeedbackSortBy = CREATED_AT_DESC
  ): FeedbackConnection! @requireAuth(admin: true)
}

enum FeedbackSortBy {
  CREATED_AT_DESC
  CREATED_AT_ASC
  UPDATED_AT_DESC
}

type FeedbackConnection {
  edges: [FeedbackEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type FeedbackEdge {
  cursor: String!
  node: Feedback!
}
```

#### Mutation: `updateFeedbackStatus` (admin-only)

```graphql
type Mutation {
  updateFeedbackStatus(
    feedbackID: ID!
    status: FeedbackStatus!
    adminNotes: String
  ): Feedback! @requireAuth(admin: true)
}
```

### 2.3 Frontend: UI Components

#### `FeedbackDialog.svelte`

- Triggered from header "Help" menu → "Send feedback"
- Form fields:
  - **Type:** Radio buttons (Bug / Feature idea)
  - **Title:** Text input, ~200 char limit, counter
  - **Description:** Textarea, ~5000 char limit, counter
  - **Page context:** Auto-captured (current URL, breadcrumb)
  - **Screenshot:** Optional file upload (or paste from clipboard)
- Submit button: disabled until title + description are filled
- Success state: "Thanks! We've received your feedback."
- Error handling: Show submission errors, retry button

**Location:** Accessible from header menu (next to user menu or under Help)

#### Admin Review Page: `AdminFeedbackPage.svelte`

**Route:** `/admin/feedback`  
**Protected:** `@requireAuth(admin: true)`

- **Filters:**
  - Type: All / Bug / Feature
  - Status: All / Open / Acknowledged / In Progress / Resolved / Won't Fix
  - Date range: (optional, not MVP)
- **Table columns:**
  - Type (icon badge)
  - Title
  - User (email)
  - Status (dropdown to change)
  - Created at
  - Action: expand to see full details
- **Detail view (expandable row or modal):**
  - Full description
  - Screenshot preview (if exists)
  - Page URL (clickable link)
  - App version
  - Admin notes textarea
  - Status dropdown (with save button)
  - Delete button (soft delete: set status to archived)

### 2.4 Screenshot Upload

**MVP approach:** Use browser File API, POST to a signed S3 URL (or similar CDN storage).

- Frontend: `generatePresignedURL` GraphQL mutation (optional Phase 1.5 if storage budget tight; initially accept data URLs or external links)
- Store URL in `feedback.screenshot_url`
- No backend processing (no virus scanning yet)

### 2.5 App Version Tagging

**Frontend:** Expose `APP_VERSION` build variable (e.g., commit SHA, semver, or CI build ID).

```ts
// frontend/src/lib/config.ts
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || 'dev';
```

**Backend:** Accept it as string in `SubmitFeedbackInput`. No validation yet (log mismatches).

---

## 3. Phase 1.5: GitHub Issue Linking (Optional)

Not in MVP Phase 1, but designed for it:

- **Admin field:** `github_issue_url` (optional TEXT column, indexed)
- **Admin action:** Manually paste or enter a GitHub issue URL on a feedback detail
- **Flow:**
  1. Admin reviews feedback
  2. Admin decides it matches an existing GitHub issue or creates one manually
  3. Admin pastes the GitHub issue URL into `github_issue_url` field
  4. Feedback detail shows "Linked issue: #123" with a clickable link
- **Benefit:** Closes the loop — feedback author can see their report was tracked; admins have a canonical source of truth (GitHub issues remain the single source of truth for bug/feature tracking)

## 4. Phase 2: GitHub Issue Automation (Future)

Future enhancement (post-Phase-1):

- **Admin button:** "Create issue" on a feedback detail
- **Requires:** GitHub token stored in server env (`GITHUB_TOKEN`)
- **Flow:**
  1. Admin reviews feedback
  2. Admin clicks "Create issue" button
  3. Backend creates GitHub issue using bug_report.md or feature_request.md template
  4. Issue link auto-populated in `feedback.github_issue_url`
  5. Feedback author is notified (optional: Slack ping to admins)
- **Caveat:** Only create issues for well-formed feedback. Admin reviews before creating. Sensitive details (internal paths, security findings) stay in private `admin_notes` field, never in public GitHub issue.

---

## 4. Migration Path

**Phase 1.0 → 1.5 (optional):** Add screenshot storage (pre-signed URLs, CDN)  
**Phase 2.0:** GitHub issue automation  
**Phase 3.0:** Sentiment analysis, trending feedback, Slack digest  

---

## 5. Technical Assumptions

- User is authenticated (feedback.user_id is non-null, backed by Clerk)
- Admin role already exists in schema and auth middleware
- GraphQL schema and resolvers follow existing patterns (gqlgen, repositories, services)
- Screenshot storage: defer to external CDN or Phase 1.5 task

---

## 6. Definition of Done (Plan Checklist)

- [ ] Database migration created and tested
- [ ] GraphQL schema updated (mutations, queries, types)
- [ ] Backend resolvers implemented (submitFeedback, feedbackList, updateFeedbackStatus)
- [ ] FeedbackService and FeedbackRepository created
- [ ] Frontend `FeedbackDialog` component built and styled
- [ ] Admin feedback review page created (`/admin/feedback`)
- [ ] Tests: resolver tests (at least happy path), component tests (dialog submission, form validation)
- [ ] App version tracking wired up (VITE_APP_VERSION in build)
- [ ] Manual QA: submit feedback, verify admin sees it, verify filter/status change works
- [ ] Docs: update FEATURE_BACKLOG.md with Phase 2 scope

---

## 7. Success Metrics

- Feedback form submits without errors
- Admin can see all feedback sorted and filtered
- Status changes persist and update timestamp
- No data loss on page reload
- Screenshot preview works (if uploaded)
- Error messages are helpful (submission errors, auth failures)

---

## 8. Notes for the Plan Writer

- **Naming:** Keep tables/fields lowercase with underscores (matches existing convention)
- **GraphQL types:** Use Go-style type generation (gqlgen) — no manual marshaling
- **Admin gating:** Reuse `@requireAuth(admin: true)` directive or similar (check existing auth patterns in `backend/schema.graphql`)
- **Soft deletes:** Not MVP — use explicit delete mutation if needed, or archive via status
- **Real-time updates:** Not MVP — polling is fine for admin page (feedback is not high-velocity)
- **Notification system:** Not MVP — admins check the page manually

---

## 9. References

- GitHub issue templates: `.github/ISSUE_TEMPLATE/bug_report.md`, `feature_request.md`
- Admin patterns: `backend/resolvers` (search `admin`)
- GraphQL mutations: `backend/schema.graphql` (search `Mutation`)
- Frontend form patterns: `frontend/src/lib/components` (look for dialog components)
