# Perspectize — User Flows

A reference list of the flows a user can take through the app today, so we can come back to it when planning UX work.

- **Method:** read the SvelteKit routes, layout, header, dialogs and query hooks in `frontend/src`, plus the GraphQL mutations in `backend/schema.graphql`. **I did not run the app** (cloud session, no Clerk sign-in), so these describe what the code does, not what I watched happen.
- **Companion:** [TRANSITION_IMPROVEMENTS.md](./TRANSITION_IMPROVEMENTS.md) lists the gaps found while tracing these flows.
- **Earlier audit:** [.docs/UI_GAP_AUDIT.md](../../.docs/UI_GAP_AUDIT.md) covers column/sort/theme parity. This doc is about journeys, not parity.
- **Dated:** 2026-10-30. Re-check against `main` before relying on it.

## Map of the app

| Route | What it is | Signed-out behavior |
|---|---|---|
| `/` | **Activity** — grid (desktop) or cards (mobile) of all content; search, filters, sort, columns, pagination | `GuestLanding` replaces every route |
| `/discover` | **Discover** — YouTube trending, or TMDB movie search/trending; add to library | same |
| `/compare` | **Compare** — picker when no `?contentId`, side-by-side perspectives when set (`left`/`right` choose the two takes) | same |
| `/plan` | **Plan** — personal todos, lists, actions | same (the page's own sign-in prompt is never reached, see improvement #6) |
| `/messages`, `/messages/[threadId]` | Full-page inbox; the day-to-day entry is the floating messaging widget | same |
| anything else | SvelteKit default 404 (no `+error.svelte`) | — |

Global chrome (`Header.svelte`): brand link, nav (Activity / Discover / Compare / Plan), **Add Content** popover, **Settings** gear, Clerk **UserButton** (or the demo persona chip). Signed-out users see **Sign In** instead. The app is client-rendered only (`ssr = false`).

Persistent overlays when signed in: floating **Messaging widget**, **inbox stream** (live updates), **Onboarding coach**, toasts (`svelte-sonner`).

---

## Flow 1 — Guest arrives and signs in

```
Any URL → GuestLanding (pitch + optional product video + "Sign in")
        → Clerk modal   (demo mode: persona picker instead)
        → app shell mounts → same URL renders (Activity, Compare, …)
```

- Guests can never see content. There is no public/read-only view.
- Sign-in is a modal, so the URL is preserved; the page they asked for renders after auth (to confirm in a real session).
- Demo mode (`DEMO_MODE`): no Clerk; a banner and persona dialog replace it.

## Flow 2 — First-run onboarding coach

```
Signed in → OnboardingShell checks me.onboarding
  ├─ already has own content AND a perspective → "quiet graduate" (marked seen, no UI)
  └─ eligible → OnboardingCoach
        Step 1 "Add a video"  → [Add video] opens add dialog | [Skip step]
        Step 2 "Leave a perspective" → [Leave a perspective] (needs a target video) | [Back to add video] | [Skip step]
        [Skip all] / dismiss → marked seen
        complete → closes
Settings → General → "Restart onboarding" replays from step 1
```

## Flow 3 — Browse, search and filter Activity (the home screen)

1. Land on `/`. The grid starts **filtered to YouTube only** (default `f.type=youtube`).
2. **Search** box (debounced 300 ms → `?q=`), with a **fields** popover (title / description / channel / tags; cast & director only when the Movie type is in the filter).
3. **Mine** toggle = shortcut for the `user` column filter.
4. Column menus add filters; **filter chips** show them and can be cleared ("Clear all" stores `f=none`).
5. **Sort**, **column picker** (visible columns), pagination, and "Loaded" vs paged modes.
6. All grid state lives in the URL, so links and reloads reproduce the view.
7. **Mobile:** same data as cards (`ActivityCardList`), with fewer fields.
8. Error → "Failed to load content" + Retry (+ hint to clear filters). Empty → "No content yet" / filtered-empty message.

## Flow 4 — Add content to the library

Three entry points, one outcome (a `Content` row, shown in Activity):

**4a. Header → Add Content popover** (works from any page)
`Paste/type → type auto-detected (YouTube / Movie via TMDB-IMDb link / Bible passage reference) → optional manual type override → Add`
- Bible passage shows a verse **range picker**; only the numeric range is sent.
- Toast on success; popover closes.
- Duplicate YouTube video → warning toast with "Go to video".
- Movie/passage → success toast with "Go to movie/passage".
- Plain YouTube success → toast without an action.

**4b. Discover → YouTube**
`Trending grid (backend-cached, Load more) → [Add] on a card → card flips to inline details with "Add perspective" / "Compare"`
- Paste a YouTube link into the search box to add it directly; typing a normal query hands off to youtube.com (quota).
- Already-in-library cards show a disabled "In Library".

**4c. Discover → Movies**
`Search TMDB or browse trending → [Add]` or paste a TMDB/IMDb link. Cmd/Ctrl+K focuses search, Esc clears.

**4d. Onboarding coach / legacy `AddVideoDialog`** — YouTube-URL-only dialog.

## Flow 5 — Inspect an item (details modal)

`Click row/card → ActivityDetailsModal`
- Shows thumbnail/poster, stats, tags, description, category, aggregate **perspective count** and **average quality rating** (lazy-loaded).
- **Refresh source data** (re-pull title/stats from YouTube; gated by a ~6 h cooldown).
- Movies: poster + TMDB body. Passages: verse text, position bar, outside links, and a **one-time title** field.
- Actions: **Compare**, **Add to plan** (when signed in), external link to the source.
- Category: set via a typeahead (`setPrimaryCategory`).

## Flow 6 — Leave, edit or delete a perspective

```
Row/card action (glasses or "+") → PerspectivePopover
   fields: rating dimensions (0–10000 scale), review (rich text), feelings, custom fields, thumbs
   → Save → create / update (optimistic) → toast
   → Delete (own perspective only) → inline "are you sure" → toast
```
- Review drafts autosave to localStorage and are restored if the base review hasn't changed.
- Opened from Activity, Discover cards, Plan rows, and the onboarding coach.
- If opened from a Plan todo, saving can also update that todo.

## Flow 7 — Compare perspectives

```
Compare (header)  → no contentId → ComparePicker: search content with ≥2 perspectives → pick
Activity modal "Compare" / Discover card "Compare" → /compare?contentId=…
   → Compare: choose left/right person, rating table, takes side by side, overall row
   → states: loading, error+Retry, "no one has shared", "no one to compare against"
   → "Add yours" CTA when you haven't written one
```
- Left/right selection is mirrored into the URL (`replaceState`).

## Flow 8 — Plan (personal to-dos)

`Plan → PlanBoard`
- **Add Todo** (TodoDialog): pick an item, an action (seeded set such as "Consume"; see `todo_actions`), status, list, notes.
- **Lists:** switch, create, rename, delete (`window.confirm`); selecting a list enables drag-to-reorder.
- Row actions: edit, add perspective.
- "Add to plan" also starts from Activity rows/cards and the details modal.
- Shows the first page with a "Showing the first N of M" note.

## Flow 9 — Messaging

- **Widget** (floating button): thread list ⇄ thread view in a panel; live updates, typing indicator, presence dots, read receipts.
- **New conversation:** NewThreadDialog (pick user) → thread.
- Messages: send, edit, delete; message links (`MessageLink`) deep-link into content.
- **Leave conversation** → toast and redirect to `/messages`.
- Full-page `/messages` is a two-pane layout; on mobile the list hides when a thread is open. No header nav link points to it.

## Flow 10 — Settings, theme, feedback

`Gear → Settings dialog`: **General** (restart onboarding) · **Customize Theme** (presets + custom) · **Send Feedback** (opens a GitHub issue template in a new tab, then closes the dialog).

## Flow 11 — Account, session and platform

- **UserButton** (Clerk) for profile / sign out. No in-app profile or username editing UI was found (`updateUser`/`deleteUser` exist in the API, unused by the UI).
- **New deploy detection:** version polling; the next navigation becomes a full reload, and an idle tab reloads itself unless the user is typing.
- **Demo mode:** persona chip in the header switches seeded users.

## Flow 12 — Bible passages (specialised)

Add by reference → row appears with a display title → open modal for verse text (selectable version), position within the book, links out, and one-time custom title. `useOpenPassage` opens/ensures a passage from a link. Interlinear components exist under `lib/components/interlinear`.

---

## Core loop (what the product is really about)

```
Find content ──► Add to library ──► See it in Activity ──► Leave a perspective
   (Discover / paste link / Bible ref)                         │
                                                               ▼
                                         Compare with others ◄─┤
                                         Plan to revisit    ◄──┤
                                         Message someone    ◄──┘
```

Most of the issues in [TRANSITION_IMPROVEMENTS.md](./TRANSITION_IMPROVEMENTS.md) are the arrows in this diagram: places where one step doesn't hand the user to the next.
