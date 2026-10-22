# Calculated columns (user-defined custom metrics)

Status: draft <!-- draft | accepted | done | superseded by <link> -->

## Problem

The grid can only sort and filter by a fixed set of fields. Today that set is the 15 values of the `ContentSortBy` enum and the hard-coded min/max fields of `ContentFilter`.

A user who wants to rank content by something that matters to *them* has no way to say so. For example, "popularity" for YouTube videos could be a weighted blend of views and likes; "sleeper hits" could be high like ratio on low views. They end up eyeballing several columns at once.

Every derived metric we *do* have, `PERCENT_LIKED` and `VS_BUDGET`, was hand-written in five places:

1. The GraphQL enum.
2. `contentSortRule` (a fixed SQL expression) in `backend/internal/adapters/repositories/postgres/helpers.go`.
3. `computedSortColumns` / `computedSortSelects`, so the keyset cursor can encode it.
4. A read-only GORM field in `gorm_models.go`.
5. A mirrored client value getter in `frontend/src/lib/utils/formatting.ts`.

That means a new metric costs a backend and a frontend change plus a deploy. The two implementations can also drift apart, and users can never define one themselves. Filtering on derived values is worse still: % Liked has no server filter at all (`grid-config.ts` notes the gap).

## Proposed outcome

A signed-in user can define a named **calculated column** from a formula over a fixed catalogue of metrics. They can show it in the grid, sort by it, and filter it by range. It gives the same result whether evaluated in the browser or in Postgres.

- **Definable without code.** A formula like `popularity = 0.7 * log10(viewCount + 1) + 0.3 * log10(likeCount + 1)` is built from:
  - catalogue operands: viewCount, likeCount, commentCount, length, age since publish, tmdbScore, and later perspective aggregates;
  - numeric weights and constants;
  - a small set of safe functions: `+ - * /`, `log10`, `sqrt`, `min`, `max`, `coalesce`, safe division.
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

## Affected users and systems

- **Users:** anyone browsing the Activity grid. The first visible use case is YouTube, then movies (box office / budget / TMDB blends).
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
  - a new `metric_definitions` table (owner, name, content-type scope, expression JSONB, formula version, visibility);
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
  - the Loaded / All Items mode toggle.
- **Delivery approach: a long-running feature branch.**
  - This work spans a migration, a backend expression compiler, GraphQL changes and frontend UI. It should not land on `main` half-finished.
  - Work happens on a long-lived integration branch (e.g. `feature/calculated-columns`).
  - Each slice (migration, compiler + tests, GraphQL, client evaluator, editor UI) is its own PR **into that branch**, linked back to this intent.
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
2. **How do operands become clean typed columns?** Today views/likes/comments are JSONB strings cast with `::BIGINT`.
   - a) `STORED` generated columns on `content` (e.g. `view_count BIGINT GENERATED ALWAYS AS (...)`). Indexable, with no write-path changes.
   - b) Plain columns populated on ingest and YouTube stats refresh.
   - c) A `content_metrics` SQL view over `content`. Nothing is stored, so it can't be indexed.
   - d) Leave the JSONB casts inside the compiler's operand templates for now.
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
6. **Content-type scope.** Should a definition be tied to one content type (YouTube operands differ from movie operands)? Or can it span types, with operands that don't apply evaluating to NULL and sorting last?
7. **Perspective-based operands.** Should formulas be able to use per-content perspective aggregates (count, avg quality) in v1? These are not server-sortable today and would need a JOIN or a denormalised count. That is backlog item "Perspectize Column Sorting & Filtering".
8. **Scale threshold.** At what content-row count do unindexed computed sorts become too slow on Neon, and does that trigger option 1c? The spec needs a measured number, not a guess.

## Downstream

- Spec: <!-- docs/superpowers/specs/YYYY-MM-DD-calculated-columns-design.md -->
- Plan(s): <!-- link(s) -->
- Integration branch: <!-- feature/calculated-columns -->
- PRs (one line each, add as they open; tick on merge):
  - [ ] Intent: calculated columns — <!-- PR link --> — open
