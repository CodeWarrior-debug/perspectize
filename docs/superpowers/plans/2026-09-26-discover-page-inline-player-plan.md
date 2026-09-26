# Discover page: duration badge, inline player, Add to Perspectize

**Execution sub-skill:** none (superpowers plugin not enabled this session — executed via direct `Agent` subagent dispatch instead of `subagent-driven-development`).
**Spec:** none (scoped directly from Discover-page brainstorm in-conversation).

## Scope

Three fixes to `frontend/src/routes/discover/+page.svelte` and `frontend/src/lib/components/discover/*`:

1. **Duration badge** — Trending results already carry `contentDetails.duration` (ISO 8601, e.g. `PT4M13S`). Format it and badge it on the video card's media area. Search results have no duration (would need a separate `videos.list` call, out of scope) — badge only renders when `video.duration` is present.
2. **Inline player by default** — Replace `VideoCard`'s static thumbnail `<img>` with a lazy-loaded YouTube `<iframe>` embed (`https://www.youtube.com/embed/{id}`), gated by the existing `IntersectionObserver` (rootMargin 200px) so a long list doesn't mount dozens of iframes up front. Keep the pulsing placeholder until visible.
3. **"Add to Perspectize" flow** — Rename the add action (button label, subtitle, toasts, `AddContentPopover`/dialog copy) from "library" wording to "Add to Perspectize", using the `glasses` lucide icon (`@lucide/svelte/icons/glasses`) in place of the current plain button. On success, replace the card's action slot with an inline **content details card** (not a toast-only flow) showing: duration, view count, like count, channel, primary category — sourced from `createContentFromYouTube`'s response, which already returns these fields — plus two links:
   - **Add perspective** → opens `PerspectivePopover` (needs `contentId: number`, `contentName: string`, `userId`).
   - **Compare** → navigates to `/compare?contentId={id}`.

   Already-tracked videos (`isInLibrary`) render the same details card immediately (no need to click Add first) rather than a static "In Library" badge.

## Files touched

- `frontend/src/lib/components/discover/VideoCard.svelte` — inline player, duration badge, Add to Perspectize button, inline details card, wiring to `PerspectivePopover`.
- `frontend/src/lib/components/discover/VideoResultsGrid.svelte` — pass through any new props (contentId map, userId).
- `frontend/src/lib/services/youtubeApi.ts` — add `duration?: string` to `VideoItem`, populate from `TrendingItem.contentDetails.duration` in `toVideoItem`, add a `formatDuration` helper (or reuse `formatting.ts` if a suitable helper exists).
- `frontend/src/routes/discover/+page.svelte` — subtitle copy, pass `userId` down, keep `handleAdd` but surface the mutation's returned `content` (id + metadata) to `VideoCard` instead of only tracking `pendingId`.
- Existing tests for the above components/files — update and add coverage for: duration formatting/badge, iframe lazy-mount behavior, Add to Perspectize → details card transition, Compare/Add-perspective links.

## Out of scope (explicitly deferred)

- Duration for search results (needs a `videos.list` enrichment call — item #4 from the original brainstorm).
- The 100-item `libraryUrls` cap / per-item tracked lookup (item #6) — this plan keeps using the existing `libraryUrls` set as-is.
- Renaming "Library" anywhere outside the Discover page's own copy (Activity page, onboarding, etc. untouched here).

## Verification

- `pnpm run test:run` in `frontend/` — all pass.
- `pnpm exec svelte-check` (or existing lint/typecheck script) — zero new errors.
- No backend changes; skip backend checklist.
