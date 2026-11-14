# Import staging (bulk import from channels and filmographies)

Status: draft <!-- draft | accepted | done | superseded by <link> -->

**Release approach:** [dark backend](../../.docs/RELEASE_APPROACHES.md#dark-backend-merge-gated-frontend). The backend merges to `main` unused; the `/import` pages stay on `feature/import-staging-frontend` until the owner merges them.

## Problem

Content arrives one URL at a time. People want whole creators in Perspectize: "all of Jordan Peterson's videos", "all Grace to You sermons", "every Christopher Nolan film". A source has tens to thousands of items, most of which the person doesn't want, and today there is no way to see them all, judge them, and bring in only the good ones without duplicating what's already in the library.

## Proposed outcome

- A named **import** groups one or more **sources** (a YouTube channel, a TMDB person's filmography). Each source is listed in the background, and every candidate becomes a row in a shared staging sheet.
- Every row names its **destination content type** (YouTube video, Movie) and carries enough to decide without leaving the page ([Decision 8](../../.claude/docs/ADDING_CONTENT_TYPE.md#decision-8-import-preview--enough-for-an-informed-decision)): what it is, how big, how current, how well received, and full detail on click.
- A signed-in user filters, sorts and multi-selects rows on a desktop-first spreadsheet page and imports them. Rows already in the library are marked and can't be picked. Imports run in the background and each row reports its outcome.

## Affected users and systems

- Signed-in users (pick and import); admins (create imports, which spend API quota).
- Backend: new `import_jobs` / `import_job_sources` / `import_job_items` tables, YouTube channel listing, TMDB person credits, an import service with goroutine pipelines, new GraphQL queries and mutations.
- Frontend: new `/import` and `/import/[id]` pages (not in the main nav; preliminary, not primary).
- Demo mode: seeded sample imports so the page can be seen locally with no API keys.

## Constraints

- YouTube Data API quota (10,000 units/day): list with `playlistItems.list` and enrich with `videos.list` at 50 ids per call; never `search.list`.
- No scraping (gty.org robots.txt; Salem terms). Sources are official APIs only.
- Additive only while dark: nothing in the current UI changes.
- Migrations are written, never applied in dev.

## Open questions

Carried from the [spec](../../docs/superpowers/specs/2026-10-27-youtube-channel-import-design.md#open-questions); defaults taken for v1 are in the plan.

## Downstream

- Spec: [YouTube channel import](../../docs/superpowers/specs/2026-10-27-youtube-channel-import-design.md) (PR #618)
- Plan: [Import staging plan](../../docs/superpowers/plans/2026-10-27-import-staging-plan.md)
- PRs (one line each, add as they open; tick on merge):
  - [ ] Dark backend: import jobs, sources, items, pipelines, GraphQL — open
  - [ ] Frontend: `/import` staging sheet — merge-gated
