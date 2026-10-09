# User todos (`user_todos`) — Design

Status: **DRAFT v2, 2026-10-09, revised after owner feedback on v1. Not yet approved.** Remaining open items are under **Decisions to confirm**.

## Purpose

Let a user plan and track what they intend to do with content (and with things that are not content yet) and how far along they are: watch a movie, revisit a video, research a topic, process notes. Private to the user. Complements perspectives (what you think) with a plan (what you will do).

## Table: `user_todos`

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `user_id` | integer NOT NULL, FK `users(id)` | Owner. All reads/writes owner-guarded; never visible to other users. |
| `content_id` | integer NULL, FK `content(id)` | Set when the item exists as content (e.g. a movie added via TMDB). |
| `name` | varchar(255) NULL | Used only when there is no `content_id` (not found, or a list/idea). Ignored in the UI when `content_id` is set. |
| `action` | varchar(50) NOT NULL | Free text with presets (see **Actions**). Trimmed and lower-cased on write. |
| `priority` | `valid_integer_range` NULL | 0 to 10000, same domain and UI as the rating fields. |
| `status` | text NOT NULL DEFAULT `todo` | `todo`, `in_progress`, `done`, `dropped`. |
| `percent_complete` | smallint NOT NULL DEFAULT 0 | CHECK 0..100. |
| `start_date`, `end_date`, `due_date` | date NULL | **All optional.** `end_date` = when finished; `due_date` = target. |
| `comments` | text NULL | Sanitized HTML. |
| `created_at`, `updated_at` | timestamptz NOT NULL DEFAULT NOW() | `updated_at` via the shared `update_updated_at` trigger. |

Constraints and indexes:
- `CHECK (content_id IS NOT NULL OR name IS NOT NULL)`.
- Partial unique index on `(user_id, content_id, action) WHERE content_id IS NOT NULL AND status IN ('todo','in_progress')`: one open row per user, content and action. A finished row does not block a later `revisit`.
- Index on `(user_id, status, priority)` for the plan page.
- Migrations are **written, not applied** (shared Neon DB; see root `CLAUDE.md`).

## Lists: `user_todo_lists` and `user_todo_list_items`

Named lists with an order inside each list.

`user_todo_lists`: `id`, `user_id` FK, `name` varchar(100) NOT NULL, `description` text NULL, `created_at`, `updated_at`; `UNIQUE (user_id, name)`.

`user_todo_list_items`: `list_id` FK (ON DELETE CASCADE), `todo_id` FK (ON DELETE CASCADE), `position` integer NOT NULL, `PRIMARY KEY (list_id, todo_id)`, index on `(list_id, position)`.

- A todo can be in several lists ("Weekend watch" and "Mann films"), and in none. Hence a join table, not a `list_id` on the todo.
- `position` is the sequence within one list. It is not unique-constrained, so a reorder never trips a constraint mid-update; ties break by `todo_id`. A reorder mutation rewrites the affected list's positions in one transaction (1..N).
- Owner check: the list and the todo must both belong to the caller. Enforced in the service, not trusted from input.
- Deleting a list removes its memberships only, never the todos.

## Actions

Fixed presets plus free entry. The column is free text; the UI is a combobox: pick a preset, type a new value, or pick one of the user's own earlier custom values (suggested from their existing rows). No separate actions table.

Presets (code constant, shared by backend validation of length/charset and the frontend picker):

| Preset | Meaning |
|---|---|
| `consume` | Watch, read or listen for the first time |
| `revisit` | Consume again |
| `process` | Digest: take notes, summarize, extract |
| `research` | Look into it: background, sources, related work |
| `review` | Write or refine my perspective on it |
| `discuss` | Talk it over with someone or in a thread |
| `share` | Send it to or recommend it to someone |
| `compare` | Set against other content |
| `verify` | Fact-check claims in it |
| `acquire` | Buy, borrow or download |
| `cite` | Use it as a source in something |
| `archive` | File it away, done with it |

Presets are a starting point and are cheap to change because no schema depends on them.

## Behavior

- **Defaults.** `in_progress` fills `start_date` if empty. A user can override any date.
- **Done / 100% coupling, always confirmed by toast, never silent.** The two fields are kept consistent by asking:
  - Status set to `done` while percent < 100: toast "Mark 100% complete too?" with a **Yes** action.
  - Percent set to 100 while status is not `done`: toast "Mark as done too?" with a **Yes** action.
  - Choosing Yes applies the matching change (and fills `end_date` if empty).
  - Ignoring or dismissing the toast changes nothing.
  - **Convention: any toast that carries an action stays up 4 seconds by default** (pass `duration: 4000` via a shared helper rather than ad hoc). Check whether the app's current toast default differs; if it does, the helper owns the 4s value and `docs`/frontend `CLAUDE.md` gets a line.
- A `name`-only row can be linked later by setting `content_id`; `name` is then cleared.
- **Add perspective.** Each plan row has an "Add perspective" column (button). It opens the perspective editor for that row's content. After a perspective is saved for content that has an open `consume` or `review` row, a toast with a **Mark done** action offers to close it (4s, same rule). The two tables stay independent: no foreign key between them. A name-only row has no content, so its button is disabled with a tooltip ("Link this to content first").
- `comments` goes through the same HTML sanitizer as other rich text (confirm which one exists before building).

## API (GraphQL, sketch)

- `myUserTodos(filter: { status, action, contentId, listId }, sort, first, after)`: owner only, cursor-paginated. Sorting by a list's `position` when `listId` is given.
- `createUserTodo`, `updateUserTodo`, `deleteUserTodo`.
- `createUserTodoList`, `renameUserTodoList`, `deleteUserTodoList`, `addTodoToList`, `removeTodoFromList`, `reorderUserTodoList(listId, todoIds)`.
- The owner is always taken from the auth context, never from input.
- `UserTodo.content` resolved through a dataloader. Query-budget test required (`.docs/QUERY_BUDGET.md`).

## UI

- **Separate "My plan" page**, using the AG Grid `ActivityTable` pattern. Columns: content/name, action, priority, status, % complete, start/end/due dates, list(s) and position, comments, Add perspective.
- **List switcher** on the page (all, one list, or unlisted). With one list selected, rows sort by `position` and can be dragged to reorder.
- "Add to my plan" on a content row and in the content details modal, action defaulting to `consume`.
- **Plan columns on the Activity table** (hidden by default, in the column picker): tracked in GitHub issue [#571](https://github.com/CodeWarrior-debug/perspectize/issues/571), created for this spec. Not part of v1 of the plan page.

## Movies example

| Content | Action | Priority | % | Status | Lists |
|---|---|---|---|---|---|
| Heat (1995) | consume | 8000 | 0 | todo | Mann films #1 |
| Heat (1995) | revisit | 3000 | 0 | todo | |
| Collateral (2004) | consume | 6000 | 0 | todo | Mann films #2 |
| Dune | research | 5000 | 40 | in_progress | |
| *(name only)* "that Mann heist film" | research | 5000 | 0 | todo | |

## Out of scope (phase 2)

- Consumption log of repeated watches, and analytics (counts per action, timeline, streaks).
- Sharing a list with other users.
- OAuth import (see `2026-09-28-oauth-external-sync-design.md`) creating todos from liked videos.

## Decisions to confirm

Settled by the owner on 2026-10-09: many rows per content; `status` alongside percent with the confirm-by-toast coupling; action presets plus user entry; priority on the 0 to 10000 rating scale; `due_date` added and all dates optional; an Add perspective column; a separate plan page; named lists with sequence; Activity-table plan columns as a separate issue.

Still mine, still open:
1. Lists as a join table (a todo can be in several lists) rather than one list per todo.
2. `position` as a plain integer rewritten per reorder, not a gapped or fractional ordering.
3. The preset action list above (12 entries): add, drop or rename any.
4. `dropped` as a fourth status.
5. A todo row doubles as consumption history; no separate log in v1.
