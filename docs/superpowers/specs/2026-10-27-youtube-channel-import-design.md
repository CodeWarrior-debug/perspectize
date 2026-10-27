⚠️ Written without superpowers loaded — a superpowers-enabled session should review via writing-plans before this is executed

# YouTube Channel Import ("Import Staging Sheet") — Design

**Date:** 2026-10-27
**Branch:** `chore/youtube-channel-import-spec` (spec only; implementation gets its own `feature/` branch)
**Type:** feature
**Tracking issue:** none
**Status:** draft. Covers the preliminary staging view and the facts each row must carry. Scope, ownership and pipeline decisions are listed under **Open questions**.

## Problem

People want whole creators in Perspectize: "all of Jordan Peterson's videos", "all Grace to You sermons", "all Gaither videos". Today content arrives one URL at a time (`createContentFromYouTube`). A channel has hundreds to thousands of uploads, most of which the person does not want. They need to see everything a channel offers, decide row by row (or by filter) which videos are worth having, and import only those, without duplicating what is already in the library.

The decision is the hard part, not the import. A title alone does not tell you whether a 2-hour lecture from 2017 is worth adding. The staging view has to show the facts that answer "is this worth importing?" at a glance and the full description on demand.

## Prior work this builds on

- **"Data Import Request" idea** (session "Grace to you sermon import", 2026-09-18): "please populate all Grace to You sermons from YouTube including links to the full Grace to You pages and mapped to their locations in Holy Scripture". The survey there found the YouTube Data API is the only sanctioned source (gty.org robots.txt and Salem/OnePlace terms forbid scraping). `tools/gty-channel-survey/` already walks a channel's uploads playlist for ~106 quota units per 2,600 videos.
- **WordPress blog import job design** (`docs/superpowers/specs/2026-09-18-wordpress-blog-import-job-design.md`, committed only in a local worktree as fb18862, not yet pushed): `import_jobs` + one shared `import_job_items` staging table, fetch → stage → promote goroutines joined by channels, `excluded_from_import` review flags, ETA columns, SSRF rules. This spec reuses that skeleton and specifies the YouTube-specific columns and the staging view. Where the two disagree, the open questions say so.
- **Previews** (claude.ai artifacts, private to the owner): v1 list preview, v1 spreadsheet, and **v2 spreadsheet** (the reference for this spec). They use a 107-video sample from four real channels.

## What "preliminary" means

The staging sheet is not a primary page. It is a working surface someone opens on purpose to pick content, then leaves. It is not in the main nav, it is not the Activity table, and nothing on it is content yet: rows are candidates. Only imported rows become `content` and show up anywhere else.

## The decision row: what each candidate must show

Each fact is listed with where it comes from, because that decides cost and freshness. The YouTube Data API `videos.list` call with `part=snippet,statistics,contentDetails` returns most of them for 1 quota unit per 50 videos. That is the same call and the same trimmed `YouTubeAPIResponse` shape `GetVideoMetadata` already stores in `content.response`.

| Column | Why it helps decide | Source | Notes |
|---|---|---|---|
| **Title** + one-line summary | What it is | `snippet.title`, summary derived from `snippet.description` | Pinned left. Summary skips channel boilerplate (see below). |
| **Published** | Is it current or archival? | `snippet.publishedAt` | Date filter (before/after/between). Default sort, newest first. |
| **Length** | Clip vs lecture, and the time cost of the perspective it invites | `contentDetails.duration` (ISO 8601) | Shown h:mm:ss, filtered in seconds. |
| **Views** | Reach | `statistics.viewCount` | |
| **Likes** | Reception | `statistics.likeCount` | **Absent when the channel hides likes.** Show "hidden", never 0. |
| **Like rate** | Reception normalised for reach, so a 50K-view gem beats a 5M-view dud | derived: likes ÷ views | Not stored. `n/a` when likes are hidden; sorts last. Bar relative to the sheet's best. |
| **Comments** | Discussion, often a proxy for "people have opinions": the raw material for perspectives | `statistics.commentCount` | Absent when comments are off; show blank. |
| **Views/day** | Momentum, so new uploads aren't punished for being new | derived: views ÷ days since published | Not stored. |
| **Kind** | Video, Short or Live, which people often want to include or exclude as a group | see **Shorts** below | Pill. |
| **Source** / **Import** | Which channel and which named import it came from | staging data | Import name has its own toolbar filter. |
| **Status** | In library or not | `content.url` match on the canonical URL | In-library rows can't be selected; show Content # with a link. |

Columns in **All columns** only (bookkeeping, not decision-making): Chapters (count), Captions, Tags, Import, Source type, Imports as, Recency, Video ID, Language, Content #.

The **detail panel** (click a row, separate from the checkbox) shows full description (collapsed past ~500 characters), chapters with timestamps, tags, outbound link domains (e.g. `gty.org`), caption availability, like/comment rates and an "Open on YouTube" link. The real page should also show the thumbnail (`i.ytimg.com`, which the Activity table already loads). The artifact previews couldn't, because artifacts block external images.

### Facts that need care

- **Dislikes are not available.** YouTube made `statistics.dislikeCount` private in December 2021. Do not add a column or a placeholder for it.
- **Hidden likes.** `likeCount` is missing, not zero. Every derived value and sort must treat it as null. In the sample, 3 of 107 videos hid likes.
- **Shorts are not flagged by the API.** Two options: the channel's Shorts playlist (`UUSH` + channel ID suffix; undocumented, but stable for years) or a duration heuristic (≤ 180 s). Recommend listing the long-form (`UULF…`), Shorts (`UUSH…`) and live (`UULV…`) playlists separately and tagging rows by which list they came from, with the heuristic as a fallback when a list 404s. All three resolved for `@JordanBPeterson` on 2026-10-27. Plain `UU…` is every upload, all kinds mixed. Each playlist costs the same 1 unit per 50.
- **Chapters are not in the API.** Parse them from the description the way YouTube does: a first timestamp at `0:00`, at least three timestamps in order, each chapter at least 10 s. 49 of the 107 sample videos had chapters.
- **Captions.** `contentDetails.caption` is a `"true"`/`"false"` string meaning human captions exist; auto-captions aren't reported. Label it "Captions: yes/no", not "transcript available".
- **Category** is `snippet.categoryId`, a number. Map it with one cached `videoCategories.list` call (1 unit), or leave it out. Low decision value for single-creator channels, where it's always the same.
- **Description boilerplate.** Channels append the same promo block to every video ("To receive Grace to You's monthly letter… click here", social links, copyright). Taking the first line of the description gives you that block for most GTY videos. Better than a regex list: per source, drop description lines that appear in more than half of that source's descriptions, then take the first remaining line of more than 12 characters. If nothing is left, say "Only channel links and boilerplate", never "No description".
- **Stats are a snapshot.** Store `stats_fetched_at` per item and show "as of" in the panel. The import itself calls the existing `CreateFromYouTube`, which fetches fresh metadata, so the library never inherits stale staging numbers.

## Data needed in staging (YouTube columns on `import_job_items`)

Promote what the grid sorts and filters on, and keep the rest as the trimmed API JSON:

`video_id` (unique per job), `kind` (`video|short|live`), `title`, `published_at`, `duration_seconds`, `view_count`, `like_count` (nullable), `comment_count` (nullable), `summary` (derived once at staging), `chapter_count`, `has_captions`, `stats_fetched_at`, `response jsonb` (same trimmed shape as `content.response`: description, tags, channelTitle, categoryId), plus the shared columns from the WordPress design (`job_id`, `excluded_from_import`, `import_status`, `import_error`, `content_id`).

Like rate, comment rate, views/day and age are computed at read time, never stored, since they change with the counts and with the clock.

## Cost (YouTube Data API, 10,000 units/day default)

| Step | Call | Cost |
|---|---|---|
| List a channel | `playlistItems.list` ×3 playlists | 1 unit per 50 items |
| Decision facts | `videos.list` with 50 IDs per call | 1 unit per 50 videos |
| Import | `CreateFromYouTube` per video | 1 unit per video |

Listing and enriching all four sample channels (6,572 items) costs about 265 units. Importing 500 of them costs 500 more. Avoid `search.list` (100 units per call) for channel listing. `GetVideoMetadata` currently asks for one ID per call; the enrich step needs a batched variant that sends up to 50.

## Payload and the query budget

Thousands of rows fit in a client-side grid, but full descriptions don't belong in the list payload: they average about 1 KB each, roughly 6.5 MB for the four sample channels. The list query returns the row fields above plus `summary`. The detail panel fetches `importItem(id) { description, chapters, tags }` lazily, cached by item ID (TanStack, `staleTime` matching `stats_fetched_at`). Both need the query-count and cache-contract tests in `.docs/QUERY_BUDGET.md`.

## Staging sheet behaviour (from the v2 preview)

- **Toolbar:** Import (named import) and Source dropdowns, All / Not imported / In library switch, **Decide / All columns** column sets, a search across title + description + tags, and Clear all filters.
- **Grid:** AG Grid with the app's `GRID_THEME_PARAMS`. Every column has a floating filter (text, number, date). The checkbox column and Title are pinned. Header checkbox selects **all rows that pass the current filters**, not just the visible page.
- **Selection bar:** count, per-import breakdown, total hours, Clear selection, and an Import button that confirms on the page (no browser dialogs).
- **In-library rows** are visible by default, muted, unselectable, and carry a Content # link.
- **States the tests must cover:** empty filter result, hidden likes, missing description, boilerplate-only description, no chapters, a Short with no duration, all filtered rows already in library (header checkbox disabled), nothing selected (Import disabled).

## Not in scope

Thumbnail-based judgement (beyond showing the image), dislike counts, transcript import, Scripture mapping of sermons (the GTY idea; it needs the title parser from the Bible passage spec and the deferred `content_passage` table), scheduled re-sync of new uploads, non-YouTube sources (the WordPress design covers blogs).

## Open questions

1. **Who can create an import?** The owner said "no admin page for now" and that the end user sees their import options. Is creating an import (pasting a channel) open to any signed-in user, or are imports created out-of-band for now and users only pick from them? This decides the auth on `createImportJob` and the abuse limits in the WordPress design.
2. **Shared or per-user staging?** If two users stage the same channel, do they share one job's rows, or each get their own?
3. **Review model.** The WordPress design reviews by exclusion (`excluded_from_import`, default included). The sheet picks by inclusion (checkboxes, default none). Recommend inclusion for channels, since most of a 2,000-video channel is unwanted. Exclusion suits a blog where you want nearly everything. Keep one column with a per-job default, or two modes?
4. **Stats freshness.** Is a snapshot from listing time good enough for deciding, or should opening the sheet refresh counts older than N days? A refresh costs 1 unit per 50.
5. **Popularity ordering.** Unlike core WordPress, YouTube does give views and likes, so "import the 50 most-liked" is possible here. Offer it as a selection shortcut ("Select top N by …")?
6. **Where does the page live?** Recommend `/import/[jobId]`, linked from wherever an import is started and not in the main nav, matching "preliminary".
