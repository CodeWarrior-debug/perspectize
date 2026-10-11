# User Feedback Collection System — Implementation Plan (QA Version)

**Spec:** `docs/superpowers/specs/2026-09-28-user-feedback-collection-design.md`  
**Execution skill:** `superpowers:executing-plans`

## Overview

Enable users to report bugs and request features via a simple in-app dialog that links directly to GitHub issue creation. Feedback goes straight to GitHub—no custom backend storage needed.

**Scope:** Frontend dialog component + two GitHub issue template links. No database, no admin panel.

---

## Frontend Tasks

- [ ] Create `frontend/src/lib/components/FeedbackDialog.svelte`
  - Dialog title: "Send Feedback"
  - Subtitle: "Help us improve Perspectize"
  - Two buttons:
    - **"Report a bug"** → links to `https://github.com/CodeWarrior-debug/perspectize/issues/new?template=bug_report.md`
    - **"Request a feature"** → links to `https://github.com/CodeWarrior-debug/perspectize/issues/new?template=feature_request.md`
  - Each button opens GitHub in a new tab
  - Dialog closes after button click
  - Optional: Use bug 🐛 and lightbulb 💡 icons
- [ ] Add menu entry in `frontend/src/lib/components/SettingsDialog.svelte` → "Send feedback"
  - Trigger opens FeedbackDialog
  - Place near the bottom of the settings menu (after theme picker, before other options)
- [ ] Dialog styling: Match existing SettingsDialog patterns, centered modal with clear button layout
- [ ] Accessibility: ARIA labels, focus trap, keyboard navigation
- [ ] Tests: `FeedbackDialog.test.ts` — verify dialog opens/closes, links are correct, buttons work
- [ ] `pnpm run test:run` all passing, `pnpm run check` zero new errors

---

## Prerequisites

- GitHub issue templates must exist:
  - `.github/ISSUE_TEMPLATE/bug_report.md`
  - `.github/ISSUE_TEMPLATE/feature_request.md`
- If templates don't exist, create them using GitHub's issue template UI or manually

---

## Definition of Done

- [ ] FeedbackDialog component created and styled
- [ ] Header menu entry added and functional
- [ ] Both GitHub links work (test by clicking in browser)
- [ ] Tests passing: component tests for dialog open/close, link verification
- [ ] No new linting errors
- [ ] Manual QA: Click "Send feedback" → dialog opens → click "Report a bug" → GitHub issue form opens with correct template
- [ ] No merge conflicts with `origin/main`

---

## Notes

**Why GitHub links only?**
- GitHub is the single source of truth for bugs/features
- No custom backend, no database, no admin panel needed
- Users file issues directly where the team works
- Simpler to maintain, fewer moving parts

**Future enhancements (not this plan):**
- Browser prefill: Pass current page URL as query param to GitHub
- Auth check: Show different UX for logged-out users
- Analytics: Track feedback submission rates
- Counter: Display "X bugs reported, Y features requested" (requires GitHub API call)

---

## References

- Spec: `docs/superpowers/specs/2026-09-28-user-feedback-collection-design.md`
- Dialog patterns: `frontend/src/lib/components/SettingsDialog.svelte`
- Header patterns: `frontend/src/lib/components/Header.svelte`
- GitHub issue templates: `.github/ISSUE_TEMPLATE/`
