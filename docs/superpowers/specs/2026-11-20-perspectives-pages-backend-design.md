# Perspectives Library and per-perspective page: backend design

**Date:** 2026-11-20
**Type:** feature (design only; no code, no migration)
**Status:** proposal for owner review. Not a superpowers plan; no execution sub-skill yet. An implementation plan is written from this once the owner decisions below are settled and the #751 UI and desktop design gates pass.
**Issues:** [#751](https://github.com/CodeWarrior-debug/perspectize/issues/751) (Perspectives Library: one row per content item, metric columns with a switchable aggregator), [#752](https://github.com/CodeWarrior-debug/perspectize/issues/752) (per-perspective page, one row per perspective)
**Related:** [ADR 0002](../../adr/0002-sharing-model.md), [Multiple perspectives per content](2026-09-29-multiple-perspectives-per-content-design.md), [Perspectives glossary](../../glossary/perspectives/GLOSSARY.md), [Query budget](../../../.docs/QUERY_BUDGET.md), [Release approaches](../../../.docs/RELEASE_APPROACHES.md)

This is the backend half. A parallel UI and desktop design works from the same issues; [What the frontend designs must assume](#8-what-the-frontend-designs-must-assume) is the contract the two reconcile on.

Every claim about existing code cites a file and function. Anything not checked against code or data is marked **guess** or **unverified**.

---

## 0. Summary

1. **Metric × aggregator, never a field per pair.** A metric is a registry entry (four standard dimensions, eight optional dimensions stored in `custom_fields`, or a feeling's intensity). An aggregator is an enum. Both are GraphQL enums, so the whitelist is the schema itself. No client string ever reaches SQL as an identifier.
2. **#751 is one new query, `contentMetrics`.**
   - It returns content rows with one cell per requested metric column (`value`, `n`, `lowSample`, `suppressed`, `mine`).
   - **Each column has exactly one aggregator.** That aggregator is what the cell shows, sorts on and filters on, in SQL.
   - An optional **`gatherAll`** mode also returns every aggregator for each column's metric in `cell.all`, for the tooltip only. Sort and filter stay on the column's single selected aggregator.
   - It costs **one statement** for any number of columns, with or without `gatherAll`.
3. **#752 extends the existing `perspectives` query.** It adds additive sort and filter arguments on rating fields, a `scope` (MINE / PUBLIC), and a `metricValues` field. It shares the `MetricRefInput` type with #751.
4. **The viewer picks the aggregate population with `contentMetrics(scope:)`.**
   - **`EVERYONE`** (the default) is public perspectives, one vote per user per content, public row wins.
   - **`MINE`** is the viewer's own perspectives.
   - **`INCLUDE_OPTED_IN_PRIVATE`** is reserved for the later opt-in slice and rejected until then.
   - This is ADR 0002 sections 5–7. Migration `000038_perspectives_unique_per_user_content_privacy` allows at most one public and one private perspective per user per content. So under `EVERYONE`, "n" means distinct users, which equals the number of public rows.
   - The SQL still reduces to one row per `(content_id, user_id)`, so it stays correct in any environment where the 000038 index is not yet applied.
5. **Private rows never enter the shared number by default.**
   - Under `EVERYONE` the viewer's own value comes back separately as `mine`.
   - "Allow in aggregates" **does not exist on `main` yet**: no column and no setting. It is the later slice B4.
   - That slice brings a minimum of **3 private contributors** for AVG and COUNT. MIN, MAX, STDDEV and MEDIAN stay public-only forever, because public values are readable and can be subtracted out.
6. **No migration and no new index for v1.** `idx_perspectives_content_id` (000029) and `uq_perspectives_user_content_privacy` (000038) cover the access paths. An index is added later only with EXPLAIN evidence.
7. **The release is a dark backend in three additive slices.** A separate, normal (user-visible) PR must also fix the existing aggregates, which now double-count a user who has both slots, and bring `feelingStats` / `customFieldStats` onto the same population rules.

---

## 1. Facts this design rests on (verified)

| Fact | Where |
|---|---|
| Ratings are `valid_integer_range` (0–10000), nullable | `000004_add_perspectives_users.up.sql`; `domain.RatingMin/RatingMax` |
| A user has at most one public and one private perspective per content: partial unique index `(user_id, content_id, privacy) WHERE content_id IS NOT NULL` | `000038_perspectives_unique_per_user_content_privacy.up.sql`; constant `perspectivesUserContentPrivacyUnique` in `gorm_perspective_repository.go` |
| 000038 is on `main`, but the PR that added it still carries the `migrations-unapplied` label, and production was de-duplicated by hand ahead of it (see the migration's header). So the index may not be live everywhere | the migration header; the PR's labels (checked with `gh`) |
| `AggregateByContentIDs` counts **every row** (`COUNT(p.id)`, `AVG(p.quality)`), public and private, with no per-user reduction | `GormPerspectiveRepository.AggregateByContentIDs` |
| The service port's doc for `AggregateByContentIDs` says "public-perspective count". That is wrong: the code counts all rows | `core/ports/services/perspective_service.go` |
| `CountVisibleByContentIDs` and the `minPerspectiveCount` filter count rows the viewer may read through `visiblePerspectivePredicate` (public, or `user_id = viewer`). A viewer with both slots counts twice for themselves | `helpers.go visiblePerspectivePredicate`; `gorm_content_repository.go List` |
| `FeelingStats` / `CustomFieldStats` don't yet apply the population and visibility rules defined in this spec. Fixing that is slice B0, tracked in the private bug backlog | `GormPerspectiveRepository.FeelingStats/CustomFieldStats` |
| `CustomFieldStats` only counts key presence. It never reads the value | same |
| `feelings` is `jsonb[]` (unnested with `unnest`). Intensity uses the rating scale | `000019_add_perspective_feelings.up.sql`; `domain.FeelingEntry` |
| Optional dimensions are written as `custom_fields.<lowercase key>: number` in storage units. The list of eight keys exists **only in the frontend** (`AVAILABLE_FIELDS`) | `PerspectivePopover.svelte buildCustomFields`; `RatingInput.svelte` ("storage units (0-10000)"); `AddFieldSearch.svelte` |
| The backend does **not validate** `custom_fields` values: any JSON is stored as sent | `PerspectiveService.Create/Update` (copies `CustomFields` through) |
| Content list keyset pagination uses gorm-cursor-paginator v2.7.0, which appends its keyset condition with `Where(...)`. Computed sort keys use `SQLRepr` + `NULLReplacement` + `computedSortSelects` | module source `paginator.go appendPagingQuery`; `helpers.go contentSortRule`, `computedSortSelects`; `gorm_content_repository.go List` |
| The content list folds the total count into the page statement as a scalar subquery: 1 round trip, plus 1 extra only for an empty page past the end | `GormContentRepository.List`; `test/roundtrips/content_test.go TestListContentGrid` |
| The `perspectives` list sorts only on `CREATED_AT` / `UPDATED_AT`, filters only on `userID`, `contentID` and `privacy`, and issues a **separate** COUNT when `includeTotalCount` | `buildPerspectiveSortRules`; `domain.PerspectiveFilter`; `GormPerspectiveRepository.List` |
| `LIST_CONTENT` is prefetched anonymously before Clerk loads, so it must select no field that depends on the viewer | `frontend/CLAUDE.md` (First-load performance) |
| Aggregate cache keys already carry the viewer: `queryKeys.content.aggregates(id, viewerId)` | `frontend/src/lib/queries/keys.ts` |

---

## 2. The metric × aggregator model

### 2.1 Metric registry

A metric is something with **at most one numeric value per perspective**, on the rating scale.

| Kind | Members | Source expression (per perspective row) |
|---|---|---|
| Standard dimension | `QUALITY`, `AGREEMENT`, `IMPORTANCE`, `CONFIDENCE` | the column itself (NULL = not rated) |
| Optional dimension | `ORIGINALITY`, `CLARITY`, `DEPTH`, `ENTERTAINMENT`, `RIGOR`, `RELEVANCE`, `BIAS`, `ACTIONABILITY` | `custom_fields -> '<key>'` **only when** `jsonb_typeof = 'number'` and the value is within 0–10000. Otherwise NULL |
| Feeling intensity | `FEELING` + a feeling key `{emoji, label?}` | `MAX(intensity)` over that perspective's matching `feelings` entries (NULL when it does not carry the feeling) |

**Proposal: the registry is a closed Go table in `core/domain`, mirrored as a GraphQL enum.**

- `domain.Metric` (typed string, UPPERCASE) and a `domain.MetricRegistry` map from metric to `{Kind, CustomFieldKey}`.
- The optional-dimension keys move from "frontend only" to "backend owns, frontend mirrors". A sync test fails if `AddFieldSearch.svelte AVAILABLE_FIELDS` and the backend enum drift. It lives on the frontend side and is excluded from Stryker per frontend/CLAUDE.md, because it reads outside `frontend/`.
- **Trade-off:**
  - A closed enum means a user-invented custom field cannot be a column until it is added to the registry.
  - That is deliberate. Arbitrary keys carry unvalidated JSON with no agreed scale, and the column picker needs labels and tooltips anyway.
  - A free-form `customFieldKey: String` (passed as a bind parameter, so injection-safe) is the fallback if the owner wants arbitrary keys. Owner decision D7.
- Feelings stay open-ended: the emoji is a **bind parameter**, never an identifier. This matches `FeelingStats` today.

### 2.2 Aggregators

| Aggregator | SQL | Meaning | Ships in v1? |
|---|---|---|---|
| `COUNT` | `COUNT(x)` | how many contributors set this metric (skips NULLs, like `qualityRatingCount`) | yes |
| `AVG` | `AVG(x)` | mean | yes |
| `MIN` / `MAX` | `MIN(x)` / `MAX(x)` | extremes | yes (public-only, see section 5) |
| `STDDEV` | `STDDEV_POP(x)` | spread. Population SD, matching `FeelingStats` | yes |
| `MEDIAN` | `percentile_cont(0.5) WITHIN GROUP (ORDER BY x)` | robust centre; works with `GROUP BY` | **recommended for v1** (D2) |
| `SUM` | `SUM(x)` | total | **no** for rating metrics (D2) |

**SUM recommendation:**
- Over 0–10 ratings, a sum is "count × mean". It ranks content by popularity, which `COUNT` and `AVG` together already show more honestly. So don't offer it for any v1 metric.
- The registry declares `AllowedAggregators` per metric kind, and the service rejects a pair that isn't allowed. A later count-type metric can enable SUM without changing the schema.
- Keep `SUM` out of the GraphQL enum until such a metric exists. Adding an enum value later is additive.

**MEDIAN recommendation:**
- MEDIAN is cheap in Postgres (an ordered-set aggregate in the same `GROUP BY`) and resists one outlier rating, which is the main weakness of AVG on small samples.
- Percentiles beyond the median can wait.

**One aggregator per column; `gatherAll` for tooltips (owner decision D2).**
- A metric column carries **exactly one** aggregator. It is the value shown in the cell, the sort key and the filter target. Switching it changes the column in place; it never adds a column.
- With `gatherAll: true` the request also returns, per cell, **every allowed aggregator** for that column's metric (`cell.all`). The UI uses this only for the tooltip, for example "avg 7.2 · median 7.5 · min 4 · max 9 · sd 1.4 · n 6".
- `gatherAll` never widens sort or filter: both stay restricted to the column's selected aggregator.
- It is a request mode, not a schema shape: requests without it pay nothing extra.

### 2.3 Whitelist rule (SQL injection)

- `Metric` and `Aggregator` are GraphQL enums bound to domain types in `gqlgen.yml`, with no switch-based conversion (backend/CLAUDE.md, Enum & ID Handling). gqlgen rejects any other value before a resolver runs.
- The repository maps each `(metric, aggregator)` to a SQL fragment from **two Go maps** (`metricSourceSQL`, `aggregatorSQL`). Those fragments are compile-time constants.
- Custom-field keys come from the registry, never from input. Feeling emoji and label are bind parameters.
- Column aliases are positional (`m0`, `m1`, …), generated from the index in the request, never from input text.
- A test feeds every registry entry × every allowed aggregator through the builder. It asserts that the SQL contains no input-derived text and that `EXPLAIN` parses it.

---

## 3. GraphQL contract

### 3.1 Shared types (used by #751 and #752)

```graphql
# Metric registry. Optional dimensions are read from perspectives.custom_fields.
enum PerspectiveMetric {
  QUALITY
  AGREEMENT
  IMPORTANCE
  CONFIDENCE
  ORIGINALITY
  CLARITY
  DEPTH
  ENTERTAINMENT
  RIGOR
  RELEVANCE
  BIAS
  ACTIONABILITY
  FEELING
}

enum MetricAggregator {
  COUNT
  AVG
  MEDIAN
  MIN
  MAX
  STDDEV
}

# Which feeling a FEELING metric reads: exact emoji grapheme, optional
# case-insensitive label (same matching as feelingStats).
input FeelingKeyInput {
  emoji: String!
  label: String
}

# One metric. `feeling` is required when metric is FEELING and rejected otherwise.
input MetricRefInput {
  metric: PerspectiveMetric!
  feeling: FeelingKeyInput
}

# Inclusive range on a metric value, in storage units (0-10000).
# Rows where the value is missing never match.
input MetricRangeInput {
  metric: MetricRefInput!
  min: Float
  max: Float
}
```

### 3.2 #751: `contentMetrics`

```graphql
input MetricColumnInput {
  metric: MetricRefInput!
  aggregator: MetricAggregator!
}

# Range on an aggregated value, applied after aggregation (and after privacy
# suppression: a suppressed or missing cell never matches).
input MetricColumnRangeInput {
  column: MetricColumnInput!
  min: Float
  max: Float
}

# Exactly one of `column` or `contentField`. The column need not be among the
# requested `columns`; it is computed for sorting either way.
input ContentMetricsSortInput {
  column: MetricColumnInput
  contentField: ContentSortBy
  order: SortOrder!
}

# Which perspectives feed the aggregates (the viewer's choice).
enum ContentMetricsScope {
  # Public perspectives by anyone, one vote per user per content (the public
  # row, which is unique per user and content). Private rows never count.
  EVERYONE
  # The viewer's own perspectives only, one per content (public row first,
  # else the private one). Requires sign-in; empty page when anonymous.
  MINE
  # Reserved for the "Allow in aggregates" opt-in, which does not exist yet.
  # Rejected with an invalid-input error until that slice ships.
  INCLUDE_OPTED_IN_PRIVATE
}

# Every allowed aggregator for one cell's metric, over the same contributors
# and with the same gating as `value`. Returned only when gatherAll is true.
# For display (tooltip) only: sort and filter never read these.
type MetricAggregates {
  count: Int!
  avg: Float
  median: Float
  min: Float
  max: Float
  # Null when count < 2.
  stddev: Float
}

type MetricCell {
  # Aggregated value in storage units (0-10000; STDDEV on the same scale).
  # Null when nothing to aggregate (n = 0), when STDDEV has n < 2, or when
  # suppressed. COUNT is never null: it is n.
  value: Float
  # Contributors behind this cell: distinct users who set this metric.
  n: Int!
  # True when n is below the low-sample threshold (3). A hint, not a rule.
  lowSample: Boolean!
  # True when the privacy rule hid the value. Always false for EVERYONE and
  # MINE; used only by INCLUDE_OPTED_IN_PRIVATE once it exists. Present so the
  # UI handles it from day one.
  suppressed: Boolean!
  # The viewer's own value for this metric on this content (their public
  # perspective if they have one, else their private one). Null when
  # anonymous or unset. Under EVERYONE it is never part of `value`.
  mine: Float
  # Every aggregator for this metric; null unless gatherAll was requested.
  all: MetricAggregates
}

type ContentMetricsRow {
  content: Content!
  # Distinct users with a perspective in the population on this content.
  contributors: Int!
  # One cell per requested column, same order as the request.
  cells: [MetricCell!]!
  # The viewer's own perspective that `mine` reads from, if any.
  minePerspectiveID: ID
  minePrivacy: Privacy
}

type ContentMetricsPage {
  items: [ContentMetricsRow!]!
  pageInfo: PageInfo!
  totalCount: Int
  # Echoes the scope the numbers were computed over, for labels.
  scope: ContentMetricsScope!
}

extend type Query {
  contentMetrics(
    # One aggregator per column: it is what the cell shows, sorts and filters on.
    columns: [MetricColumnInput!]!
    filter: ContentFilter
    columnRanges: [MetricColumnRangeInput!]
    # Only content with at least this many contributors (default 0 = all).
    minContributors: Int = 0
    sort: ContentMetricsSortInput
    first: Int = 25
    after: String
    includeTotalCount: Boolean = false
    scope: ContentMetricsScope = EVERYONE
    # Also fill MetricCell.all with every aggregator for each column's metric.
    gatherAll: Boolean = false
  ): ContentMetricsPage!
}
```

**Design notes and trade-offs:**

- **Why a new top-level query and not `Content.metrics(columns)`:**
  - Server-side sort and filter on an aggregated value need the aggregation inside the list statement. A per-row field resolved by a dataloader cannot sort the list.
  - The query depends on the viewer (`mine`, content visibility). It must stay out of `LIST_CONTENT`, which is prefetched anonymously.
- **Reusing `ContentFilter`** gives the page the Library's existing filters for free: type, search, person, movie and book columns, dates, `addedByUsername`.
  - `minPerspectiveCount` inside `ContentFilter` keeps its current meaning (rows visible to the viewer). The page should use `minContributors` instead, which counts the aggregate population. The UI should not offer both. This is documented on the argument.
- **Limits** are **provisional** and guessed, not measured. Measure them with the k6 ramp per `.docs/CAPACITY_TESTING.md` before they become defaults:
  - `columns` holds 1–12 entries, at most 4 of them `FEELING`. The service returns `ErrInvalidInput` beyond that.
  - With `gatherAll: true`, the caps drop to **8 columns, at most 2 `FEELING`**. Each column then computes six aggregates, including an ordered-set MEDIAN, which sorts the column's values per group.
  - `first` is 1–100, matching `ListPerspectives`.
- **`gatherAll` is a request mode.** One column = one selected aggregator for the cell, sort and filter. `gatherAll` adds `cell.all` for tooltips and nothing else. A `sort.column` or `columnRanges` entry naming an aggregator other than its column's is still accepted (the sort column need not be displayed), but `cell.all` is never a sort or filter target.
- **`scope`** defaults to `EVERYONE`. `MINE` with no signed-in viewer returns an empty page and issues no SQL. `INCLUDE_OPTED_IN_PRIVATE` returns `ErrInvalidInput` ("not available yet") until slice B4. Declaring the value now keeps the later change additive in behaviour, and the frontend can type against it.
- **Sort stability:** the `content.id` tie-breaker follows the last rule's direction, as `buildContentSortRulesMulti` does.
- **Multi-column sort** (a metric, then another) is left out of v1, because one keyset over two computed values doubles the cursor surface. It can be added later as `sorts: [ContentMetricsSortInput!]`.

### 3.3 #752: extend `perspectives`

All additive. Existing callers send none of the new arguments and see no change.

```graphql
enum PerspectiveScope {
  # The viewer's own perspectives, public and private. Empty when anonymous.
  MINE
  # Public perspectives by anyone (including the viewer's public ones).
  PUBLIC
}

input PerspectiveFilter {
  userID: IntID
  contentID: IntID
  privacy: Privacy
  # new:
  scope: PerspectiveScope
  contentTypes: [ContentType!]
  metricRanges: [MetricRangeInput!]
}

# When set, takes priority over sortBy/sortOrder.
input PerspectiveMetricSortInput {
  metric: MetricRefInput!
  order: SortOrder!
}

extend type Query {
  # existing args unchanged, plus:
  # perspectives(..., metricSort: PerspectiveMetricSortInput): PaginatedPerspectives!
}

extend type Perspective {
  # This perspective's own value for each requested metric, in request order,
  # read through the same registry as contentMetrics (so an optional dimension
  # with a non-numeric or out-of-range custom_fields value reads as null here
  # exactly as it is skipped in aggregates). Computed from the loaded row: no SQL.
  metricValues(metrics: [MetricRefInput!]!): [Float]!
}
```

- **Default scope** is `MINE`, as #752 asks. The resolver passes `scope` through, and the service builds the predicate from the **authenticated viewer only**. It never trusts a client-supplied user id for `MINE`.
  - `PUBLIC` is `privacy = 'public'`, plus the existing content-privacy `EXISTS`.
  - With no `scope`, the existing owner-or-public rule (`RestrictToPublicOrOwner`) applies unchanged.
- **No de-duplication** on this page: a user's public and private rows on one content are two rows, as #752 says. `scope` makes the split explicit.
- **The drill-down from a #751 row** is `perspectives(filter: {contentID, scope: PUBLIC})`. The viewer's own private row comes from `scope: MINE`, or from `minePerspectiveID` on the #751 row.

### 3.4 Hexagonal boundaries (signatures only)

The domain types live in `core/domain/perspective_metrics.go`:

```go
// core/domain/perspective_metrics.go
type Metric string           // QUALITY ... FEELING
type MetricAggregator string // COUNT, AVG, MEDIAN, MIN, MAX, STDDEV
type ContentMetricsScope string // EVERYONE, MINE, INCLUDE_OPTED_IN_PRIVATE

type FeelingKey struct { Emoji string; Label *string }
type MetricRef struct { Metric Metric; Feeling *FeelingKey }
type MetricColumn struct { Ref MetricRef; Aggregator MetricAggregator }
type MetricColumnRange struct { Column MetricColumn; Min, Max *float64 }
type MetricRange struct { Ref MetricRef; Min, Max *float64 }

type ContentMetricsSort struct {
	Column       *MetricColumn
	ContentField *ContentSortBy
	Order        SortOrder
}

type ContentMetricsParams struct {
	Columns         []MetricColumn
	Filter          *ContentFilter
	ColumnRanges    []MetricColumnRange
	MinContributors int
	Sort            ContentMetricsSort
	First           int
	After           *string
	IncludeTotalCount bool
	Scope           ContentMetricsScope
	GatherAll       bool
	ViewerID        *int // from auth.ForContext, never client input
	// Set by the service from policy, not by callers:
	LowSampleBelow  int
}

type MetricCell struct {
	Value      *float64
	N          int
	LowSample  bool
	Suppressed bool
	Mine       *float64
	All        *MetricAggregates // nil unless GatherAll
}

type MetricAggregates struct {
	Count                         int
	Avg, Median, Min, Max, StdDev *float64
}

type ContentMetricsRow struct {
	Content           *Content
	Contributors      int
	Cells             []MetricCell
	MinePerspectiveID *int
	MinePrivacy       *Privacy
}

type ContentMetricsPage struct {
	Items      []*ContentMetricsRow
	HasNext    bool
	EndCursor  *string
	TotalCount *int
	Scope      ContentMetricsScope
}

// Validate checks registry membership, the allowed-aggregator table, feeling
// presence, the column caps (lower with GatherAll), that ranges are within
// 0-10000, and rejects the reserved INCLUDE_OPTED_IN_PRIVATE scope.
func (p ContentMetricsParams) Validate() error

// ValueOf reads one perspective's value for a metric through the registry
// (used by Perspective.metricValues and by tests as the reference oracle).
func (p *Perspective) ValueOf(ref MetricRef) *float64
```

The repository port is a **new** port, so the many `PerspectiveRepository` mocks under `test/` don't all break:

```go
// core/ports/repositories/perspective_metrics_repository.go
type PerspectiveMetricsRepository interface {
	// ContentMetrics returns one page of content rows with aggregated cells,
	// sorted and filtered on aggregated values, in ONE statement for any
	// number of columns (plus one COUNT only for an empty page past the end,
	// as GormContentRepository.List does).
	ContentMetrics(ctx context.Context, params domain.ContentMetricsParams) (*domain.ContentMetricsPage, error)
}
```

The #752 change extends `domain.PerspectiveListParams` additively (`Scope *PerspectiveScope`, `ContentTypes`, `MetricRanges`, `MetricSort *PerspectiveMetricSort`) and keeps `PerspectiveRepository.List` as is. No new method.

The service is a new port with real rules, not a pass-through:

```go
// core/ports/services/perspective_metrics_service.go
type PerspectiveMetricsService interface {
	// ContentMetrics validates the request against the registry and caps,
	// resolves the scope (MINE without a viewer: empty page, no SQL; the
	// reserved opt-in scope: ErrInvalidInput), fixes the privacy thresholds
	// from policy (callers can't lower them), and maps repository errors.
	ContentMetrics(ctx context.Context, params domain.ContentMetricsParams) (*domain.ContentMetricsPage, error)
}
```

`PerspectiveService.ListPerspectives` gains the `scope` rule: `MINE` with a nil viewer returns an empty page and no SQL, and `MINE` ignores any `filter.userID`.

The resolver `queryResolver.ContentMetrics` lives in `perspective.resolvers.go`. Mapping between models and domain goes once in `resolvers/helpers.go` (`modelToContentMetricsParams`, `contentMetricsPageToModel`). `ContentMetricsRow.content` is filled from the same statement, so it never goes through `ContentByID`.

---

## 4. SQL strategy

### 4.1 One grouped statement

Shape of the statement (illustrative; `$n` are bind parameters):

```sql
SELECT m.* , (SELECT COUNT(*) FROM (<same m without keyset/limit>) t) AS total_count   -- only when includeTotalCount
FROM (
  WITH vc AS (                       -- content the viewer may read, with ContentFilter applied
    SELECT content.* FROM content
    WHERE <ContentFilter predicates, reused from GormContentRepository.List>
      AND <applyContentVisibility(viewer)>
  ),
  votes AS (                         -- ONE vote per user per content
    SELECT DISTINCT ON (p.content_id, p.user_id)
           p.id, p.content_id, p.user_id, p.quality, p.agreement, p.importance,
           p.confidence, p.custom_fields, p.feelings
    FROM perspectives p
    JOIN vc ON vc.id = p.content_id
    WHERE <scope predicate>          -- EVERYONE: p.privacy = 'public'
                                     -- MINE:     p.user_id = $viewer
    ORDER BY p.content_id, p.user_id, (p.privacy = 'public') DESC, p.id
  ),
  agg AS (
    SELECT v.content_id,
           COUNT(*) AS contributors,
           -- one pair per requested column (its single selected aggregator),
           -- alias by position:
           AVG(v.quality)        AS m0_raw, COUNT(v.quality)   AS m0_n,
           STDDEV_POP(v.agreement) AS m1_raw, COUNT(v.agreement) AS m1_n,
           AVG(<cf_num('clarity')>) AS m2_raw, COUNT(<cf_num('clarity')>) AS m2_n
           -- gatherAll only: the other aggregates for each column's metric,
           -- in the same GROUP BY (no extra statement, no extra scan):
           -- , AVG(v.quality) AS m0_avg, percentile_cont(0.5) WITHIN GROUP (ORDER BY v.quality) AS m0_median,
           --   MIN(v.quality) AS m0_min, MAX(v.quality) AS m0_max, STDDEV_POP(v.quality) AS m0_sd, ...
           -- Columns sharing a metric share these expressions (computed once per metric).
    FROM votes v GROUP BY v.content_id
  ),
  f0 AS (                            -- one CTE per FEELING column
    SELECT v.content_id, AVG(x.i) AS raw, COUNT(x.i) AS n
    FROM votes v
    CROSS JOIN LATERAL (
      SELECT MAX((f->>'intensity')::float8) AS i
      FROM unnest(v.feelings) f
      WHERE f->>'emoji' = $1 AND ($2::text IS NULL OR lower(f->>'label') = lower($2))
    ) x
    WHERE x.i IS NOT NULL
    GROUP BY v.content_id
  ),
  mine AS (                          -- viewer's own row, public first; absent when anonymous
    SELECT DISTINCT ON (p.content_id) p.content_id, p.id, p.privacy, p.quality, ...
    FROM perspectives p JOIN vc ON vc.id = p.content_id
    WHERE p.user_id = $viewer
    ORDER BY p.content_id, (p.privacy = 'public') DESC
  )
  SELECT vc.*,
         COALESCE(agg.contributors, 0) AS contributors,
         jsonb_build_array(
           jsonb_build_object('v', <gate(m0)>, 'n', COALESCE(agg.m0_n,0), 'mine', mine.quality
                              -- gatherAll only:
                              , 'all', jsonb_build_object('avg', agg.m0_avg, 'median', agg.m0_median,
                                       'min', agg.m0_min, 'max', agg.m0_max, 'sd', <gate_sd(m0)>)),
           ...
         ) AS cells,
         <gate(sort column)> AS sort_value,
         mine.id AS mine_perspective_id, mine.privacy AS mine_privacy
  FROM vc
  LEFT JOIN agg  ON agg.content_id = vc.id
  LEFT JOIN f0   ON f0.content_id  = vc.id
  LEFT JOIN mine ON mine.content_id = vc.id
) AS m
WHERE m.contributors >= $minContributors
  AND <column ranges on gated values>
  AND <keyset condition added by the paginator>
ORDER BY COALESCE(m.sort_value, <null replacement>) <dir>, m.id <dir>
LIMIT $first + 1;
```

Key choices:

- **The `votes` CTE (`DISTINCT ON (content_id, user_id)`) is the one-vote rule.**
  - Its `ORDER BY ... (privacy = 'public') DESC` is ADR 0002 section 7's "public row wins".
  - **`EVERYONE`:** the predicate is `privacy = 'public'`. With 000038 applied the reduction is a no-op. Without it (any environment where 000038 isn't applied yet), it stops a duplicated public row from counting twice.
  - **`MINE`:** the predicate is `user_id = $viewer`. The viewer's public row wins over their private one on the same content, so `n` ≤ 1 per content.
    - On this scope, a per-content aggregate is the viewer's own rating: MIN = MAX = AVG, and STDDEV is always null.
    - It is still useful as "my ratings as metric columns", with the same sort and filter machinery.
    - The `mine` CTE is skipped, because `value` already is the viewer's own.
  - **`INCLUDE_OPTED_IN_PRIVATE` (B4):** the predicate becomes `privacy = 'public' OR allow_in_aggregates`, and the k-threshold gating of section 5.2 applies.
- **`gatherAll` stays one statement.**
  - The extra aggregates are more expressions in the same `agg` (and in each feeling CTE). They are emitted once per **distinct metric** among the columns, not once per column.
  - Only the cell JSON reads them. `sort_value` and the `columnRanges` predicates read only the selected aggregator's gated expression, so `gatherAll` can't change ordering or filtering.
  - Cost: MEDIAN is an ordered-set aggregate that sorts each group's values. That is why the caps are lower with `gatherAll` (section 3.2). The cost is unmeasured.
- **A derived table instead of HAVING.**
  - The paginator appends its keyset condition with `Where(...)` (verified in `paginator.go appendPagingQuery`). On a grouped query that would land before `GROUP BY` and could not see the aggregate.
  - Wrapping the grouped query as `FROM (...) AS m` lets column ranges, `minContributors` and the keyset all be plain `WHERE`s on `m`. The paginator is used unchanged: rule key `SortValue` with `SQLRepr: "m.sort_value"` and a `NULLReplacement`, the existing `computedSortSelects` pattern.
- **Cells as one `jsonb` column.**
  - The number of columns varies per request, but the paginator encodes its cursor from a fixed Go struct.
  - Scanning `cells jsonb` + `sort_value *float64` + `content.*` into one struct keeps the cursor machinery intact. The repository unmarshals `cells` into `[]domain.MetricCell`.
- **Sort and filter on the gated value.**
  - `gate(mK)` applies, in this order: STDDEV with n < 2 → NULL; suppressed → NULL; otherwise the raw value.
  - Sorting, ranges and the cell all read the same gated expression. A hidden value can then never leak through ordering or through a `columnRanges` probe.
  - Missing and suppressed values sort **last** in both directions (`NULLReplacement` low for DESC, high for ASC, as `contentSortRule` does).
- **The `content` sort fallback** (`ContentMetricsSort.ContentField`) reuses `contentSortRule` on `m`. Its `SQLRepr` expressions reference `content` columns that `m` carries through `vc.*`.
- **Custom fields:** `cf_num(key)` = `CASE WHEN jsonb_typeof(v.custom_fields -> 'key') = 'number' AND (v.custom_fields ->> 'key')::float8 BETWEEN 0 AND 10000 THEN (v.custom_fields ->> 'key')::float8 END`. The key is a registry constant.
  - Without the guard, one perspective holding `"clarity": "high"` would make the cast fail and error the whole page, since the backend stores `custom_fields` unvalidated.
  - Values outside the range are skipped, not clamped.
  - `jsonb_typeof` with `->` avoids the `?` operator, the same GORM `Raw()` placeholder pitfall `CustomFieldStats` documents.
- **Feelings:**
  - Unnesting `feelings` inside the main `GROUP BY` would multiply rows and skew every other column. So each FEELING column is its own CTE.
  - Inside it, a per-perspective `MAX(intensity)` collapses a feeling listed twice in one perspective. That is the case `FeelingStats` guards with `COUNT(DISTINCT p.id)`.
- **COUNT** is `COUNT(x)`: rated values, not perspectives.
  - `contributors` is the row-level count of distinct users in the population.
  - `n` per cell is the per-metric count. The two differ because every metric is optional.

### 4.2 Scale

**Unverified.** A read-only row count against Neon was attempted and denied, and the repo records no table sizes; deployed figures are kept out of git by convention (`CAPACITY_REGISTER.md`). From repo evidence:

- **perspectives:** the 000038 header calls the table "small", and the hand-deleted ids it names (13, 14, 30) suggest the low hundreds of rows at most. **Guess.**
- **content:** imports add up to 5,000 rows per admin batch (`CAPACITY_REGISTER.md`, import row cap). So content can be thousands of rows, most of them with **zero** perspectives.
- **Consequence for the page:** an "All Items" view over all content would be mostly empty rows. Recommend that the UI default to `minContributors: 1` (D5).
  - The statement still scans `vc` for the content filter. That costs the same as today's `content` list.
  - The `votes` CTE touches only perspectives on `vc`, which at the guessed size is trivial.

### 4.3 Indexes

**No new index in v1.**

| Access path | Served by |
|---|---|
| `votes`: perspectives by `content_id` | `idx_perspectives_content_id` (000029); already pinned in `test/roundtrips/indexes_test.go` |
| `mine`: perspectives by `user_id` + `content_id` | `uq_perspectives_user_content_privacy (user_id, content_id, privacy)` (000038), or `idx_perspectives_user_created` (000029) where 000038 is not applied |
| `vc`: content filter and visibility | the existing content list paths, unchanged |
| #752 `scope: MINE` ordered by a rating | `idx_perspectives_user_created` narrows to the user; the sort over one user's rows is in memory |

Following backend/CLAUDE.md and the `db-migration` agent rule ("an index only with measured evidence"):
- the roundtrips index test gets a `votes`-shaped case asserting `idx_perspectives_content_id`;
- a covering partial index, for example `(content_id) INCLUDE (user_id, quality, agreement, importance, confidence) WHERE privacy = 'public'`, is proposed **only** if `EXPLAIN (ANALYZE)` on production-sized data shows the `votes` CTE dominating.
- A precomputed summary table is the escape hatch at a much larger scale. It is out of scope.

### 4.4 #752 SQL

`GormPerspectiveRepository.List` gains:

- **scope:**
  - `MINE` → `user_id = viewer`. `RestrictToPublicOrOwner` becomes moot, because the viewer can read their own rows.
  - `PUBLIC` → `privacy = 'public'`.
  - The existing content-privacy `EXISTS` stays in both cases.
- **contentTypes:** `EXISTS (SELECT 1 FROM content c WHERE c.id = perspectives.content_id AND c.content_type IN ?)`. It folds into the existing `EXISTS`, so the statement count doesn't change.
- **metricRanges:** `WHERE <source expr> BETWEEN ? AND ?`, with the same registry expressions as section 4.1. A FEELING source becomes a scalar subquery over `unnest(feelings)`.
- **metricSort:** a paginator rule with `SQLRepr` = the source expression, a `NULLReplacement` so unrated rows sort last, and the matching `computedSortSelects` entry so the cursor can be built. This is the same pattern as content.
- **Total count:** fold it into the page statement as a scalar subquery, as `GormContentRepository.List` does. Today it is a separate statement. This saves one round trip and is optional.

---

## 5. Privacy

### 5.1 Why the population matters more than the threshold

Public perspectives are individually readable: through `perspectives` today, and through the #752 page once it exists. If any private value is mixed into an aggregate, an attacker can **subtract the public values they can read**:

- **MIN / MAX** reveal a private value exactly whenever it lies outside the public range, **at any n**.
- **STDDEV and MEDIAN**, combined with the readable public values and the cell's `n`, narrow a private value to one or two candidates at small private counts.
- **AVG and COUNT** reveal the **sum** of the private values (`AVG × n − Σpublic`). With one private contributor, that sum is that person's value.

So a threshold on the **total** `n` protects nothing. The threshold has to count **private contributors**, and the leakiest aggregators must never see private rows.

### 5.2 Proposed rules

**v1, shipping with the page.** The viewer chooses the population with `scope` (owner decision D1). The default is `EVERYONE`.

1. **`EVERYONE` is public perspectives on content the viewer may read**, one vote per user per content, public row wins.
   - This is ADR 0002 section 5 ("always counted in aggregates") together with section 6 ("aggregates off" by default for private rows).
   - There is nothing to suppress, so `suppressed` is always `false`.
2. **Under `EVERYONE`, the viewer's own private row is never in `value`.** It comes back only as `mine`, to the viewer.
   - This keeps the shared number identical for every viewer of the same content, with no differencing between viewers.
   - It also means a user's private-only opinion shows on their own page without affecting anyone's numbers.
   - **Private rows never enter the shared number by default.** That is the ADR 0002 rule, and only B4's per-row opt-in can change it.
3. **`MINE` is the viewer's own perspectives, public or private.**
   - It is the viewer's own data, so there is nothing to suppress.
   - It is never cached or shared across viewers: the key carries the viewer (section 6.4).
   - Anonymous callers get an empty page.
4. **`INCLUDE_OPTED_IN_PRIVATE` is declared but rejected** until B4. The "Allow in aggregates" setting **does not exist on `main`**: no column, no mutation field and no UI.
5. **`lowSample`** is set when `n < 3`, as a UX hint.
   - STDDEV is `null` when `n < 2`, matching the `FeelingStats` rule that the spread of one value is undefined, not 0.
   - The same gating applies inside `cell.all` when `gatherAll` is on.
6. **Content privacy dominates.** `vc` applies `applyContentVisibility`, so the perspectives on another user's private content are never aggregated for anyone else.
   - The service already stops others from attaching to private content (`requireVisibleContent`).
   - Draft or imported perspectives are private by convention (glossary "Draft perspective"), so v1 excludes them automatically.

**Later, the "Allow in aggregates" slice (B4, scope `INCLUDE_OPTED_IN_PRIVATE`), which needs a migration:**

7. Add `allow_in_aggregates boolean NOT NULL DEFAULT false` on `perspectives`, owner-settable per row (ADR 0002 section 6).
8. **The per-user reduction stays "public wins".** A user's opted-in private row counts only when they have no public row on that content (section 7). One vote per user is preserved.
9. **AVG and COUNT** (and SUM, if it is ever enabled) may include opted-in private rows **only when at least `k = 3` private contributors remain** after excluding the viewer's own row.
   - Below that threshold, the cell falls back to its public-only value and sets `suppressed: true`, meaning "private contributions withheld".
   - The UI shows the public-only value with a marker. It does not blank the cell. **Alternative:** hide the cell entirely (D4).
10. **MIN, MAX, STDDEV and MEDIAN stay public-only, always**, for the reason in section 5.1.
    - This includes the same fields inside `cell.all` under `gatherAll`. Otherwise the tooltip would reopen exactly the differencing channel that the column rules close.
11. **Time differencing**, comparing a cell before and after one opt-in, is an accepted residual risk at k = 3.
   - Mitigation: return AVG **rounded to 100 storage units** (0.1 on the displayed scale) whenever private rows are included.
   - Owner decision D4.

### 5.3 Owner guards

- Both queries are reads. The viewer is always `auth.ForContext`; `contentMetrics` takes no user id argument.
- `scope: MINE` derives the user from the session. A client `filter.userID` combined with `MINE` is ignored.
- Rows the viewer cannot read are simply absent. Nothing returns `FORBIDDEN` (ADR 0002 threat 3).

### 5.4 Interaction with the public/private split, and the existing aggregates

The **existing** aggregates now have problems that this page would make visible next to them:

| Where | Today | Problem since 000038 | Proposal |
|---|---|---|---|
| `AggregateByContentIDs` → `perspectiveCount`, `averageRating`, `qualityRatingCount` | every row, every privacy | counts rows, not users: a user with both slots counts twice, and their private quality is averaged in, and everyone can read the result | slice **B0, its own normal PR** (owner decision D3): count users, not rows, under the rule the owner confirmed. A user holds at most one public and one private perspective per content (`000038_perspectives_unique_per_user_content_privacy`; production was de-duplicated by hand on 2026-11-17, and the migration is not yet marked applied). B0 picks one vote per user, public wins (ADR 0002 section 7), and keeps private rows out of the shared number. **Not dark**: it changes shipped numbers |
| Port doc `AggregateByContentIDs` ("public-perspective count") | wrong | misleads callers | fix with the above |
| `CountVisibleByContentIDs`, `minPerspectiveCount` | visible rows | a viewer with both slots counts 2 for themselves | count distinct `user_id` in the same PR |
| `FeelingStats`, `CustomFieldStats` | all rows | don't yet follow this spec's population and visibility rules, and count a user with both slots twice | slice B0, tracked in the private bug backlog: apply the population rule of section 5.2 and reduce per user |
| `Compare.svelte`, onboarding counts | listed as at-risk in the multiple-perspectives spec | **not re-verified here** | covered by that spec's audit |

### 5.5 ADR 0002 and glossary updates to make (flagged, not edited here)

- **ADR 0002 status** ("nothing here is built yet") and **section 1** ("one perspective per user per item … as today") are stale. Section 3's two-slot rule is built for content subjects by `000038_perspectives_unique_per_user_content_privacy`. Perspective-on-perspective subjects are not built.
- **ADR 0002 Consequences, "Migration precondition"**: done for production by a manual de-duplication. The 000038 header carries the pre-check query for other environments.
- **ADR 0002 section 7** should name the population rule:
  - n is distinct users;
  - the shared number (`EVERYONE`) is public-only until the opt-in exists;
  - `MINE` is the viewer's own;
  - MIN, MAX, STDDEV and MEDIAN are never opt-in.
- **ADR 0002 section 6** should note that "Allow in aggregates" is not built: no column or setting exists on `main`.
- **Glossary "Aggregate"** ("public and private alike. Privacy governs who can read a perspective, not whether it counts") contradicts ADR 0002 section 6. Once D3 is decided, rewrite it to the population rule, and add terms for **Contributor**, **Aggregator** and **Metric**.

---

## 6. Query budget

### 6.1 Statement counts per request (warm auth cache)

| Request | Statements | Notes |
|---|---|---|
| `contentMetrics`, any number of columns (1 or 12, feelings included), `includeTotalCount: false` | **1** | page + cells + `mine` in one statement |
| same, `includeTotalCount: true` | **1** | total as a scalar subquery |
| same, `gatherAll: true` (up to 8 columns, 2 feelings) | **1** | the extra aggregates are expressions in the same `GROUP BY` |
| `scope: MINE`, signed in | **1** | the same statement with the viewer predicate |
| `scope: MINE` anonymous, or `INCLUDE_OPTED_IN_PRIVATE` | **0** | empty page / invalid input from the service |
| same, empty page past the end with `includeTotalCount` | **2** | the extra COUNT, mirroring `GormContentRepository.List` |
| `contentMetrics` selecting `content { primaryCategory addedBy }` | 1 + existing loaders | category (cached repo, 0 when warm), users loader +1 |
| invalid request (unknown pair, too many columns) | **0** | rejected in the service |
| `perspectives(scope: MINE, metricSort, metricRanges)` selecting `user` and `content` | **3** (page, users, content) | **4** with `includeTotalCount` today; **3** if the count is folded in (section 4.4) |
| `perspectives(scope: MINE)` anonymous | **0** | empty page from the service |
| `Perspective.metricValues` | **0** | computed from the loaded row |

### 6.2 Tests to add

The repository tests use sqlmock in `internal/adapters/repositories/postgres/query_count_test.go`:

- `TestQueryCount_ContentMetrics_OneStatementForAnyColumnCount`: 1 column and 12 columns (4 FEELING) each `AssertExactly(t, 1)`.
- `TestQueryCount_ContentMetrics_TotalCountFolded`: `includeTotalCount` → 1; an empty page past the end → 2.
- `TestQueryCount_ContentMetrics_GatherAllSameStatement`: 8 columns with `gatherAll` → `AssertExactly(t, 1)`.
- `TestQueryCount_ContentMetrics_ScopeMine`: signed in → 1.
- `TestQueryCount_PerspectiveList_MetricSortAndRanges`: page only → 1; with total → 1 if folded, else 2.

The service tests live in `test/services/`:

- validation table (registry × aggregator, feeling presence, caps, ranges) → 0 repository calls on rejection;
- tests that `perspectives(scope: MINE)` and `contentMetrics(scope: MINE)` with no viewer, and `contentMetrics(scope: INCLUDE_OPTED_IN_PRIVATE)`, make 0 calls;
- the lower column caps under `gatherAll`.

The whole-request tests go in `test/roundtrips`. These are real Postgres, `RT_MEASURE=1` to print:

- `TestContentMetricsPage`: 4 users, 6 columns including a feeling and an optional dimension, `includeTotalCount` → `h.roundTrips(1, …)`.
- `TestContentMetricsOneVotePerUser`: one user with a public and a private row → `contributors == 1`. The private value is absent from `value` and present in `mine` for that user only. Another viewer sees the same `value` and `mine: null`.
- `TestContentMetricsGatherAllDoesNotChangeOrder`: the same request with and without `gatherAll` returns the same row order, the same `value`s and the same page boundaries. `cell.all` agrees with separate single-aggregator requests. Costs `h.roundTrips(1, …)`.
- `TestContentMetricsScopeMine`: the viewer's own public row wins over their private one on the same content. Another user's rows never count. Costs `h.roundTrips(1, …)`.
- `TestContentMetricsSortByStddevAcrossCursor`: pages with `first: 2`, ASC and DESC. Missing and STDDEV-n<2 cells come last both ways. This is the same bounded-loop shape as `TestListContentByAddedBy`.
- `TestContentMetricsBadCustomFieldValue`: a perspective with `custom_fields: {"clarity": "high"}` and one with `99999` → the page still loads, and both are skipped in `n`.
- `TestContentMetricsFeelingListedTwice`: the same emoji twice in one perspective counts once.
- `TestContentMetricsPrivateContentHidden`: another user's private content never appears and never contributes.
- `TestPerspectivesMetricSortScopeMine`: `h.roundTrips(3, …)`.
- `indexes_test.go`: add a `votes`-shaped case asserting `idx_perspectives_content_id`.

### 6.3 Dataloaders

- v1 needs **no new loader**. Cells arrive with the row, and `ContentMetricsRow.content` is built from the same statement.
- If the details modal later wants cells for one content (`Content.metrics(columns)`), that field must go through a loader keyed by `{ViewerID, columnsKey, ContentID}`, the same shape as `VisiblePerspectiveKey`. Its test must prove that N loads make 1 service call.

### 6.4 Frontend cache contract

- **New key root:** `queryKeys.metrics.list({ viewerId, columns, filter, columnRanges, minContributors, sort, first, after, includeTotalCount, scope, gatherAll })`. Every variable the `queryFn` sends goes in the key; the aggregator lives in `columns`.
  - Switching a column's aggregator changes `columns`, so it refetches.
  - A tooltip-only UI should request `gatherAll` once as part of the page query. Fetching it on hover would add a fetch per hover.
  - `viewerId` is in the key because `mine` and content visibility depend on the viewer (ADR 0002 threat 5).
  - Sign-out must evict `metrics.all()`.
- **Never prefetch it anonymously** from `+page.ts`, the way `LIST_CONTENT` is prefetched.
- **staleTime ~30–60 s** (the list rule).
- **Eviction:** perspective create, update and delete, and content delete, invalidate `metrics.lists()` exactly.
  - Today `useCreatePerspective` / `useUpdatePerspective` invalidate `perspectives.lists()` and `content.detail(id)` only. They need `metrics.lists()` added, with a real-`QueryClient` `invalidationOutcome` test.
  - `metrics.lists()` is not under `content.lists()`, so Library list invalidations don't refetch the metrics page, and the reverse also holds.
- **#752** reuses `perspectives.lists()` under a new `byQuery` branch whose key carries `scope`, `metricSort`, `metricRanges` and the viewer. Optimistic patches stay limited to the `byUser` / `byContent` branches.

---

## 7. Semantics the API returns

- **Scale:** every `value`, `mine` and range bound is in **storage units (0–10000)**.
  - Display divides by 1000 for every aggregator except COUNT. STDDEV and MEDIAN scale linearly, so the same divisor applies.
  - Suggested formatting: AVG, MEDIAN, MIN and MAX to one decimal; STDDEV to two decimals with a "±" prefix in tooltips; COUNT as an integer.
- **Missing is not zero:**
  - `value: null` means nothing to aggregate (`n = 0`), STDDEV with `n < 2`, or `suppressed`. The UI shows an empty cell, never 0.
  - **COUNT is the one non-null aggregator.** Its `value` equals `n`, and `0` is a true count.
  - Whether the UI renders a COUNT of 0 as "0" or blank is a UI choice; the API states the fact.
- **Low sample:** `lowSample: true` when `n < 3`. The threshold is a domain constant, so the UI does not hard-code it.
- **Sort:** null cells (missing, undefined STDDEV, suppressed) sort **last** in both directions.
- **Filter:** a `columnRanges` bound never matches a null cell.
- **A row with no contributors** still appears (all cells null, COUNT 0) unless `minContributors >= 1`.
- **Scope** is echoed on the page (`EVERYONE` / `MINE`), so headers and tooltips can say "public perspectives, one per person" or "your perspectives".
- **`cell.all`** (only with `gatherAll`) uses the same contributors and gating as `value`: `count` is never null, `stddev` is null below 2, and the rest are null at `n = 0`.

---

## 8. What the frontend designs must assume

Use this to reconcile the UI preview with the backend contract.

1. **The row unit (#751)** is a content item. The row carries `contributors` (distinct people) plus one cell per column, in the order requested.
2. **Each cell has** `value` (storage units; may be null), `n` (people who rated this metric), `lowSample`, `suppressed` and `mine` (the viewer's own value or null).
   - Show "n = …" from `n`, not from `contributors`.
   - Show "yours" from `mine`.
3. **One aggregator per column.** The choices are COUNT, AVG, MEDIAN, MIN, MAX and STDDEV. **There is no SUM** for rating metrics (D2).
   - The selected aggregator is what the cell shows, sorts on and filters on.
   - The header chip must reserve the widest label. Of the visible aggregator labels, "median" and "std dev" are the longest.
   - **Tooltip:** request `gatherAll: true` and `cell.all` carries every aggregator for that metric. It is display only and never a sort or filter target.
4. **Metrics:** 4 standard + 8 optional dimensions (the `AddFieldSearch` list) + feelings by emoji.
   - Up to **12 columns, at most 4 feelings** per request.
   - With `gatherAll`: **8 columns, at most 2 feelings**.
   - Both caps are provisional.
5. **Scope is a viewer control.**
   - **`EVERYONE`** (default) is public perspectives, one per person. The viewer's private rating never changes the shared number; it appears only as `mine`.
   - **`MINE`** is the viewer's own perspectives, so each cell has n ≤ 1. Hide STDDEV and spread visuals there, or show them disabled.
   - `INCLUDE_OPTED_IN_PRIVATE` exists in the schema but is rejected until "Allow in aggregates" ships. Don't offer it in the UI yet.
   - `suppressed` is always false until then, but render a marker for it.
6. **Missing is blank, never 0.** STDDEV is blank below 2 raters.
   - `lowSample` (fewer than 3 raters) deserves a visual hint, e.g. muted text or a "small sample" badge.
7. **Sort and filter on any column work server-side** in All Items mode. Nulls always sort last.
   - The filter uses a range in display units, converted ×1000 by the client.
8. **Most content has no perspectives.** A "has perspectives" default (`minContributors: 1`) is recommended. Showing every content row means a page of mostly empty rows.
9. **The cache key includes the viewer.** There is no anonymous prefetch, and the page loads after sign-in state is known.
10. **The drill-down from a content row** to its perspectives is `perspectives(filter: {contentID, scope: PUBLIC})`, plus the viewer's own via `scope: MINE` or `minePerspectiveID`.
11. **The #752 rows** are individual perspectives with raw values (`quality`, …, plus `metricValues(metrics)` for optional dimensions and feelings). There is no aggregator.
    - The default scope is MINE; PUBLIC is the alternative.
    - A user's public and private rows on one content are two rows, and `privacy` says which.
12. **Optional-dimension values that aren't valid numbers read as null** on both pages, consistently.
13. **The details modal's existing `perspectiveCount` / `averageRating`** count differently today (all rows, all privacy) until D3 lands. The new page must not show them side by side with its own numbers without a label.

---

## 9. Migrations, rollout and slices

**Migrations:**
- **v1 needs none.** 000038 is the only schema dependency, and v1 is correct without it, thanks to the `votes` reduction.
- The opt-in slice later adds `allow_in_aggregates boolean NOT NULL DEFAULT false`. Check the next free number on `main` at that time. The migration is written and reviewed only, never applied in dev.

**Rollout ("dark backend", `.docs/RELEASE_APPROACHES.md`):** backend slices merge to `main` additively while nothing calls them. The frontend lives on an integration branch.

| # | Slice | Kind | Contents |
|---|---|---|---|
| B0 | Bring the existing aggregates onto this spec's rules | **normal PR (user-visible)** | `FeelingStats` / `CustomFieldStats` on the section 5.2 population, reduced per user; `AggregateByContentIDs` per D3; `CountVisibleByContentIDs` counts distinct users; port doc fixed; tests creating both slots for one user. Glossary and ADR 0002 updates ride here |
| B1 | Metric registry | dark | `domain` registry, enums, `Perspective.ValueOf`, `ContentMetricsParams.Validate`, `gqlgen.yml` bindings, frontend sync test. No query yet |
| B2 | `contentMetrics` | dark | new port + service + GORM repository, schema + resolver, scopes `EVERYONE` and `MINE` (the reserved value rejected), querycount + roundtrips + index test |
| B2b | `gatherAll` | dark (additive argument + nullable field) | `MetricAggregates`, the extra per-metric expressions, the lower caps, the order-invariance roundtrip. Can ship inside B2 if B2 stays reviewable |
| B3 | `perspectives` extensions for #752 | dark | `scope`, `contentTypes`, `metricRanges`, `metricSort`, `Perspective.metricValues`, optional count folding, tests |
| B4 | Allow in aggregates (later; does not exist on `main` today) | migration → dark → normal | column, mutation input field, scope `INCLUDE_OPTED_IN_PRIVATE` enabled, k-threshold suppression (also inside `cell.all`), AVG rounding, differencing tests |
| F* | Frontend #751 / #752 | merge-gated on the integration branch | per the UI and desktop design |

- B0 is independent and should go first.
- B1 → B2 → B3 are stacked or sequential.
- B4 waits on its own ADR 0002 implementation spec (opt-in UI, mutation and tiebreak).

---

## 10. Owner decisions

**Decided:**

| # | Decision | Outcome |
|---|---|---|
| D1 | Population for aggregates | **Viewer's choice via `contentMetrics(scope:)`**: `EVERYONE` (default: public, one vote per user, public wins), `MINE`, and `INCLUDE_OPTED_IN_PRIVATE` reserved for B4. Private rows never enter the shared number by default (ADR 0002). "Allow in aggregates" does not exist on `main` yet. |
| D2 | Aggregators per column | **One aggregator per column** for display, sort and filter, chosen from COUNT, AVG, MEDIAN, MIN, MAX and STDDEV (no SUM for ratings). An optional **`gatherAll`** mode returns every aggregator in `cell.all` for the tooltip only. |
| D3 | The existing `perspectiveCount` / `averageRating` / `qualityRatingCount` | Rule confirmed: at most one public and one private perspective per user per content (000038). **B0 stays its own normal PR** and fixes the row-versus-user double counting: one vote per user, public wins (ADR 0002 section 7). |

**Still open (my recommendation):**

| # | Decision | Recommendation |
|---|---|---|
| D4 | Below-threshold behaviour once private opt-in exists | k = **3 private contributors** (viewer excluded) for AVG/COUNT, public-only fallback with `suppressed: true`, AVG rounded to 0.1. MIN/MAX/STDDEV/MEDIAN never include private rows. |
| D5 | Page default: all content or content with perspectives | `minContributors: 1` by default, with an "include unrated" toggle. |
| D6 | #752 default scope and anonymous access | Default **MINE**. Anonymous viewers see PUBLIC only. Should the #751 page be visible signed out at all? Recommended yes, public numbers only. |
| D7 | Closed metric enum vs free-form custom-field keys | **Closed enum** (the eight optional dimensions). Add keys by registry entry. |
| D8 | Low-sample threshold | `n < 3`, as a domain constant. |
| D9 | Request caps: 12 columns / 4 feelings; with `gatherAll` 8 columns / 2 feelings; `first` ≤ 100 | Accept as provisional; measure both modes with the k6 ramp before treating them as defaults. |
| D10 | Fold `perspectives`' separate COUNT into the page statement (B3) | Yes. It saves one round trip and matches the content list. |

---

## 11. Not verified

- **Table sizes and the distribution of perspectives per content.** The read-only Neon query was denied. The section 4.2 sizes and the claim that "most content has no perspectives" are guesses from repo evidence. A k = 3 threshold could hide most cells if most content has 1–2 contributors; that matters only for B4, since v1 doesn't suppress.
- **Whether 000038 is applied in production.** Its PR's label says unapplied. v1 does not depend on it.
- **The frontend double-counting sites** (`Compare.svelte`, onboarding) were not re-read. They come from the multiple-perspectives spec's audit.
- **The SQL in section 4.1 is a design sketch**, not run against Postgres. The derived-table-plus-paginator approach rests on reading `paginator.go` (`appendPagingQuery` uses `Where`). Its interaction with `WithAllowTupleCmp` over `m.sort_value` should be proven first in B2's cursor roundtrip test.
- **The request caps and the planner cost** of four feeling CTEs, and of `gatherAll`'s per-metric MEDIAN, are unmeasured.
