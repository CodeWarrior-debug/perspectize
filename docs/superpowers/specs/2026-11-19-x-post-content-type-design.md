# X post content type (`X_POST`) — Design

**Status:** draft for owner review, 2026-11-19. No plan yet. **Not legal advice**: §6 summarises public sources so the owner knows what to ask.

**Claim markers** (same as the [Facebook spec](2026-10-19-facebook-video-content-type-design.md)): **[V]** read in a primary source, **[P]** partly verified (secondary source or search snippet), **[U]** uncertain or inferred. Re-check every [P]/[U] before building. X changes its terms often.

## 1. Intent

Let someone paste an X post link, see it in the Activity table, read it inline, and write perspectives on it, as they do with a YouTube video. A **reply** is also an X post, so it can be added and written about on its own, and it can be filed under the post it answers.

**Why:** the owner wants posts, and "maybe" their replies, in the library as a content type of their own (not an embed inside a perspective). The reason someone would add one (what they capture from it) was answered only as "post and maybe replies"; treat anything beyond that as open (§9).

### Goals
- A new `X_POST` content type that works end to end like the other types (add, table row, details, filter, perspectives).
- Replies as their own items, linked to the post they answer, so a perspective can be written on a single reply.
- Free to run: no X account, key or bill in v1.
- Stay inside X's embed terms: show the post through X's own embed, never re-host its text or media.

### Non-goals (v1)
- Fetching or storing post text, media, counts or author profile data from X.
- Threads: adding every post of a thread in one action, or reading a thread's structure.
- Bulk-importing a post's replies.
- Discover (search or feed) for X.
- Following or syncing an account, or refreshing anything.

### Anti-goals (a failure even if it technically works)
- Copying X content into our database or serving it from our servers, which breaks the embed-only licence.
- Showing a "0" where a figure is simply unknown (counts, dates).
- A design that needs a rewrite to add the paid API later.

## 2. Source terms (Decision 9)

| Question | Finding |
|---|---|
| Keyless metadata | **oEmbed** on `publish.x.com` returns embed HTML in a "rich" oEmbed object, with no height, and honours `omit_script=true` [V]. I did not find a complete field list or a title/thumbnail field [P]. |
| May we store it? | The [X Developer Agreement](https://docs.x.com/developer-terms/agreement) (updated 2026-04-27) grants a *limited, revocable, non-transferable* licence to **display** X Content through embedded posts, subject to the Developer Policy, Restricted Use Rules, and **Display Requirements** [V]. The CMS guidance says to cache returned HTML only for the response's `cache_age` [V]. **I did not read the Display Requirements text, so what we may keep beyond that cache is unconfirmed [U].** |
| Paid API | Pay-per-use only since 2026-02-06 [V via X's [pricing page](https://docs.x.com/x-api/getting-started/pricing), read 2026-11-19; no date on the page]: post read $0.005 per post returned, user read $0.010, 3M post reads per month cap, no free tier, $20 one-time credit. Reply search billing is not stated [U]. Paying does not widen what we may store. |
| Scraping | Not allowed, for the same reasons as Facebook [P]. |
| Embedding licence | The 2nd Circuit's *Richardson v. Townsquare Media* (2026-04-23) revived claims over an embedded **X** video, because X, unlike YouTube, is not shown to license embedding [V via the Facebook spec's summary]. More risk than YouTube; mitigations in §6. |

**Decision: v1 stores nothing from X.** No backend call to X, no API key, no env var.

## 3. Approaches considered

- **A. Embed only, no X account.** Free and clearly inside the terms, but a thin table row: no counts, text search or popularity sort.
- **B. Paid X API.** Rich rows (text, date, counts) and bulk reply import, at about $0.005 per post, plus a developer account, a secret key and a spending limit. X's storage terms still apply, and they are unconfirmed.
- **C. A now, shaped for B later (chosen by the owner).** An `X_POST` type whose source data is derived from the URL alone, behind a small port so a paid-API implementation can replace it without touching the table, forms or links.

Replies modelled three ways: a blob of replies stored on the post (rejected: can't write a perspective on one reply, and it stores X text); a separate item per reply linked by `parent_content_id` (**chosen**); no replies at all (rejected: the owner wants them).

## 4. Identity and ingestion

- **Enum:** `X_POST` (Go constant, GraphQL enum, DB value `x_post` via the existing lowercase mapper). `content_type` has no CHECK constraint, so the enum needs **no migration**.
- **Identity:** the numeric post id.
- **Accepted shapes** (hosts `x.com`, `twitter.com`, `www.`, `mobile.`, all normalised):

  | Pasted | Handling |
  |---|---|
  | `x.com/<handle>/status/<id>` (extra `/photo/1`, `/video/1`, query noise such as `?s=20&t=…`) | accepted |
  | `x.com/i/web/status/<id>`, `x.com/i/status/<id>` | accepted (no handle) |
  | `t.co/<code>` | rejected with a hint to open the link and copy the address-bar URL (resolving needs a server-side request) |
  | profile, list, community, space, article URLs | rejected: not a post |
- **Canonical URL** (the dedupe key; the global `UNIQUE(url)` is kept): `https://x.com/i/status/<id>`, regenerated from the id and never stored as pasted. A handle in the pasted URL is cosmetic: X resolves by id, and handles change [P]. Verify in a browser that this form embeds (§9).
- **Mutation:** `createContentFromXPost(input: { url: String!, note: String, replyToUrl: String })`.
  - `note` is optional text the adder types (what they want the item called). It is **user content**, moderated like a perspective.
  - `replyToUrl` is optional; see §5.
- **`response` JSONB:** `{ "postId": "…", "handleAtAdd": "…"|null, "postedAt": "<ISO>", "note": "…"|null, "source": "url" }`. `handleAtAdd` is the handle in the pasted URL, kept as a label only. `source: "url"` marks that nothing came from X, so a later API implementation can mark rows it enriched.
- **Posted date:** X ids are time-ordered ("snowflake"): milliseconds since 2010-11-04T01:42:54.657Z are `id >> 22` [P]. We derive `postedAt` from the id, which needs no X request. Verify the formula against 3 known posts before relying on it; if it fails, the field is null and the column shows blank (§9).
- **Display name (Item column):** `note` if set, else `Post by @handle`, else `X post <id>`.
- **Length:** null. **`UpdateSourceData` / refresh:** `ErrInvalidInput` "X posts have no source data to refresh", hidden in the UI.
- **Dedupe:** `GetOrCreateByURL(…, refreshOnConflict=false)`, so a second paste never overwrites the first adder's note. The original adder (and admins) may edit the note.
- **Parsing:** a pure Go package `backend/internal/adapters/xpost/` (`ExtractPostID`, `NormalizeURL`, `PostedAtFromID`) mirrored in `frontend/src/lib/utils/xpost.ts`, plus a `XPostSource` port in `core/ports/services` whose v1 implementation only does URL parsing, so a paid-API implementation can later fill `response` without changes elsewhere.

## 5. Replies

A reply is an `X_POST` item whose `parent_content_id` points at the post it answers.

| Rule | Value |
|---|---|
| Link column | `content.parent_content_id`, nullable FK to `content(id)`, `ON DELETE RESTRICT`, indexed. This is the column the [TMDB hierarchy design](2026-09-27-tmdb-content-types-design.md) §3 and the [web page design](2026-11-12-web-page-website-and-blog-import-design.md) §2 specify. **It does not exist in the backend yet** (grep of `backend/`, 2026-11-19). Whichever PR lands first creates it with that exact definition. |
| Who may be a parent | Only an `X_POST`, and only of an `X_POST`. Both of those other designs restrict parents to their own types; each type's rule lives in the service. |
| Depth | Any: a reply to a reply is allowed. A parent must exist before its child and an existing item is never re-parented, so cycles can't form. |
| No force-add | Adding a reply never adds its parent post, and a reply with no parent is normal. (The glossary's "adding a child adds each missing ancestor" is for seasons and episodes; the web page design set the opposite for pages, and this follows it. **My call.**) |
| No rollup | A post's perspectives are only those written on the post itself, never on its replies ([glossary](../../glossary/content-types/GLOSSARY.md)). |
| How a reply gets a parent | (1) Add dialog: optional "In reply to" field taking a post link; the service finds or creates that parent. (2) "Add a reply" on a post's details view opens the Add dialog with the parent filled in. Never automatic, and never from X (a reply link does not reveal its parent). |

The parent's details view lists its replies in the library (newest first, capped at 50 with a count), and a reply's details view shows "In reply to @handle". A future paid-API adapter could add a "fetch replies" action; that is not v1.

## 6. Display, privacy and liability

- **Player:** X's own embed, loaded only on a click, for every visitor. The facade says "Plays on X. Loading the post lets X set cookies and see that you viewed it." with a **Load post** button, and an optional "Always load X posts" in `localStorage` (try/catch wrapped). Use the same pattern as `frontend/src/lib/components/discover/VideoCard.svelte`.
- **How to embed:** an iframe if X documents one that works, otherwise the widget script injected on click with `omit_script` handled by us. Which of the two is permitted and stable is the builder's check (§9). Never load X's script at page load.
- **CSP:** add only the hosts the chosen embed needs (likely `platform.twitter.com` and `syndication.twitter.com` in `frame-src`, and possibly `script-src`/`img-src`) [U]. Record the final list in the plan.
- **Kill switch:** frontend env flag `PUBLIC_X_EMBED_ENABLED` (default true). False makes every X item link-out only, with no backend change.
- **Never** host, proxy, screenshot or frame-grab a post or its media.
- **Brand:** a generic icon with a text label "X post". Don't use the X logo unless it is taken from X's brand pack with its rules [U].
- **Public launch prerequisites** (gate launch, not the build): the DMCA agent, terms of service, privacy policy and report flow listed in the [Facebook spec](2026-10-19-facebook-video-content-type-design.md) §6.2, which also cover this type's user-written notes. Joint-controller reasoning for social plugins (*Fashion ID*) applies to the embed the same way.

## 7. Grid, details and the five decision questions (Decision 8)

| Question | X post |
|---|---|
| What is it? | `note`, else `Post by @handle`. The post text appears only in the embed, on click. |
| How big? | Nothing to show: no length, so the column is blank. |
| How current? | `postedAt`, derived from the id (§4); blank if unavailable. |
| How well received? | **Not available.** Counts live only in the embed. Say so once in the details view, not as an empty column. |
| What's in it? | The embed itself, on click. |

- **Default columns:** type icon · **Item** · **Author** (`@handle`, blank for `/i/status/` links) · **Posted** · **Date Added** · **Tags**. No thumbnail. The Author header tooltip says the handle is read from the link and can be out of date.
- **Not shown:** views, likes, replies count, duration. In mixed-type views those cells use the existing empty marker (missing is not zero).
- **Details view:** note, author, posted date, "added by", the click-to-load player, "Open on X ↗" and "Report this item", plus the Replies section (§5). Never cover or overlay the embed.
- **Unavailable posts:** deleted or protected posts show X's own message inside the embed, which we can't detect cross-origin. Keep the link-out and report action visible so the item isn't a dead end.
- **Discover (Decision 7): not on Discover.** X has no free search or feed, and the type is pasted, not browsed, so Add Content covers it. Autodetect recognises the §4 shapes.
- **Import preview:** none in v1 (no bulk import).

## 8. Change list (for the plan)

| Layer | Change | Suggested subagent |
|---|---|---|
| Domain | `ContentTypeXPost = "X_POST"` | `go-backend` |
| Adapter | `adapters/xpost/` parser (id, normalise, snowflake date) with table tests over every shape in §4; `XPostSource` port | `go-backend` (tests: `test-writer`) |
| Migration | `parent_content_id` column **only if no other PR has landed it**; written and reviewed, never applied here | `db-migration` |
| Schema | enum value, `CreateContentFromXPostInput`, mutation, `ContentFilter.parentContentID` if not present | `graphql-designer` |
| Service | `CreateFromXPost` (validate, canonicalise, dedupe, parent rule, find-or-create parent); `UpdateSourceData` rejects the type; adder-only note edit | `go-backend` |
| Query budget | query-count test for create (dedupe hit/miss, with and without parent) per `.docs/QUERY_BUDGET.md` | `test-writer` |
| Frontend | `utils/xpost.ts`; `detectContentType.ts` branch; Add dialog fields (note, "In reply to"); type icon and Item tile in `formatting.ts`; Author and Posted `COLUMNS`; `XPostPlayer.svelte` with facade and kill switch; details Replies section and "Add a reply"; CSP | `svelte-frontend` (tests: `vitest-writer`) |
| Designer tool | add an `xPost` profile to `tools/content-type-designer/src/catalog.ts` and rebuild `dist/` | — |
| Specs | label the spec PR and every implementation PR `new-content-type` | — |

**Tests:** parser table tests (every shape, `twitter.com`/`mobile.` hosts, `/photo/1`, `?s=20`, `t.co` rejection, non-post URLs); `PostedAtFromID` against known ids; service success, duplicate (note not overwritten), bad URL, parent not an `X_POST`, parent missing; resolver mutation; frontend detection, validator, facade states (gated, loaded, remembered, kill-switch link-out), Item tile with and without a note, empty markers in mixed views.

**Release:** ship dark (backend first, UI behind the kill switch or to signed-in testers) per [RELEASE_APPROACHES.md](../../.docs/RELEASE_APPROACHES.md) until §6's launch prerequisites exist.

## 9. Left to the builder, and to verify before building

**Verify first (one hour, local browser):**
1. Does `https://x.com/i/status/<id>` embed correctly, and is it a form X accepts (versus `x.com/<handle>/status/<id>`)?
2. Which embed mechanism X permits for third parties (iframe or widget script), its CSP hosts, and what it shows for a deleted or protected post.
3. Read X's **Display Requirements** and note what, if anything, we may store beyond the cache. This decides whether `note` and the derived `postedAt` are safe, and whether a future paid adapter may store text.
4. Check the snowflake formula against three known posts.

**Left to the builder:** the exact icon, the facade copy, field names inside `response`, whether the parent find-or-create is one transaction or two calls, and the position of the Replies section in the details view.

**Open for the owner:** (a) what a person is trying to capture beyond "post and maybe replies"; (b) whether to ask for a user-typed `note` at all, or leave it to the URL-derived label; (c) whether replies being separate items is enough, or the library should also show the post's own live reply count (only possible with the paid API).
