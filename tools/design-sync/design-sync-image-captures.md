# Design-sync image captures

Screenshots for design-sync passes (Figma / Claude Design). Prefix `ds-`, not `sv-`.
Naming: `ds-<YYYY-MM-DD>-<desktop|mobile>-<NN>-<page>-<state>.png`, stored in `~/Downloads/screenshots/`.
Times are local (EDT). Captures are of the **locally running** app, logged in as the Clerk agentic test user.

## Key UI states capture list (desktop / mobile)

Re-run this list for every design-sync pass. "M" = mobile pass (not captured in run 1).

| # | Page | State | Desktop | Mobile | How to reach it |
|---|------|-------|:-------:|:------:|-----------------|
| 1 | Activity | No filter | x | M | `/` |
| 2 | Activity | Filtered to YouTube only | x | M | Type column header filter button, "contains" `youtube` (desktop). Mobile card mode has no column headers; needs another route to the filter |
| 3 | Activity | Filtered to Bible only | x | M | same, `bible` |
| 4 | Activity | Content detail: Bible passage | x | M | click a passage row's title (Bible filter on) |
| 5 | Activity | Content detail: YouTube | x | M | click a video row's title |
| 6 | Activity | Perspective form: Bible passage | x | M | click the `+` in the first column of a passage row |
| 7 | Activity | Perspective form: YouTube | x | M | same on a video row |
| 8 | Header | Add Video popover | x | M | header "Add Video" button |
| 9 | Settings | Customize Theme (presets) | x | M | header gear |
| 10 | Settings | Customize Theme, custom colors expanded | x | M | Settings, "Customize" button (the dialog has one section only) |
| 11 | Header | User menu | x | M | avatar |
| 12 | Header | User menu, Manage account | x | M | avatar, "Manage account" (Clerk modal) |
| 13 | Activity | Columns picker | x | M | footer "Columns" |
| 14 | Activity | Edit sorts | x | M | footer "Edit sorts" |
| 15 | Activity | Search-fields picker | x | M | toolbar sliders button next to search |
| 16 | Activity | By User view | x | M | "By User" toggle |
| 17 | Discover | Default (trending) | x | M | `/discover` |
| 18 | Discover | Search results | x | M | search "hegel aesthetics" |
| 19 | Compare | Empty (no content selected) | x | M | `/compare` |
| 20 | Compare | Content with no other perspectives | x | M | details modal, "Compare" (contentId 96) |
| 21 | Compare | Two users populated | x | M | `/compare?contentId=103` |
| 22 | Messages | Conversation list | x | M | `/messages` |
| 23 | Messages | Thread | x | M | `/messages/1` |
| 24 | Activity | Messages widget open | x | M | floating chat button, bottom right |

**Not capturable / skipped:** Discover duration/time/sort dropdowns (native `<select>`, the popup doesn't render in screenshots), theme preset switching (would change the saved theme), sign-out.

## Capture settings (run 1)

- **Viewport:** 1280x900, deviceScaleFactor 1, not mobile, no touch (`emulate`).
- **Browser:** sv-chrome (port 9222, main checkout's profile), signed in as the test user. Screenshots via Chrome DevTools MCP `take_screenshot`, viewport only (`fullPage` off).
- **URL visibility:** browser chrome isn't in a CDP screenshot, so a small fixed bar showing `location.href` is injected at the bottom of the page before each shot (removed by any navigation, re-injected). It covers the bottom ~22px of the viewport.
- **Servers:** frontend `vite dev` on `localhost:5173`, backend `go run ./cmd/server` on `:8080` (shared Sevalla dev database), both run from `.claude/worktrees/validate`.
- **Filters** applied through the Type column's AG Grid text filter, then the popup closed with Escape so the active-filter chip shows.
- **Theme:** default Reading Room (untouched).

## Run 1 - 2026-09-23 (desktop only)

- **Branch:** `feature/add-bible-content-types` (local, in worktree `validate`)
- **Beginning SHA:** `3dcc4c0` - a local, unpushed merge of `origin/feature/bible-passage-frontend-display` (`dd0cd42`, PR #407) onto the integration branch tip `964157d` (#403 + #406 merged). Worktree clean when taken. So this build has #403, #406 and #407, but **not** #408 (the header shows the older "Add Video" popover, not the new add-content flow).

| File | Device | Time | Branch | SHA |
|------|--------|------|--------|-----|
| ds-2026-09-23-desktop-01-activity-no-filter.png | desktop | 22:10:39 | feature/add-bible-content-types | 3dcc4c0 |
| ds-2026-09-23-desktop-02-activity-filter-youtube.png | desktop | 22:11:07 | feature/add-bible-content-types | 3dcc4c0 |
| ds-2026-09-23-desktop-03-activity-filter-bible.png | desktop | 22:11:21 | feature/add-bible-content-types | 3dcc4c0 |
| ds-2026-09-23-desktop-04-activity-detail-bible-passage.png | desktop | 22:13:29 | feature/add-bible-content-types | 3dcc4c0 |
| ds-2026-09-23-desktop-05-activity-perspective-form-bible-passage.png | desktop | 22:13:47 | feature/add-bible-content-types | 3dcc4c0 |
| ds-2026-09-23-desktop-06-activity-perspective-form-youtube.png | desktop | 22:14:09 | feature/add-bible-content-types | 3dcc4c0 |
| ds-2026-09-23-desktop-07-activity-detail-youtube.png | desktop | 22:14:17 | feature/add-bible-content-types | 3dcc4c0 |
| ds-2026-09-23-desktop-08-header-add-video-popover.png | desktop | 22:14:30 | feature/add-bible-content-types | 3dcc4c0 |
| ds-2026-09-23-desktop-09-settings-customize-theme.png | desktop | 22:14:40 | feature/add-bible-content-types | 3dcc4c0 |
| ds-2026-09-23-desktop-10-settings-customize-theme-custom-colors.png | desktop | 22:14:45 | feature/add-bible-content-types | 3dcc4c0 |
| ds-2026-09-23-desktop-11-user-menu.png | desktop | 22:14:59 | feature/add-bible-content-types | 3dcc4c0 |
| ds-2026-09-23-desktop-12-user-menu-manage-account.png | desktop | 22:15:05 | feature/add-bible-content-types | 3dcc4c0 |
| ds-2026-09-23-desktop-13-activity-columns-picker.png | desktop | 22:15:13 | feature/add-bible-content-types | 3dcc4c0 |
| ds-2026-09-23-desktop-14-activity-edit-sorts.png | desktop | 22:15:19 | feature/add-bible-content-types | 3dcc4c0 |
| ds-2026-09-23-desktop-15-activity-search-fields-picker.png | desktop | 22:15:26 | feature/add-bible-content-types | 3dcc4c0 |
| ds-2026-09-23-desktop-16-activity-by-user.png | desktop | 22:15:37 | feature/add-bible-content-types | 3dcc4c0 |
| ds-2026-09-23-desktop-17-discover-trending-default.png | desktop | 22:15:53 | feature/add-bible-content-types | 3dcc4c0 |
| ds-2026-09-23-desktop-18-discover-search-results.png | desktop | 22:16:06 | feature/add-bible-content-types | 3dcc4c0 |
| ds-2026-09-23-desktop-19-compare-default.png | desktop | 22:16:29 | feature/add-bible-content-types | 3dcc4c0 |
| ds-2026-09-23-desktop-20-compare-youtube-content.png | desktop | 22:16:49 | feature/add-bible-content-types | 3dcc4c0 |
| ds-2026-09-23-desktop-21-compare-two-users-populated.png | desktop | 22:17:07 | feature/add-bible-content-types | 3dcc4c0 |
| ds-2026-09-23-desktop-22-messages-list.png | desktop | 22:17:19 | feature/add-bible-content-types | 3dcc4c0 |
| ds-2026-09-23-desktop-23-messages-thread.png | desktop | 22:17:33 | feature/add-bible-content-types | 3dcc4c0 |
| ds-2026-09-23-desktop-24-activity-messages-widget-open.png | desktop | 22:17:45 | feature/add-bible-content-types | 3dcc4c0 |

### Notes from run 1

- **Discover titles show raw HTML entities** (`Hegel&#39;s &quot;Aesthetics&quot;`, `Art&#39;s`) in `18`. A real display bug, not a capture artifact. Not logged to `.planning/phases/bugs/BACKLOG.md` yet.
- `11` and `12` show the Clerk test user's email address - fine for local design sync, scrub before any public sharing.
- Activity `01` and `08` show the same unfiltered state; `08` also has the Add Video popover open.
- Data is shared dev data (test rows from the Bible passage validation are visible: Romans 8:28, Psalms 119/78/23, Matthew 17:21, John 3:16).
