# Facebook video / Reel content type (`FACEBOOK_VIDEO`) — Design

⚠️ Written without superpowers loaded — a superpowers-enabled session should review via writing-plans before this is executed.

**Status:** **Deferred** by [ADR 0001](../../adr/0001-defer-facebook-video-content-type.md) (2026-10-22): storing metadata needs a Meta review we probably wouldn't pass. Read the ADR's revisit conditions before picking this up. **Date:** 2026-10-19. No plan file yet. The **Decisions to confirm** at the end need an owner answer before `writing-plans`.

**Not legal advice.** The compliance and liability sections summarise public sources so the owner knows what to ask. Have counsel review §6 before public launch.

## Goal

Users paste a public Facebook video or Reel link, the item appears in the Activity table, plays inline, and collects perspectives, the same as a YouTube video. The research says this type **cannot copy the YouTube model**. Meta gives a third party no lawful way to fetch and store a title, thumbnail, duration or view count for an arbitrary public video. So the design is "embed plus user-entered fields", not "API plus a stored payload".

## How sure each claim is

Research ran on 2026-10-19 (web sources plus live tokenless calls). Each claim is marked **[V]** verified in a primary source or by a live test, **[P]** partly verified (a secondary source, or a search snippet of a Meta page that has since moved), or **[U]** uncertain or inferred. Re-check every [P]/[U] claim before building. Meta changes these rules often: oEmbed alone changed in 2020, 2025 and 2026.

## 1. What makes Facebook different from YouTube

| Concern | YouTube (shipped) | Facebook |
|---|---|---|
| Metadata API | Data API v3 `videos.list` with an API key. Title, channel, duration, stats, thumbnail. | **None usable.** See §2. |
| Thumbnail | `i.ytimg.com`, stable and hotlinkable | oEmbed `thumbnail_url` **removed 2025-11-03** [V]. fbcdn URLs are signed and expire. Building our own thumbnail from a screenshot or frame is a copyright risk (*Richardson*, §6.1). **No thumbnail.** |
| Embed | `youtube-nocookie.com` iframe (privacy-enhanced) | `facebook.com/plugins/video.php` iframe. There is **no no-cookie variant**, so the player behaves like a social plugin (§6.3). |
| Licence to embed | YouTube ToS gives other users a direct licence to embed. The 2nd Cir. leaned on that in *Richardson* (2026). | Meta said in 2020 that it does **not** sublicense embeds [P]. That gives less cover (§6.1). |
| Content can vanish | Rarely (deleted or private) | Often: the audience changes from Public, Rights Manager mutes by region, the page is deleted. The embed then shows "no longer available" [V]. |
| Discover feed / search | Trending through the backend, search handed off | No public search API, no popularity data, and scraping is banned. **Not on Discover** (§5). |
| Formats | Watch, Shorts | Since Sept 2025 **every Facebook video is published as a Reel** [V]. Video and Reel are one object with one numeric id [P]. |

## 2. Metadata: the three doors, all closed

1. **oEmbed** (`graph.facebook.com/v25.0/oembed_video`):
   - Tokenless since 2026-06-15 for public content, 1,000 requests per hour per endpoint [V].
   - Returns only `html, width, height, type, version, provider_*`. No title, author, thumbnail or duration [V].
   - The `html` has a `<blockquote>` fallback with the title and author, but Meta restricts oEmbed data to **"front-end views"**. Extracting or storing it is prohibited [P] (feature reference [V] says front-end views only).
   - It also returns HTTP 200 for made-up URLs [V], so it can't validate a link either.
   - **Decision: the backend does not call oEmbed.**
2. **Graph API `/{video-id}`**: videos on Pages we don't manage need **Page Public Content Access**, which means App Review plus business verification [V]. Field coverage for arbitrary videos is unclear [U], and personal-profile videos are unreachable [P]. Not worth it for v1. Revisit only if the product later wants Page-level analytics.
3. **Scraping `og:` tags**: Meta's Automated Data Collection Terms require Meta's express written permission, and `robots.txt` is `Disallow: /` for `*` [V]. **Not allowed.**

**So the stored payload is user-entered.** The submitter types the title and, optionally, the creator or Page name. Perspectize treats these as **user content**, moderated like a perspective, not as source data.

**Side effect, which is a good one:** Perspectize stores no Meta Platform Data and registers no Meta app. The app-level Platform Terms duties (privacy-policy URL in the App Dashboard, data-deletion callback, annual Data Use Checkup) attach to a registered app [U, inference]. Using the embed still binds us to the embed terms and the Developer Policies on how plugins are shown (§6.4).

## 3. Identity and ingestion

- **Enum:** `FACEBOOK_VIDEO` (Go constant, GraphQL enum, DB value `facebook_video` through the existing lowercase mapper). `content_type` has no CHECK constraint (`000001`, `000028`), so **no migration is needed**.
- **Identity:** the numeric video id.
- **Canonical URL** (the dedupe key, global `UNIQUE(url)` kept): `https://www.facebook.com/watch/?v=<id>`. It is regenerated from the id and never stored as pasted. Verify once in the browser that this form embeds both a Reel and a landscape video (§9 Q2). If it doesn't, fall back to Meta's documented `video.php?v=<id>` form [V].
- **Accepted shapes** (with `www.` / `m.` / `web.` normalised to `www.`):

  | Pasted | Handling |
  |---|---|
  | `facebook.com/reel/<id>` | id; `format = reel` |
  | `facebook.com/watch/?v=<id>`, `/watch?v=<id>` | id; `format = video` |
  | `facebook.com/<page>/videos/<id>[/]`, `/<page>/videos/<slug>/<id>` | id; `format = video` |
  | `facebook.com/video.php?v=<id>` | id; `format = video` |
  | `facebook.com/share/v/<token>`, `/share/r/<token>`, `fb.watch/<code>` | **Rejected in v1** with a hint: "Open the link, then copy the address-bar URL". The token is opaque. Resolving it means an automated request to a path `robots.txt` disallows for every agent, and `fb.watch` returned a login-wall redirect to a server [V]. See §9 Q3. |
  | Group, post and permalink URLs | Rejected. These are `oembed_post`, usually not public, and out of scope. |
  | `instagram.com/reel/…` | Not this type. Instagram is a separate future type (separate id, owner can disable embeds) [P]. |

- **`format`** (`reel` | `video`) comes from the URL path only. It is a hint for player aspect ratio and the badge, not a fact about the media. The 2025 merge makes "is it a Reel?" mostly a question of how the link was shared.
- **Mutation:** `createContentFromFacebookVideo(input: { url: String!, title: String!, creatorName: String })`. The title is required: there is no other source for the Item column.
- **`response` JSONB:** `{ "videoId": "…", "format": "reel"|"video", "title": "…", "creatorName": "…"|null, "titleSource": "user" }`. Name it `submitted`, not `response`, if the planner prefers to keep `response` meaning "raw API payload". It would be the first type with no payload.
- **Length:** null. No duration source exists, so `length`, `length_units` and `length_display` stay NULL.
- **`UpdateSourceData` / refresh:** returns `ErrInvalidInput` "Facebook videos have no source metadata to refresh". The refresh action is hidden for this type in the UI.
- **Editing the title:** the original submitter (and admins) can edit `title` / `creatorName`. Other users who paste the same video get the existing item, as dedupe does today. They can't overwrite it.
- **No adapter port, no API key, no env var.** URL parsing is a pure package: `backend/internal/adapters/facebook/parser.go` (`ExtractVideoID`, `NormalizeURL`, `DetectFormat`), mirrored in `frontend/src/lib/utils/facebook.ts`.

## 4. Grid and details

**Default columns (Facebook solo):** ◎ · **Item** · **Creator** · **Format** · **Date Added** · **Tags**

- **Item:** the user title over a neutral tile with the type icon and a small `Reel` badge when `format = reel`. **No thumbnail image** (see §1). Click opens the details modal. A secondary link opens facebook.com in a new tab. The header tooltip says "Title entered by whoever added it. Facebook doesn't share titles with other apps."
- **Creator:** `creatorName`, with "—" when it's empty. The tooltip says it is user-entered.
- **Format:** Reel / Video, filterable (set filter, two values).
- **Type icon:** a generic play-in-square in Facebook blue `#0866FF`, with a text label "Facebook". Don't use the official "f" mark unless it comes from the Meta Brand Resource Center pack with its clear-space rules [V]. A text label is the low-risk path [U].
- **Not shown:** Duration, Views, Likes, Published. There's no lawful source for them, so in mixed-type views those cells render the existing empty marker.
- **Details modal:**
  - Title, creator, format and "added by", then the **player** (§6.3 gate). Size it 9:16 for Reels and 16:9 for videos with CSS `aspect-ratio`, because oEmbed gives width only [V].
  - Below the player: "Open on Facebook ↗" and "Report this item".
  - Never overlay or cover the player (Developer Policies on social plugins [V]).
  - Unavailable state: Meta's iframe shows its own "no longer available" message, which we can't detect cross-origin. Keep the link-out and the report action visible so the item doesn't become a dead end.

## 5. Discover page (Decision 7)

**Not on Discover.** This type is *pasted*, not *browsed*:

- There is no public search API. Handing search off to facebook.com needs a login, which makes it a poor experience.
- There is no popularity data we may fetch, and scraping is banned (§2).
- The Add Content box covers it. Autodetect recognises the URL shapes in §3 and shows the title field.

## 6. Compliance and liability

### 6.1 Copyright: embed, never re-host

- **9th Cir.:** under the server test (*Perfect 10*, reaffirmed in *Hunley v. Instagram*, 2023) an embedder doesn't "display" the work [V].
- **S.D.N.Y.:** rejected the server test (*Goldman v. Breitbart* 2018, *Nicklen v. Sinclair* 2021, *McGucken v. Newsweek* 2022) [V]. SCOTUS denied cert in *McGucken v. Valnet* (2025) [V].
- **2nd Cir.:** *Richardson v. Townsquare Media* (2026-04-23) declined to adopt the server test. It revived claims over an embedded X video, upheld a YouTube embed because YouTube's ToS licenses embedding, and found screenshots not de minimis [V via Proskauer summary].
- **What this means for us:** Facebook embeds carry more risk than YouTube embeds, because Meta grants no embed sublicence [P]. Perspectize mitigates with three rules:
  - It **never hosts, proxies, screenshots or frame-grabs** the video.
  - It loads the player only on a user's click.
  - It takes items down quickly (§6.2).
- **Kill switch (cheap insurance):** the frontend env flag `PUBLIC_FACEBOOK_EMBED_ENABLED` (default true). Set false, every Facebook item becomes link-out only, with no redeploy of the backend and no data change.

### 6.2 User content: titles, creator names, perspectives

The title and creator are now **user-written text about real people's media**, alongside perspectives. That makes the platform's general obligations apply more directly. Today the repo has **no privacy policy, terms of service, DMCA or report page** (grep of `frontend/src` and `.docs`, 2026-10-19). Those gaps already exist for YouTube and claims; this type sharpens them. Prerequisites for **public launch** (not for building):

1. **DMCA §512 safe harbor:**
   - Register a designated agent with the US Copyright Office ($6, renew every 3 years, a lapse loses the safe harbor [P]).
   - Publish the agent contact.
   - Adopt a takedown, counter-notice and repeat-infringer policy.
2. **Report flow:** a "Report this item" action on content and perspectives (copyright, privacy, harassment, illegal content). It doubles as the **EU DSA Art. 16 notice-and-action** mechanism, with Art. 17 statements of reason when we act. Micro and small platforms are exempt from Arts. 20–28 but not from Art. 16/17 [P]. Arts. 11–15 (point of contact, T&Cs) apply too [U].
3. **Terms of Service:**
   - Users must not post defamatory titles or perspectives, or private information about people who appear in videos, especially minors.
   - Users grant the licence we need for their text.
4. **Section 230** covers user-written titles and perspectives today. Sunset bills are pending (H.R. 6746 would sunset it 2026-12-31; none passed) [P]. Re-check before launch, since defamation exposure for user-entered titles depends on it.
5. **Meta Platform Terms §3.a.iii (no surveillance):** don't build features that profile the people in the videos. Today nothing does; keep it that way [V for the clause].

### 6.3 Privacy: the player is a Meta social plugin

- *Fashion ID* (CJEU C-40/17, 2019): a site embedding a Facebook plugin is a **joint controller** with Meta for collecting and transmitting visitor data, and must obtain consent where it's needed before the plugin loads [V]. EDPB Guidelines 2/2023 read ePrivacy Art. 5(3) to cover third-party requests that trigger tracking [V].
- **Decision: click-to-load for everyone, not just EU visitors.** Geo-detection is unreliable and the facade pattern already exists (`frontend/src/lib/components/discover/VideoCard.svelte` mounts its iframe only on click).
  - The facade reads "Plays on Facebook. Loading the player lets Meta set cookies and see that you watched." with a **Load player** button.
  - Optional "Always load Facebook players" stored in `localStorage` (per-viewer convenience, try/catch wrapped).
- **Iframe, not the JS SDK:** use `https://www.facebook.com/plugins/video.php?href=<canonical>&show_text=false` in an `<iframe>`. It is frameable [V] and keeps Meta's JS out of our origin. Never load `connect.facebook.net/…/sdk.js`.
- **CSP** (`frontend/src/app.html`): add `https://www.facebook.com` to `frame-src` only. Nothing in `script-src`, `connect-src` or `img-src`.
- **Privacy policy text** (once it exists): name Meta as joint controller for the embedded player, explain the click-to-load gate, and link Meta's data policy.

### 6.4 Meta terms that still apply without an app

- **Embed terms and Developer Policies:**
  - Don't obscure the plugin.
  - Don't imply Meta endorsement.
  - Follow Meta's brand rules if the logo is used [V].
- **No storage of Meta data** (§2) means no deletion sweep. User-entered text is ours and follows our own deletion policy.

## 7. Reel-specific details

- **9:16 player:** size the container in CSS, because oEmbed gives no height [V].
- **Licensed music** may be muted or regionally blocked by Meta Rights Manager [P]. No source confirms whether embeds are muted off-platform [U]. Test with a real music Reel (§9 Q5). We can't detect it anyway; nothing to build.
- **Cross-posted Instagram Reels** have a different id and URL [P]. They stay a separate (future) type; no cross-linking in v1.

## 8. Change list (for the plan)

| Layer | Change | Suggested subagent |
|---|---|---|
| Domain | `ContentTypeFacebookVideo = "FACEBOOK_VIDEO"` | `go-backend` |
| Adapter | `adapters/facebook/parser.go`: id extraction, normalisation, format, rejection reasons for share/fb.watch/post URLs. Table tests over every shape in §3. | `go-backend` (tests: `test-writer`) |
| Schema | enum value, `CreateContentFromFacebookVideoInput`, mutation; title edit through the existing content-update path or a small `updateFacebookVideoDetails` | `graphql-designer` |
| Service | `CreateFromFacebookVideo` (validate, canonicalise, dedupe through `GetOrCreateByURL(…, refreshOnConflict=false)` so a second paste never overwrites the title, build `Content` with `Name = title`); `UpdateSourceData` rejects the type; submitter-only title edit | `go-backend` |
| Repo | none (no sortable JSONB fields beyond `name`; format filter through `response->>'format'` if server-side filtering is wanted) | — |
| Query budget | query-count test for create (dedupe hit and miss) per `.docs/QUERY_BUDGET.md` | `test-writer` |
| Frontend | `utils/facebook.ts` validator; `detectContentType.ts` branch (before the generic URL fallthrough); Add Content shows Title (required) + Creator (optional) for this type; type icon and Item tile in `formatting.ts` / `activityItemCellRenderer.ts`; Creator and Format `COLUMNS` entries in `grid-config.ts`; details-modal `FacebookPlayer.svelte` with click-to-load facade and kill-switch flag; CSP `frame-src` | `svelte-frontend` (tests: `vitest-writer`) |
| Designer tool | add a `facebookVideo` profile to `tools/content-type-designer/src/catalog.ts` (rebuild `dist/` with `npx tsc -p tsconfig.json`) | — |
| Legal (owner, not code) | DMCA agent, ToS, privacy policy, report flow (§6.2). Track separately; they gate launch, not the build. | — |

**Tests:**
- Parser table tests (every accepted and rejected shape, `m.`/`web.` normalisation, trailing slashes, query noise such as `?mibextid=`, `&rdid=`).
- Service: success, duplicate (title not overwritten), empty or over-long title, rejected share link.
- Resolver mutation.
- Frontend: detection, validator, the facade states (gated → loaded → remembered → kill-switch link-out), the Item tile with and without the Reel badge, and the empty marker in Duration/Views for mixed views.

## 9. Decisions to confirm

1. **No metadata fetch at all** (user-entered title and creator, no thumbnail). The alternative is Page Public Content Access (App Review plus business verification) for partial metadata on Page videos only. Recommendation: no fetch.
2. **Canonical URL form** `watch/?v=<id>`, if it embeds both Reels and videos (one browser check). Otherwise `video.php?v=<id>`.
3. **Reject `share/…` and `fb.watch` links** in v1 rather than resolving them server-side (robots.txt disallows `/share/`; `fb.watch` hits a login wall from servers). Alternative: one redirect-off HEAD request per user paste, accepting the robots.txt tension.
4. **Click-to-load for every visitor**, with an opt-in "always load".
5. **Run a real-Reel spike before planning (one hour, local browser):**
   - A music Reel: does it play or is it muted?
   - A Reel whose audience later changes to Friends: what does the embed show?
   - Is `/reel/<id>` the same id as `/watch/?v=<id>`?
6. **One type for video and Reel** with a `format` hint, rather than two types.
7. **Legal prerequisites gate public launch, not the build.** Ship behind the kill switch, or only to signed-in testers, until §6.2 items 1–3 exist.
