# Calculated columns (user-defined custom metrics)

Status: draft <!-- draft | accepted | done | superseded by <link> -->

## Problem

The grid can only sort and filter by a fixed set of fields. Today that set is the 15 values of the `ContentSortBy` enum and the hard-coded min/max fields of `ContentFilter`.

A user who wants to rank content by something that matters to *them* has no way to say so. This applies to **every content type**, not one: YouTube videos, movies, Bible passages, claims, and any type added later. Some examples:

- **YouTube:** "popularity" as a weighted blend of views and likes, or "sleeper hits" as a high like ratio on low views.
- **Movies:** "return on budget" blended with TMDB score.
- **Any type:** "contested" as many perspectives with widely spread quality ratings.

Today users end up eyeballing several columns at once.

Every derived metric we *do* have, `PERCENT_LIKED` and `VS_BUDGET`, was hand-written in five places:

1. The GraphQL enum.
2. `contentSortRule` (a fixed SQL expression) in `backend/internal/adapters/repositories/postgres/helpers.go`.
3. `computedSortColumns` / `computedSortSelects`, so the keyset cursor can encode it.
4. A read-only GORM field in `gorm_models.go`.
5. A mirrored client value getter in `frontend/src/lib/utils/formatting.ts`.

That means a new metric costs a backend and a frontend change plus a deploy. The two implementations can also drift apart, and users can never define one themselves. Filtering on derived values is worse still: % Liked has no server filter at all (`grid-config.ts` notes the gap).

## Proposed outcome

A signed-in user can define a named **calculated column** from a formula over a fixed catalogue of metrics. They can show it in the grid, sort by it, and filter it by range. It gives the same result whether evaluated in the browser or in Postgres.

- **Works for every content type.** Calculated columns are a general grid capability, not a YouTube feature. The operand catalogue has two kinds of entry:
  - **Shared operands** that exist for every type: length, age since added, and perspective aggregates (count, average quality, spread).
  - **Type-specific operands** that each content type registers: YouTube views/likes/comments and publish age; movie revenue, budget and TMDB score; and whatever later types bring.
  - Adding a new content type includes registering its numeric operands in one place, so its fields become usable in formulas without touching the compiler or evaluator. That step belongs in the [Adding a Content Type](../../.claude/docs/ADDING_CONTENT_TYPE.md) guide.
  - A formula can mix operands from different types. An operand that doesn't apply to a row evaluates to NULL unless the formula wraps it in `coalesce`.
- **Definable without code.** A formula is built from catalogue operands, numeric weights and constants, and a small set of safe functions: `+ - * /`, `log10`, `sqrt`, `min`, `max`, `coalesce`, safe division. Examples:
  - YouTube popularity: `0.7 * log10(viewCount + 1) + 0.3 * log10(likeCount + 1)`
  - Movie value: `0.5 * (revenue / budget) + 0.5 * tmdbScore`
  - Any type, contested: `perspectiveCount * qualitySpread`
- **Runs on either side, same answer.**
  - **Client-side** in Loaded mode, which uses AG Grid's client-side row model and up to 100 rows.
  - **Server-side** in All Items mode, through the existing keyset pagination.
  - The formula is stored once as a JSON expression tree. A TypeScript evaluator and a Go-to-SQL compiler both read that one representation. Shared fixtures prove the two give the same result.
- **Sortable and filterable like a built-in column.**
  - It appears in the column picker.
  - It sorts (alone or in multi-sort) with nulls last and an id tie-breaker.
  - It takes a min/max range filter.
  - Sort and filter state still round-trip through the URL.
- **Very dynamic at the database, but no runtime DDL.** New formulas never need a migration or a deploy. The database does the math, so sort and filter stay correct across all rows, not just the loaded page. Schema changes are limited to a one-time foundation: typed operand columns or a view, plus the definitions table. Those go through the normal migration review.
- **Built-ins and custom metrics share one path.** Once this ships, `PERCENT_LIKED` and `VS_BUDGET` can be re-expressed as system-owned definitions. That removes the five-place pattern.
- **One engine, more than one grid.** Each definition names the grid it targets (`plan` or `content`). Each grid registers its own operand catalogue with the same compiler and evaluator. A future grid joins by registering its operands.

## Phasing

The end goal above covers every content type in the Activity grid. Delivery is staged so the engine is proven on the simplest grid first.

**Phase 0 — Plan gets a client vs server sort mode (prerequisite).**
- Today Plan sorts on the server only. `PlanTable.svelte` maps the first sorted column to `UserTodoSortBy` (5 values) and refetches; sort is single-column, over a page of up to 100 rows.
- Plan needs the same choice Activity already has:
  - **client sort/filter** over the loaded rows, using AG Grid's client-side row model;
  - **server sort/filter** across all of the user's todos.
- Without that, a calculated column can't be proven client-side on Plan.
- List mode (a single list ordered by `list_position`, with drag-reorder) keeps its fixed order. Header sorting stays off there, as it is today.

**Phase 1 — Pilot: calculated columns on the Plan view.**
- Plan is the first target for the full engine:
  - the expression tree;
  - the TypeScript evaluator;
  - the Go → SQL compiler with bound parameters;
  - parity fixtures;
  - the `metric_definitions` table;
  - the formula editor;
  - column picker, sort and range filter in both sort modes.
- **Why Plan first:**
  - `user_todos` has real typed columns: priority (`valid_integer_range`), percent complete, and start/end/due dates. There are no JSONB casts, so open question 2 doesn't block the pilot.
  - Data is owner-scoped and small, and already indexed on `(user_id, status)`. Unindexed computed sorts are safe, so question 8 can wait.
  - There is one kind of row, so question 6 doesn't apply yet.
  - The sort surface is small.
- **Example pilot metrics:**
  - urgency, e.g. priority weighted by days until due;
  - "stalled", e.g. high priority, low % complete, old start date.

**Phase 2 — Activity grid, every content type.**
- The same engine targets `content`, with shared and type-specific operands, both data modes, and keyset pagination at scale.
- This phase is where open questions 2, 6 and 8 get answered.
- `PERCENT_LIKED` and `VS_BUDGET` move onto the engine here.

## Affected users and systems

- **Users:**
  - Phase 1: signed-in users on their own Plan view.
  - Phase 2: anyone browsing the Activity grid, across all content types (YouTube videos, movies, Bible passages, claims, and future types). YouTube is only the motivating example.
- **Plan view (phases 0–1):**
  - `PlanBoard.svelte` (query variables, sort state, page size);
  - `PlanTable.svelte` (colDefs, `onSortChanged` → `serverSortFor`, a client/server sort mode);
  - `plan-todo-helpers.ts`;
  - backend `UserTodoSortBy` / `UserTodoFilter` in `schema.graphql`, plus the user-todo repository, which need a way to name a metric.
- **Content-type plumbing:** each type's numeric fields are registered as operands, in one catalogue shared by backend and frontend. The [Adding a Content Type](../../.claude/docs/ADDING_CONTENT_TYPE.md) guide gains a step for this.
- **Frontend:**
  - `ActivityTable.svelte` (colDefs, both data modes);
  - `grid-config.ts` (`COLUMNS` / `ColumnMeta`; dynamic entries join the static list);
  - `ColumnPickerDialog.svelte`;
  - `columnLayouts.ts` (localStorage layouts must reference metric ids);
  - `gridUrlState.ts` (sort/filter keys for dynamic columns);
  - a new formula editor UI.
- **Backend:**
  - `schema.graphql` (`ContentSortInput` and `ContentFilter` need a way to name a metric, not just an enum value; plus metric-definition CRUD);
  - `content_service.go`;
  - the postgres content repository and `helpers.go` (sort-rule and cursor-select generation from a compiled expression);
  - a new domain package for the expression tree: validation, compilation, versioning.
- **Database:**
  - a new `metric_definitions` table (owner, name, expression JSONB, formula version, visibility, optional content-type display filter);
  - typed operand columns or a view in place of JSONB string casts;
  - possibly a later expression index or materialized cache. This becomes the **first grid preference stored in the database**; column layouts are localStorage-only today.
- **Precedent to reuse:** [Analysis depth metric](../../docs/superpowers/specs/2026-09-26-analysis-depth-metric-design.md). It brings user-owned weights in JSONB, a versioned formula, (user, type) → (user, all) → default resolution, and an opt-in sortable column.

## Constraints

- **No user-supplied SQL, ever.** Formulas are stored and validated as a whitelisted expression tree:
  - every operand comes from the catalogue;
  - every constant goes in as a bound parameter;
  - every function maps to a fixed SQL template;
  - node count and depth are capped;
  - division is `NULLIF`-guarded.
- **No runtime DDL.** We will not run per-user `CREATE VIEW`, generated columns, or `CREATE FUNCTION` against the shared Neon database. Schema changes go through numbered migrations (next free: `000032`), reviewed and applied by hand per environment. This rules out "one view or column per user metric".
- **Keyset pagination must keep working.** A computed sort needs a deterministic `SELECT (expr) AS metric_<id>` alias the cursor can encode. That is the same mechanism `computedSortSelects` already uses.
- **Query budget.** Per [`.docs/QUERY_BUDGET.md`](../../.docs/QUERY_BUDGET.md), a list query with custom metrics stays at page + optional count statements, with no per-row queries. Definitions load once per request. A new sorted or filtered column ships with an index, or with a stated reason it can't have one. User formulas are unindexable by nature, so the spec must say what scale makes that acceptable.
- **Cost:** stays on AG Grid Community. Calculated columns must not depend on the Enterprise / SSRM decision ([SSRM spike](../../docs/superpowers/specs/2026-09-27-ag-grid-enterprise-ssrm-spike.md)).
- **Client/server parity is tested, not hoped for.** One fixture set of formulas, rows and expected values runs against the TypeScript evaluator and the Postgres-compiled SQL.
- **Must not break:**
  - existing sort and filter URLs;
  - saved localStorage column layouts (`perspectize:activityColumns:v1` may need a v2 migration);
  - the Loaded / All Items mode toggle;
  - Plan's list mode, with its `list_position` order and drag-reorder.
- **Planning tool undecided.** Given the size, this may be planned with Wayfinder rather than the default superpowers spec → plan flow. Decide before the spec starts.
- **Delivery approach: a long-running feature branch.**
  - This work spans a migration, a backend expression compiler, GraphQL changes and frontend UI. It should not land on `main` half-finished.
  - Work happens on a long-lived integration branch (e.g. `feature/calculated-columns`).
  - Each slice is its own PR **into that branch**, linked back to this intent, in phase order:
    - Phase 0: Plan client/server sort mode. This is useful on its own and could merge to `main` directly if it's ready first.
    - Phase 1: migration, compiler + tests, GraphQL, client evaluator, editor UI — all on Plan.
    - Phase 2: content operands and the Activity grid.
  - The integration branch is rebased on `origin/main` regularly so the final merge stays small.
  - It merges to `main` only when the end-to-end outcome above is verified. Built-in metrics such as % Liked keep working unchanged until then.
  - The migration is applied to each environment at rollout, not during development.

## Open questions

<!-- Options are numbered, sub-options lettered, so answers can be given as "1b", "3a2", etc. -->

1. **Where does the database do the math?** The goal is "very dynamic" with no runtime DDL.
   - a) **Compile to an inline SQL expression per query.** Go turns the expression tree into a parameterised `(expr) AS metric_<id>` in SELECT / ORDER BY / WHERE. No database objects per metric. It reuses the `computedSortSelects` pattern. *(Leading candidate.)*
   - b) **One generic SQL function shipped by migration**, e.g. `metric_eval(content_row, expr JSONB)`, which interprets the tree in PL/pgSQL. The logic stays fully in the database, but it is slower per row, hard to optimise, and a second interpreter to keep in parity.
   - c) **Materialised metric cache.** A `content_metric_values (metric_id, content_id, value)` table, refreshed on definition change and nightly stats sync. It is indexable and fast to sort, but it adds staleness and refresh jobs. Possibly a later optimisation on top of (a), not instead of it.
   - d) **Per-metric views or generated columns.** Ruled out under Constraints; listed only to record the rejection.
2. **How do operands become clean numbers?** Type-specific fields live in the `content.response` JSONB (YouTube stats are strings cast with `::BIGINT`). The answer has to scale to every current and future content type.
   - a) `STORED` generated columns on `content` (e.g. `view_count BIGINT GENERATED ALWAYS AS (...)`). Indexable, with no write-path changes. But with every type registering operands, the shared `content` table grows a mostly-NULL column per operand, and each new operand needs a migration.
   - b) Plain columns populated on ingest and on each type's stats refresh (YouTube, TMDB, …). Same column growth as (a).
   - c) A `content_metrics` SQL view over `content`. Nothing is stored, so it can't be indexed.
   - d) Each registered operand carries its own SQL template (a JSONB path plus cast) used by the compiler. New types add operands with no migration. Promote individual hot operands to (a) later, behind the same operand key, when one needs an index.
   - e) A narrow `content_operand_values (content_id, operand_key, value NUMERIC)` table filled on ingest and refresh. Adding a type's operands needs no migration, but every operand in a formula becomes a join or pivot.
3. **Who can see a definition?**
   - a) Private to its owner only.
   - b) Private by default, optionally shared publicly. Others can add it as a column; it is read-only to them.
   - c) Also system-owned definitions that ship as built-ins, replacing `PERCENT_LIKED` and `VS_BUDGET`.
4. **Formula authoring UX.**
   - a) A weighted-sum builder: pick operands, set weights, choose a transform (none / log / sqrt / rank). It covers "popularity" with no parsing.
   - b) A free-text formula with a parser and live preview.
   - c) Ship (a) first. The stored tree is general enough to add (b) later.
5. **Normalisation across rows.** "Popularity" usually wants views and likes on comparable scales.
   - a) Per-row transforms only (log, sqrt). Simple and the same on client and server.
   - b) Population-relative transforms (percentile, z-score over the current filtered set). These need window functions server-side and differ between a 100-row loaded page and all rows, so the spec must say whose population counts.
6. **Operands that don't apply to a row.** Formulas span all content types, so a YouTube-only operand meets movie rows. Should a missing operand:
   - a) evaluate to NULL, making the whole result NULL so the row sorts last, unless the author wraps it in `coalesce`;
   - b) evaluate to 0;
   - c) use a per-operand default the author picks in the editor?
   Separately, should a definition be able to *optionally* narrow itself to chosen types, purely as a display filter?
7. **Perspective-based operands.** Should formulas be able to use per-content perspective aggregates (count, avg quality) in v1? These are not server-sortable today and would need a JOIN or a denormalised count. That is backlog item "Perspectize Column Sorting & Filtering".
8. **Scale threshold.** At what content-row count do unindexed computed sorts become too slow on Neon, and does that trigger option 1c? The spec needs a measured number, not a guess.
9. **When does the long-running branch reach `main`?**
   - a) After Phase 1, once calculated columns on Plan are verified; Phase 2 then gets a fresh integration branch.
   - b) Only after Phase 2, with the whole outcome in one merge.
10. **Plan sort-mode UX.** Should Plan copy Activity's explicit mode toggle (Loaded / All Items)? Or should it pick automatically: client mode when the user has ≤ one page of todos, server mode beyond that?

## Downstream

- Spec: <!-- docs/superpowers/specs/YYYY-MM-DD-calculated-columns-design.md -->
- Plan(s): <!-- link(s) -->
- Integration branch: <!-- feature/calculated-columns -->
- PRs (one line each, add as they open; tick on merge):
  - [x] Intent: calculated columns — https://github.com/CodeWarrior-debug/perspectize/pull/601 — merged
  - [ ] Intent: Plan pilot phasing — <!-- PR link --> — open
