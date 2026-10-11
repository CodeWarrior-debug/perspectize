# Multiple Perspectives per Content (Public + Private Slots) — Design

**Date:** 2026-09-29
**Type:** feature (design only)
**Status:** optional roadmap item — unscheduled. Not a superpowers plan; no execution sub-skill yet.
**Tracking issue:** none (not manufacturing one per repo conventions)

> ⚠️ Written without superpowers loaded — a superpowers-enabled session should review via writing-plans before this is executed.

> ## 🚨 READ FIRST — two gates before any implementation
>
> **Gate 1 — Do this AFTER the sharing model is nailed down.**
> The slot model below (one public + one private perspective per user per content)
> is only correct if the sharing model settles on **exactly two visibility levels**.
> [2026-09-09-perspective-privacy-design.md](2026-09-09-perspective-privacy-design.md)
> explicitly rules out `UNLISTED` / `SHARED` states and defers the public
> activity-browsing UI and share/copy-link. If the sharing model grows a third level
> (unlisted, friends-only, shared-with-user), the unique-index shape, the slot names
> and the aggregate rule all change. **Do not write the migration until the sharing
> model is decided.**
>
> **Gate 2 — Double counting must be checked and resolved BEFORE a second
> perspective row can exist.** Today **every** aggregate assumes one perspective per
> user per content, and several *break silently* the moment a user has two. See
> [Double-counting audit](#double-counting-audit-must-do). The audit findings are
> the blocking part of this design; the unique index is the easy part.

## Problem

Nothing in the backend stops a user having several perspectives on one content
entry: the only uniqueness constraint ever placed on `perspectives`
(`UNIQUE(claim, user_id)`, migration 000004) was dropped with the `claim` column in
000007, and `PerspectiveService.Create` does no existing-row lookup. No UI creates a
second one today, but the API allows it.

Users will want a **public aspect** (what they share) and a **private aspect** (what
they keep to themselves) on the same content. That already fits the data model
(`privacy` is `NOT NULL CHECK IN ('public','private')` since migration 000018) but
not the product: nothing bounds how many rows exist, aggregates would double-count
the user, and no UI distinguishes the two.

## Goals

1. A user can have **at most one public and one private perspective per content**.
2. Aggregates (`perspectiveCount`, `averageRating`, feeling/custom-field stats) count
   **each user at most once per content**.
3. UI entry and display points that make the two slots obvious without a new
   concept for users to learn.

## Non-goals

- No third visibility level (see Gate 1).
- No per-field privacy inside a single perspective row (rejected below).
- No per-perspective aggregate opt-out (`excludeFromAggregates` in FEATURE_BACKLOG.md
  "Perspective aggregates") — related but separate; see interaction note in the
  audit.

## Proposed model: slots, not a parent/child split

**One perspective per `(user_id, content_id, privacy)`**, enforced by a partial
unique index:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS perspectives_one_per_user_content_privacy
  ON public.perspectives (user_id, content_id, privacy)
  WHERE content_id IS NOT NULL;
```

`content_id` is nullable, so the partial predicate keeps content-less perspectives
out of the constraint. Two rows per user/content max, and they are naturally the
public one and the private one.

**Alternatives considered**

| Option | Verdict |
|---|---|
| Slots by `(user, content, privacy)` (this doc) | Recommended. No new tables; reuses the shipped `privacy` field and its read-authorization rules unchanged. |
| Parent perspective + child "facets/panes" | More flexible, but adds a table and reintroduces "which rating counts?". Revisit only if the sharing model needs more than two layers; then loosen the index to `(user_id, content_id, layer)`. |
| One row, per-field privacy | Rewrites the read-authorization spec (privacy is row-level everywhere), every filter and the aggregates. Rejected. |

## Naming (UI copy only; data model keeps `privacy`)

- Umbrella: **Perspective**.
- Public slot: **Public take** (or plain "Perspective").
- Private slot: **Private notes**.
- "Facets" / "panes" are fine as internal words for the two-up layout, not as data
  terms. Names are a product decision — confirm before building.

## Double-counting audit (MUST DO)

The privacy spec and FEATURE_BACKLOG.md confirm (2026-09-13) that aggregates
deliberately count **public and private alike** so a user's own private perspective
is reflected in the count. With slots, that same rule would count one user **twice**.
Code found while writing this spec — each needs an explicit decision:

| Where | Current behavior | With two rows per user |
|---|---|---|
| `AggregateByContentIDs` (`gorm_perspective_repository.go`) — `COUNT(*)`, `COUNT(quality)`, `AVG(quality)` grouped by `content_id` | Counts every row | User counted twice in `perspectiveCount`; both qualities averaged as two votes |
| `FeelingStats` (same file) — `COUNT(DISTINCT p.id)` | Distinct by perspective id (guards duplicate feelings inside one row only) | A user who put the same feeling on both rows counts twice; `TotalPerspectives` denominator also inflated |
| `CustomFieldStats` — `COUNT(*)` where key exists | Every row | Same double count |
| `PerspectiveAggregate` / `FeelingStats` doc comments | State "public and private alike" | Rule must be restated per-user |
| `Compare.svelte` (`perspectives.find(p => p.userID === leftId)`, `perspectives.length >= 2`) | Assumes one perspective per user | Picks an arbitrary row; `>= 2` is true for a single user with two rows |
| `OnboardingShell.svelte` / `OnboardingCoach.svelte` — `perspectiveCount` from list length | Counts rows | Onboarding progress inflated |
| `UserActivityView.svelte` / activity feed | One row per (user, content) assumed | Two rows for one content in the list; needs merge or badge |

**Decision to make (needs the sharing model first):** what is a user's *single vote*
per content when both slots exist? Candidates:

1. **Public slot wins; private counts only if there is no public one.** Simple,
   predictable, but a user's private-only rating is invisible to others' numbers
   unless no public exists.
2. **Aggregate per-user, then aggregate across users** (e.g. per-user quality =
   public's quality if set, else private's) — implementable as a `DISTINCT ON
   (user_id, content_id)` CTE ordered by privacy preference before the existing
   `GROUP BY`.
3. **Public-only aggregates** — cleanest for "what does the community think", but
   contradicts the 2026-09-13 decision and drops a user's own private-only content
   from their own count. Would need the earlier decision reversed explicitly.

Whichever is chosen, add tests that create **both slots for one user** and assert the
count, the average, and the feeling/custom-field percentages match the single-vote
rule. Also confirm the interaction with the future `excludeFromAggregates` opt-out:
opt-out should apply to the row *before* the per-user reduction.

## UI entry and display points (sketch)

- **Entry:** `PerspectivePopover.svelte` currently has a Private switch
  (privacy spec, Component 4). Replace/augment with a Public | Private toggle that
  loads the user's existing perspective for that slot, or starts empty. Saving the
  other slot never overwrites the first.
- **Entry from the table:** row indicator when a private slot exists (lock badge).
- **Display, own view:** both slots, private visually marked.
- **Display, others' view:** public slot only; private is never disclosed (existing
  read-authorization rules already guarantee this).
- **Aggregates:** per the Gate 2 decision; tooltip copy ("N people") must say
  people, not perspectives, once one user can have two.

## Migration & rollout

- New migration (check `ls backend/migrations/ | tail -5` for the next free number
  at the time; do not assume). Idempotent DDL (`IF NOT EXISTS`).
- **Pre-flight:** query for existing duplicate `(user_id, content_id, privacy)` rows
  and resolve them (merge or keep the newest) *before* adding the index — the index
  creation fails loudly otherwise.
- Service: `Create` must return a clear error (or upsert, TBD) when the slot is
  taken, mapped to a user-friendly GraphQL error; today it would surface a raw
  unique-violation.
- **Never run `make migrate-up` in dev** — applied manually per environment at
  rollout; the PR must state that.

## Open questions

1. What does the sharing model finally look like (two levels or more)? — Gate 1.
2. Single-vote rule for aggregates (options 1–3 above)? — Gate 2.
3. On create when the slot is taken: error, or transparently edit the existing one?
4. Final UI names ("Public take" / "Private notes"?).
5. Do existing users already have duplicate public rows? (Needs a prod-data query;
   not checked.)

## Not verified by this spec

The frontend audit above came from a grep over `frontend/src`; the ActivityTable's
row-selection logic and the GraphQL query documents were not read in full. Treat
the table as a starting list, not a complete inventory.
