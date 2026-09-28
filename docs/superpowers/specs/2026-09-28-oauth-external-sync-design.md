# OAuth External Account Sync (YouTube first) — Design

**Date:** 2026-09-28
**Status:** **optional roadmap item — unscheduled.** Brainstormed with the product owner; not committed to any milestone and no plan written yet. Pick up only when there is demand for importing existing activity from other platforms.
**Type:** feature
**Tracking issue:** none (no pre-existing issue; not manufacturing one per repo conventions)
**Execution sub-skill (when planned):** `superpowers:subagent-driven-development`
**Backlog entry:** `FEATURE_BACKLOG.md` → "OAuth External Account Sync (Optional)"

> API facts below (quota costs, scope names, Google policy windows) were captured from memory during
> brainstorming. **Re-verify each against current Google / YouTube Data API v3 docs before planning.**

## Problem

A user's reactions to content already exist elsewhere — YouTube likes, YouTube comments, Reddit
saves, Trakt ratings. Today Perspectize only knows about content a user adds by hand, so the first
session starts empty and there is no way to push a considered perspective back out to where the
content lives.

## Goals

1. A user can **connect** an external account (YouTube first) via OAuth and **disconnect** it,
   which revokes the grant and deletes any synced data from that connection.
2. A user can **import** their YouTube liked videos as `Content` + **draft, private** perspectives,
   with a preview before anything is written.
3. A user can **publish** one perspective as a YouTube comment (and optionally like the video) as an
   explicit, confirmed, per-item action.
4. Re-running a sync is **idempotent** and never destroys user-authored perspective data.
5. The provider layer is generic enough that Reddit / Spotify / Trakt / Bluesky can be added as
   adapters without changing the sync service.

## Non-goals

- Real-time sync (no provider webhook exists for likes/comments — see below).
- Automatic writes to any external platform.
- Importing a user's full YouTube comment history (no API exists for it).
- Two-way sync of free text (review ↔ comment body).
- Mapping a YouTube like onto numeric ratings (Quality/Agreement/etc.) — lossy and invented.

## Decisions (with source)

| # | Decision | Source |
|---|---|---|
| 1 | Default mode is **manual "Sync now" with a dry-run preview**; scheduled sync is an opt-in per-connection setting | owner, 2026-09-27 |
| 2 | Scheduled sync, if enabled, is **import-only** — never pushes to the provider | brainstorm, 2026-09-27 |
| 3 | Imported perspectives default to `PRIVATE` (YouTube likes are private by default) | brainstorm, 2026-09-27 |
| 4 | **Per-field ownership**; conflicts resolved by three-way diff, true conflicts queued for the user | brainstorm, 2026-09-27 |
| 5 | Tokens via **Clerk external accounts** first; own OAuth flow only for providers Clerk lacks | brainstorm, 2026-09-27 |
| 6 | Incremental scopes: `youtube.readonly` at connect, `youtube.force-ssl` only on first publish | brainstorm, 2026-09-27 |

## YouTube Data API v3 — capability constraints

| Capability | Endpoint | Approx. quota | Scope |
|---|---|---|---|
| List user's liked videos | `videos.list?myRating=like` (paged, 50/page) or `LL` playlist | ~1 unit/page | `youtube.readonly` |
| Rating of specific videos | `videos.getRating?id=…` (≤50 ids) | ~1 unit | `youtube.readonly` |
| Set rating | `videos.rate` | ~50 units | `youtube` / `force-ssl` |
| List *my* comments across YouTube | **not available** | — | — |
| Comments on one video | `commentThreads.list?videoId=` + filter by `authorChannelId` | ~1 unit/page | `force-ssl` |
| Post / edit / delete comment | `commentThreads.insert`, `comments.update`, `comments.delete` | ~50 units each | `force-ssl` |
| Change notifications | PubSubHubbub covers **channel uploads only** | — | — |

Consequences:

- **Likes** are fully readable and writable → import is cheap; two-way is technically possible.
- **Comments** are effectively **publish-only**. The only way to detect external edits is to re-fetch
  the one comment we created (by stored id). Full history import would need Google Takeout, out of scope.
- Everything is **polling**.
- The default ~10,000 units/day project quota is **shared** with the existing metadata fetches
  (`backend/internal/adapters/youtube/client.go`) and the Discover search (see backlog item
  "YouTube Search Proxy"). Writes (~50 units) are the expensive path.

### Compliance

- YouTube scopes are **sensitive**: Google OAuth app verification is required beyond test users; a
  YouTube API Services compliance audit is likely required for a quota increase.
- Must provide revoke/disconnect and delete connection-derived data within the policy window after
  revocation (verify the current window — believed to be ~7 days).
- Non-authorized API data has a max-staleness rule (believed ~30 days) — **also applies today** to
  `Content.viewCount`/`likeCount`; worth checking independently of this feature.

## Token acquisition

**Option A — Clerk external accounts (chosen for v1).** Enable Google as a Clerk social connection
with the YouTube scope as an additional scope; the user links it from a settings page ("Connect
YouTube"). The backend fetches a fresh access token on demand from Clerk's backend
OAuth-access-token API. Clerk stores and refreshes tokens → no refresh tokens in our DB.

- Con: limited to Clerk-supported providers (Google, Spotify, Reddit, GitHub… are available).
- Con: YouTube **Brand Account** channels may be owned by a different Google identity than the
  login account.

**Option B — own OAuth (PKCE) flow (fallback).** `/connect/{provider}` → callback → refresh token
encrypted at rest in `connected_accounts`. Needed for providers Clerk lacks. Adds key management
and rotation — must follow `.docs/SECURITY.md`.

## Sync directions

### 1. Import (YouTube → Perspectize) — Phase 1

- Each liked video → `ContentService.CreateFromYouTube` (existing; dedupes on URL).
- If the user has no perspective on that content → create a **draft** perspective:
  `privacy = PRIVATE`, label `imported:youtube`, `customFields.youtube.rating = "like"`, no numeric
  ratings. (Do **not** reuse `ReviewStatus` — it's `PENDING/APPROVED/REJECTED` moderation state.)
- If a perspective already exists → only create/refresh the `sync_links` row; never modify it.
- **Un-like on YouTube** → the link goes to `orphaned`; the UI shows "no longer liked on YouTube".
  The perspective is never deleted.

### 2. Publish (Perspectize → YouTube) — Phase 2

- "Post to YouTube" action on a perspective: preview comment text (from `review`/`description`),
  explicit confirm, then `commentThreads.insert`. Store the returned comment id in `sync_links`.
- Optional "also like on YouTube" checkbox → `videos.rate`.
- Later local edits surface "Update YouTube comment?" — never auto-pushed.
- On re-check, if the YouTube comment was edited or deleted externally → link state `diverged`,
  badge shown; the local perspective is never overwritten.

### 3. Two-way — Phase 3 (only if usage justifies it)

Limited to the **like flag** — the only field with the same meaning on both sides.

## Conflict resolution

YouTube exposes no modified-timestamp for ratings, so last-write-wins isn't reliable. Use a
**three-way diff against the last-synced base snapshot** stored on each link:

```
base   = link.base_snapshot   // agreed value at last successful sync
remote = provider value now
local  = Perspectize value now

remote == base && local == base  → in_sync, no-op
remote != base && local == base  → pull (if field is provider-owned)
local  != base && remote == base → push (if field is local-owned AND sync is manual)
both changed, remote == local    → advance base, no conflict
both changed, remote != local    → state = conflict → user review queue
```

Rules:

- **Field ownership:** provider owns the like flag; Perspectize owns ratings, review, description,
  feelings. A published comment is a *projection* of the perspective — Perspectize is the author.
- **Absence ≠ deletion.** A page error or `quotaExceeded` must never read as "user un-liked
  everything". Only mark links `orphaned` after a **complete, successful** listing.
- **No auto-resolution of true conflicts.** Queue offers: keep mine / take theirs / unlink.

## Manual vs. automatic

| Mode | Default | Direction | Mechanism |
|---|---|---|---|
| Sync now | ✅ on | import (+ explicit publish actions) | `previewSync` → user reviews diff → `applySync` |
| Scheduled | ❌ off, opt-in per connection | **import only** | Background ticker (same pattern as `services/retention.go`'s `RetentionSweeper`), daily; cheap at ~1 unit/50 likes |
| Real-time | ✗ not offered | — | no provider webhooks |

## Architecture (hexagonal fit)

**Domain** (`internal/core/domain/sync.go`)

- `ConnectedAccount{ID, UserID, Provider, ProviderAccountID, Scopes, Status, ScheduledImport bool, LastSyncedAt}`
- `SyncLink{ID, UserID, Provider, ResourceType (rating|comment), ExternalID, ContentID, PerspectiveID, BaseSnapshot JSON, State (in_sync|diverged|conflict|orphaned), LastSyncedAt}`
- `SyncRun{ID, AccountID, Direction, Status (preview|applied|failed), Stats JSON, Error, StartedAt, FinishedAt}`

**Port** (`internal/core/ports/services` or a new `ports/providers`)

```go
type SyncProvider interface {
    Name() string
    Capabilities() ProviderCapabilities // CanListRatings, CanSetRating, CanPublishComment, CanListOwnComments
    ListLiked(ctx context.Context, tok Token, cursor string) (items []ExternalRating, next string, err error)
    GetRatings(ctx context.Context, tok Token, externalIDs []string) (map[string]Rating, error)
    SetRating(ctx context.Context, tok Token, externalID string, r Rating) error
    PublishComment(ctx context.Context, tok Token, externalID, text string) (commentID string, err error)
    GetComment(ctx context.Context, tok Token, commentID string) (*ExternalComment, error)
}

type TokenSource interface { // Clerk-backed impl first; own-OAuth impl later
    AccessToken(ctx context.Context, userID int, provider string) (Token, error)
}
```

**Adapters:** `adapters/youtube` gains an OAuth-token client beside the API-key client;
`adapters/auth` gains a Clerk-backed `TokenSource`.

**Service:** `SyncService` — pure three-way diff + planning (`Plan(base, local, remote) → []Action`),
table-driven unit tests; apply step is transactional per item.

**Migration:** next free number at time of planning (currently would be `000028`; re-check open
branches per CLAUDE.md). Tables: `connected_accounts`, `sync_links`
(`UNIQUE(user_id, provider, resource_type, external_id)`), `sync_runs`. Requires a **manual**
`migrate up` per environment.

**GraphQL (sketch)**

```graphql
type ConnectedAccount { provider: String!, status: String!, scheduledImport: Boolean!, lastSyncedAt: String }
type SyncPreview { runId: ID!, toCreate: Int!, toOrphan: Int!, conflicts: [SyncConflict!]!, items: [SyncPreviewItem!]! }

extend type Query {
  connectedAccounts: [ConnectedAccount!]! @auth
  syncConflicts(provider: String!): [SyncConflict!]! @auth
}
extend type Mutation {
  previewSync(provider: String!): SyncPreview! @auth
  applySync(runId: ID!): SyncRun! @auth
  resolveSyncConflict(linkId: ID!, resolution: ConflictResolution!): SyncLink! @auth
  publishPerspective(perspectiveId: ID!, provider: String!, alsoLike: Boolean): SyncLink! @auth
  setScheduledImport(provider: String!, enabled: Boolean!): ConnectedAccount! @auth
  disconnectAccount(provider: String!): Boolean! @auth
}
extend type Perspective { syncLinks: [SyncLink!] }  # batched via dataloader
```

**Frontend:** Settings → "Connected accounts" (connect/disconnect, scheduled toggle); Sync preview
dialog; conflict queue; "Post to YouTube" action in the perspective editor; `imported` / `diverged`
/ `orphaned` badges on activity rows.

## Other providers (future adapters)

| Provider | Import | Publish | Notes |
|---|---|---|---|
| Reddit | saved, upvoted, **own comments** (`/user/{name}/comments`) | comments | Better comment-import story than YouTube |
| Spotify | saved tracks / episodes / shows | library save | no comments |
| Trakt | ratings, watch history | ratings | API built for two-way sync |
| Bluesky / Mastodon | likes, posts | posts | open APIs; "share perspective as post" |
| Letterboxd / Goodreads | ✗ | ✗ | no usable public API |

## Phasing (when scheduled)

1. **Phase 1 — Connect + manual import of YouTube likes** (`youtube.readonly`, preview/apply,
   disconnect + data deletion). Smallest useful slice.
2. **Phase 2 — Publish perspective as comment / like** (incremental `force-ssl` consent,
   diverged detection).
3. **Phase 3 — Opt-in scheduled import + conflict queue UI.**
4. **Phase 4 — Two-way like flag** — only if Phase 1–3 usage shows users editing on both sides.
5. **Phase 5 — Second provider** (Reddit or Trakt) to validate the `SyncProvider` abstraction.

## Prerequisites / risks

- Google OAuth verification + YouTube compliance audit lead time (weeks) — start before Phase 1 ships
  beyond test users.
- Shared YouTube quota — land the "YouTube Search Proxy" backlog item and/or a quota increase first.
- Clerk external-account scope handling and Brand Account behavior need a spike.
- Privacy: imported data defaults private; publish is always explicit.

## Open questions

1. Should an imported like pre-fill anything beyond a label (e.g. a default "liked" feeling)?
2. Delete imported *draft* perspectives on disconnect, or keep them as user data? (Policy may
   require deleting provider-derived fields at minimum.)
3. Is publishing a premium-tier feature?
4. Which second provider validates the abstraction best — Reddit (comments) or Trakt (ratings)?
