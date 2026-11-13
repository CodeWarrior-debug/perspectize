# Transition & Completeness Improvements

Suggestions from tracing the flows in [USER_FLOWS.md](./USER_FLOWS.md). "Transition" = what happens when one step hands off to the next; "completeness" = a state or path that exists in the data/API but is missing or thin in the UI.

- **Basis:** reading the code, not running the app. Items marked *verify* need a quick look in a real session before building.
- **Not repeated here:** the column/sort/theme/mobile parity gaps already in [.docs/UI_GAP_AUDIT.md](../../.docs/UI_GAP_AUDIT.md) (#1–#21 there). Where one overlaps, it's cross-referenced.
- **Impact:** H = affects the core loop (find → add → perspective → compare), M = noticeable friction, L = polish. **Effort:** S ≈ hours, M ≈ a day or two, L = multi-PR.

## Priority picks

If only five get done, do these: **#1** (add → perspective handoff), **#2** (Compare's "Add yours"), **#4** (guest deep links), **#5** (empty-state CTAs) and **#9** (item added but not visible).

| # | Improvement | Impact | Effort |
|---|---|---|---|
| 1 | Add → "Leave a perspective" handoff | H | S |
| 2 | Compare "Add yours" lands on Activity, not the editor | H | S |
| 3 | Plain YouTube-add toast has no "Go to video" | M | S |
| 4 | Guest deep links lose all context | H | M |
| 5 | Empty states have no next step | H | S |
| 6 | Signed-out nav links and dead Plan sign-in branch | M | S |
| 7 | Messages unreachable from the header, no unread cue | M | S |
| 8 | No 404 / route error page | M | S |
| 9 | Newly added item may not appear in the grid | H | M |
| 10 | Discover "already in library" check stops at 100 | M | M |
| 11 | "In Library" cards are dead ends | M | S |
| 12 | Discover search leaves the app | M | M |
| 13 | Load More ignores the region used for page one | L | S |
| 14 | Compare picker filters to 2+ perspectives after fetching 40 | M | S |
| 15 | Compare is missing from Plan and Discover-after-add paths | L | S |
| 16 | Onboarding ends with nothing | M | S |
| 17 | Onboarding step 2 with no video | M | S |
| 18 | Inconsistent confirm patterns, no undo | M | M |
| 19 | Draft safety is perspective-only | M | M |
| 20 | Feedback requires GitHub and bounces out of the app | L | M |
| 21 | No profile / username editing in the UI | M | M |
| 22 | No share / copy-link; client-only rendering means no link previews | M | L |
| 23 | Plain-text "Loading…" instead of skeletons | L | M |
| 24 | Messaging has no error state | M | S |
| 25 | Mobile header is crowded | M | M |
| 26 | Every page has the same tab title | L | S |
| 27 | Keyboard shortcuts exist on one page only | L | M |
| 28 | Add Content popover small friction | L | S |
| 29 | Discover Esc/⌘K handlers are window-wide | L | S |
| 30 | Post-sign-in has no welcome / resume | L | S |

---

## Core-loop handoffs

### 1. Add → "Leave a perspective" handoff — H / S
Adding content ends in a toast (`useAddVideo.ts`, `useAddMovie.ts`, `useAddPassage.ts`). The very next thing the product wants is a perspective, but only the onboarding coach bridges that, and only once. Give the success toast a second action ("Add perspective") that opens `PerspectivePopover` for the new item, or auto-open it for the user's first few adds. Discover's inline card already does this for videos added there; do the same for the header popover.

### 2. Compare "Add yours" lands on Activity — H / S
`Compare.svelte:279` links to `/`. The user clicks a CTA about *this* content and ends up on the generic grid, unfiltered and without the editor open. Open the perspective popover in place (the component is already used elsewhere), or deep-link to `/?open=<id>&perspective=1`. On save, return to Compare so they see themselves in the comparison.

### 3. Plain YouTube add has no "Go to video" — M / S
Duplicate videos get `Go to video` (`useAddVideo.ts`) and movies/passages get `Go to …`, but a genuine new YouTube add shows a bare "Added: …". The most common path is the one without the shortcut. Reuse `activityContentHref`.

### 9. Newly added item may not appear in the grid — H / M
Activity starts with `f.type=youtube`, so a user who adds a movie or Bible passage from the header popover sees a success toast but no new row. The "Go to …" action opens the modal via the `?open=` fallback query, which works, but the grid itself never shows it. Options: when the added type is excluded by the active filter, say so in the toast ("Hidden by your YouTube filter — show all"), or have the toast action also relax the type filter. Also *verify* sort/page behavior: `useAddVideo` prepends to every cached list regardless of that list's filters/sort/page.

### 15. Compare is reachable from fewer places than it could be — L / S
Compare is linked from the Activity modal and Discover cards. Plan rows and the Plan→Perspective flow have no "Compare" link even though they sit on content that usually has other takes. Add it where the content is already in view.

## Entry, empty and error states

### 4. Guest deep links lose all context — H / M
`GuestLanding` replaces every route for signed-out visitors (`+layout.svelte`). Someone sent `/compare?contentId=42` sees the generic pitch with no hint of what they were sent. Show "Sign in to see this comparison" (title, thumbnail if cheap) on the landing, and *verify* that the URL survives the Clerk modal. Longer term, a public read-only Compare is the strongest growth surface the product has.

### 5. Empty states have no next step — H / S
- Activity empty: `"No content yet"` (`ActivityTable.svelte:1206`) — no Add Content or Discover button. The filtered-empty variant should offer "Clear filters".
- Compare empty states point back to Activity but nowhere useful ("No one has shared a perspective" → offer "Add yours").
- Messages: "Select a conversation" / "No conversations yet" have no "New conversation" button in the pane (the dialog exists on the list header).
Each should carry the single most useful action.

### 6. Signed-out nav and the dead Plan branch — M / S
Guests see Activity / Discover / Compare / Plan in the header, but all four render the same landing page. `plan/+page.svelte` has a signed-out branch with its own "Sign in" CTA, which can never show because the layout only renders `children` when signed in. Hide the nav for guests (or dim it) and delete the dead branch, or let guests see Plan's pitch page.

### 7. Messages unreachable from the header — M / S
Known gap (UI_GAP_AUDIT #14). The widget FAB is the only entry. Add a header icon with an unread badge so users see activity without opening the widget, and link it to the widget/`/messages`.

### 8. No 404 or route-error page — M / S
No `+error.svelte` exists. A mistyped URL shows SvelteKit's default error, outside the app chrome. Add a root error page with the header, a message, and links to Activity and Discover. Also cover bad `?contentId` on `/compare` (it shows "couldn't load details" inline, which is fine; confirm it also covers *not found* versus *network error*).

### 24. Messaging has no error state — M / S
`ThreadList`, `MessagesLayout` and `ThreadView` handle loading and empty but not failed queries (no `isError` anywhere in `components/messaging`). A failed thread fetch looks like "No conversations yet", which is misleading. Add error + retry like Activity and Compare have.

### 23. Plain-text "Loading…" — L / M
Clerk loading, Plan, Compare and the compare picker use text-only placeholders; the page then jumps when data arrives. Skeleton rows matching the final layout would remove the shift, most visibly on Plan and Compare.

## Discover

### 10. "Already in library" stops at 100 — M / M
`discover/+page.svelte` builds `libraryUrls` from `LIST_CONTENT(first: 100)` (its own comment calls this an MVP tradeoff). Past 100 items, trending cards for videos you already added show an active **Add** button; clicking yields the duplicate warning. Replace with a server lookup by URL/video id for the visible cards.

### 11. "In Library" cards are dead ends — M / S
The disabled state (`VideoCard.svelte`, `isInLibrary` branch) shows a label and nothing else, because only this-session adds have the metadata. Make it a link to `activityContentHref(...)`, resolved by URL on click, so the user can jump to their copy.

### 12. Discover search leaves the app — M / M
Typing a query hands off to youtube.com (quota-driven). The user then has to copy a URL back and paste it into the search box. Reduce the round trip: detect a YouTube URL on the clipboard when the box is focused ("Add the video you copied?"), and show a short hint explaining the hand-off. A small server-side search cache would remove the hand-off entirely.

### 13. Load More ignores the region — L / S
`handleLoadMore` calls `fetchYouTubeTrending('US', token)` while the first page uses the default. Pass one value through, and consider exposing a region picker.

### 29. Window-wide ⌘K / Esc — L / S
The Discover handlers are on `window`; Esc clears the search even if a dialog or popover is focused above it. Scope them to when no overlay is open.

## Compare

### 14. Picker filters after fetching — M / S
`ComparePicker` fetches 40 items then filters to `perspectiveCount >= 2` client-side. If fewer than 40 matches contain ≥2 perspectives, results can look empty while valid matches sit on page 2. Add a `minPerspectives` filter to `ContentFilter` (backend) and drop the client filter.

## Onboarding

### 16. Onboarding ends with nothing — M / S
`advanceCoachStep(2)` → `'complete'` just closes the panel. Finish with a short "what's next" card: Discover for more, Compare once there are two takes, Plan to keep a queue, Messages to share. This is the only moment the product can introduce those four areas.

### 17. Step 2 with no video — M / S
"Leave a perspective" is disabled when there is no `perspectiveTarget`, with "Back to add video" beside it. That's reasonable, but the disabled button doesn't say why. Add helper text ("You need at least one video first") and offer "Browse Discover".

## Safety nets

### 18. Inconsistent confirms, no undo — M / M
Perspective delete uses an inline confirm (good); list delete in Plan uses `window.confirm` (`ListSwitcher.svelte:86`); todo delete behavior should be checked (*verify*). Settle on one pattern, and prefer an **Undo** toast over a confirm for low-stakes deletes (todos, messages).

### 19. Draft safety is perspective-only — M / M
`PerspectivePopover` saves review drafts to localStorage and restores them. `TodoDialog` (399 lines of form) and the message composer have no equivalent, and nothing warns on navigation with a dirty form. Reuse `perspectiveDraft` for todos; show a "Draft restored" hint so the behavior is discoverable. (The version watcher already avoids reloading while typing, which is good.)

## Account and platform

### 20. Feedback leaves the app — L / M
`FeedbackDialog` opens GitHub issue templates and then closes Settings, so users without a GitHub account can't send anything and nobody confirms receipt. Add an in-app form (posts to the backend or a mailbox) with GitHub as an alternative, and keep Settings open.

### 21. No profile or username editing — M / M
`createUser`, `updateUser` and `deleteUser` exist in the GraphQL schema; only Clerk's `UserButton` is exposed in the UI. Users can't change their displayed username, which appears in the User column, Compare and Messages. Add a Profile section in Settings, and the delete/export path that account deletion will need.

### 22. No share / copy-link; no link previews — M / L
The product is about *sharing* perspectives, yet there is no "Copy link" on a content item, a perspective, or a comparison. And `ssr = false` (`routes/+layout.ts`) means a shared link unfurls as a blank app shell in Slack/iMessage. Add copy-link buttons now; plan a small server-rendered meta endpoint (or prerendered share pages) for Open Graph tags later. Pairs with #4.

### 30. No post-sign-in welcome or resume — L / S
After sign-in the user lands wherever the URL was; there's no "Welcome back" or resumption of what they were doing (for example the item they clicked "Add perspective" on). Even a one-line toast for first sign-in, and preserving intent through the modal, would smooth the first transition.

## Mobile, accessibility, polish

### 25. Mobile header is crowded — M / M
At phone width one 64 px row holds the brand, four `text-xs` nav links, Add Content, Settings and the avatar. Targets are small and Plan/Compare compete for space. Move nav to a bottom tab bar (Activity / Discover / Plan / Messages) and keep Add Content as a primary button. Related: UI_GAP_AUDIT #10 for card content.

### 26. Every page has the same tab title — L / S
The layout sets a favicon and manifest but no `<title>` per route, so history and tab strips read identically. Set titles per route (Activity, Discover, Compare — *content name*, Plan).

### 27. Keyboard shortcuts on one page only — L / M
⌘K works on Discover only. A global command palette (add content, jump to Compare, search Activity) would reuse existing pieces (`detectContentType` already classifies pasted input).

### 28. Add Content popover friction — L / S
- Auto-focus the input on open; submit on Enter (verify it already does via `FormPopover`).
- Pre-fill from the clipboard when it holds a recognizable link (the paste button already handles read permission).
- When the type is "Select a type" (nothing detected), say what's accepted instead of leaving Add disabled with no message.
- The `CLAIM` branch says "can't be added from here yet" — hide it until Claims have UI (UI_GAP_AUDIT #12 defers this on purpose).

---

## Suggested sequencing

1. **One PR, mostly frontend, small:** #1, #2, #3, #5, #6, #8, #16, #17, #26. Each is a link, toast action or empty-state change.
2. **Reliability:** #10, #11, #14, #24 (plus a backend `minPerspectives` filter).
3. **First-contact funnel:** #4, #22, #30 (a design decision on public/read-only views comes first).
4. **Shell and mobile:** #7, #25, #23.
5. **Safety and account:** #18, #19, #20, #21.

Each user-visible change needs a test per the repo's rules (component tests under `frontend/tests/components`), and anything touching list/fetch behavior needs the cache-contract test from `.docs/QUERY_BUDGET.md`.
