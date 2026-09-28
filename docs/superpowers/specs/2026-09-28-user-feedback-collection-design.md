# User Feedback Collection System Design

**Date:** 2026-09-28  
**Author:** Claude Haiku 4.5  
**Status:** Initial QA Version

---

## Executive Summary

Enable users to report bugs and request features via a simple dialog that links directly to GitHub issue creation. No custom backend storage—feedback goes straight to GitHub as the single source of truth.

**User value:** One-click feedback submission that lands in the team's issue tracker immediately.

**Scope:** MVP dialog with two buttons linking to GitHub issue creation (bug_report.md and feature_request.md templates).

---

## 1. Problem & Motivation

**Current state:**  
- Users find bugs or want features but have no in-app way to report them
- External feedback channels (email, Discord) are scattered and hard to track
- Single source of truth for bugs/features is GitHub issues

**Target user journey:**  
1. User clicks "Send feedback" in header menu
2. Dialog appears with two options: "Report a bug" / "Request a feature"
3. User clicks one → GitHub issue creation page opens in new tab (pre-filled with template)
4. User files the issue directly in GitHub
5. Done—issue is live in the team's tracker

---

## 2. Design: Feedback Dialog

### 2.1 Component: `FeedbackDialog.svelte`

**Trigger:** Header menu → "Send feedback" (or Help → "Send feedback")

**Dialog content:**
```
┌─ Send Feedback ──────────────────┐
│                                  │
│ Help us improve Perspectize      │
│                                  │
│ ┌──────────────────────────────┐ │
│ │ Report a bug                 │ │
│ │ Something isn't working?     │ │
│ │ [Opens GitHub Bug Template]  │ │
│ └──────────────────────────────┘ │
│                                  │
│ ┌──────────────────────────────┐ │
│ │ Request a feature            │ │
│ │ Have an idea for improvement?│ │
│ │ [Opens GitHub Feature Form]  │ │
│ └──────────────────────────────┘ │
│                                  │
└──────────────────────────────────┘
```

**Behavior:**
- Each button links to `https://github.com/CodeWarrior-debug/perspectize/issues/new?template=bug_report.md` (or `feature_request.md`)
- Opens in new tab
- Dialog closes after user clicks a button
- No confirmation needed

### 2.2 Links

**Bug report:**
```
https://github.com/CodeWarrior-debug/perspectize/issues/new?template=bug_report.md
```

**Feature request:**
```
https://github.com/CodeWarrior-debug/perspectize/issues/new?template=feature_request.md
```

(Uses GitHub's issue template auto-selection feature — `.github/ISSUE_TEMPLATE/bug_report.md` and `feature_request.md` must exist)

### 2.3 No Backend Required

- No database table needed
- No GraphQL mutations or queries
- No admin panel
- Pure frontend component

---

## 3. Implementation Notes

**Dependencies:**
- Requires GitHub issue templates already in repo: `.github/ISSUE_TEMPLATE/bug_report.md` and `.github/ISSUE_TEMPLATE/feature_request.md`
- If templates don't exist, create them first using GitHub's template picker UI, or manually add files

**Styling:**
- Dialog matches existing SettingsDialog or modal patterns
- Two equal-width buttons, clear copy
- Icon: bug 🐛 for bug, lightbulb 💡 for feature (or use icon library)

**Accessibility:**
- Dialog has proper ARIA labels and focus trap
- Links are keyboard accessible
- Screen readers announce button purposes clearly

---

## 4. Future Enhancements (Not MVP)

- **Browser prefill:** Capture current page URL and pre-fill GitHub form with `body=Currently on: <url>`
- **Auth check:** Only show dialog to signed-in users (or show different CTA for logged-out users)
- **Analytics:** Track which users click "Report a bug" vs "Request a feature" (optional telemetry)
- **Feedback counter:** Show "Help improve Perspectize—X bugs reported, Y features requested" (requires GitHub API call to count open issues)

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
