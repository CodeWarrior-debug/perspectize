# Custom columns and saved items: design

⚠️ Written without superpowers loaded — a superpowers-enabled session should review via writing-plans before this is executed

Status: draft, awaiting approval. Nothing here is built.
Intent: [calculated-columns](../../../project-management/intents/calculated-columns.md) (this spec narrows it: formulas run in the browser only).
Related: [ADR 0002 sharing model](../../adr/0002-sharing-model.md), [Domain guide: Privacy](../../../.docs/DOMAIN_GUIDE.md#privacy).

## Goal

A signed-in person builds their own column in the UI, on the fly, with no column decided in advance. The column is computed in the browser from fields the row already has. They can keep it private or share it, and others can copy or link it.

The first worked example is **Bang for Buck**: TMDB score per $1M of budget. It is an example only. The builder, not any one column, is the product.

## Part 1: One store for saved things

### Decision

One table, `user_saved_items`, holds everything a person saves: formulas now, and later themes, views (column set, filters, sort) and settings. A `type` column limits what a row may be. Privacy is built in, matching ADR 0002.

### Schema (migration 000039, written and reviewed only; never applied during dev)

```sql
CREATE TABLE IF NOT EXISTS public.user_saved_items (
    id serial NOT NULL,
    user_id integer NOT NULL,
    type text NOT NULL,
    name varchar(100) NOT NULL,
    payload jsonb NULL,
    payload_version integer NOT NULL DEFAULT 1,
    privacy text NOT NULL DEFAULT 'private',
    origin text NOT NULL DEFAULT 'own',
    source_id integer NULL,
    deleted_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz NOT NULL DEFAULT NOW(),
    CONSTRAINT user_saved_items_pk PRIMARY KEY (id),
    CONSTRAINT user_saved_items_id_type_unique UNIQUE (id, type),
    CONSTRAINT user_saved_items_user_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT,
    CONSTRAINT user_saved_items_source_fk FOREIGN KEY (source_id, type) REFERENCES public.user_saved_items (id, type) ON DELETE RESTRICT,
    CONSTRAINT user_saved_items_type_check CHECK (type IN ('formula', 'theme', 'view', 'setting')),
    CONSTRAINT user_saved_items_privacy_check CHECK (privacy IN ('public', 'private')),
    CONSTRAINT user_saved_items_origin_check CHECK (origin IN ('own', 'copy', 'link')),
    CONSTRAINT user_saved_items_setting_private_check CHECK (type <> 'setting' OR (privacy = 'private' AND origin = 'own')),
    CONSTRAINT user_saved_items_link_no_payload_check CHECK (origin <> 'link' OR payload IS NULL),
    CONSTRAINT user_saved_items_own_no_source_check CHECK (origin <> 'own' OR source_id IS NULL),
    CONSTRAINT user_saved_items_copy_link_source_check CHECK (origin = 'own' OR source_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS user_saved_items_user_type_name_unique
    ON public.user_saved_items (user_id, type, name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS user_saved_items_source_idx ON public.user_saved_items (source_id);
```

Notes:

- **Privacy default is `private`.** This deliberately differs from the repo default (`public`): a half-built formula should not leak. The Privacy glossary entry gets a line saying so.
- **`payload` is nullable with no default**, per the JSONB convention. Only a link has none.
- **`(source_id, type)` references `(id, type)`**, so a copy or link always has the same type as its source.
- **`updated_at`** uses the existing `update_updated_at` trigger.
- **Idempotent DDL** (`IF NOT EXISTS`, drop-then-create for the trigger), as in 000031.
- Privacy stays exactly two values (ADR 0002 §4). Sharelists and criteria rules are not built here.

### Copy and link (the person chooses, copy is the default)

- **Copy** duplicates the payload into a new private row: `origin = 'copy'`, `source_id` set for credit. The copy is theirs; later edits to the original do not reach it. If the source later becomes unreadable the credit reads "no longer available".
- **Link** stores no payload (`origin = 'link'`). The source's payload is read by a join in the same query, so the owner's edits flow through. If the source is private or deleted, the link shows "no longer available". A link can be turned into a copy while the source is still readable.
- No link chains: a link's source must itself be `own` or `copy`.
- A link's audience is never wider than its source's (ADR 0002 §8).
- Only public items can be copied or linked. Owners are not told who did.

### Soft delete

- Delete sets `deleted_at`. Every read filters `deleted_at IS NULL` through **one repository scope**, with a test per read path.
- The UI offers an Undo toast (`toastWithAction`, 4 s). No trash page in v1.
- A deleted source makes its links show "no longer available"; copies are unaffected.
- Account deletion follows today's reassign-to-`[deleted]` rule until issue #754 settles user soft delete. `UserService.Delete` gets a `ReassignByUser` call for this table. In one UPDATE it sets `user_id` to the sentinel, appends ` (#<id>)` to the name (as todo lists do, so two deleted users with the same name can't collide on the unique index), sets `privacy = 'private'` and sets `deleted_at` if unset. A deleted account's items therefore vanish and links to them show "no longer available"; copies keep their credit as "no longer available". A retention purge is a follow-up tied to #754.
- **Copying onto a name you already use** adds " (copy)" to the new row's name, then " (copy 2)", " (copy 3)" and so on until free. Creating or renaming an item to a name already in use is a typed error (`ErrAlreadyExists`) the UI shows.

### API shape

One table, one service, one repository underneath. On the wire, distinct types:

- A GraphQL `interface SavedItem` with `SavedFormula`, `SavedTheme`, `SavedView`, `SavedSetting`. Only `SavedFormula` ships in this work; the others are listed so the shape is not a rewrite later.
- Per-type reads (`mySavedFormulas`, `sharedFormulas`) and typed create/update inputs. The formula payload is a `JSON` field validated in the backend.
- Shared, id-based operations return the interface: `deleteSavedItem`, `restoreSavedItem`, `setSavedItemPrivacy`, `copySavedItem`, `linkSavedItem`, `convertLinkToCopy`.
- Rules from the repo apply: owner guard at resolver, service and SQL; by-id read of someone else's private row returns `null`; list reads return public rows plus the viewer's own; writes enforce ownership in the `WHERE`.
- Go has one payload struct per type; the frontend has a TypeScript type and a hook per type on one generic hook.
- Query budget: list reads are one page statement (plus count only when asked). A link's payload comes from the same statement. A query-count test and a `test/roundtrips` entry pin this.

### Delivery

Dark backend ([RELEASE_APPROACHES](../../../.docs/RELEASE_APPROACHES.md)): the migration and API ship first, unused. Migration is applied by hand per environment at rollout.

## Part 2: Custom columns, computed in the browser

### Scope

- Formulas run **in the browser only**. The stored formula is an expression tree; a TypeScript evaluator reads it. No Go-to-SQL compiler in this work, so the intent's server-side parity requirement is out of scope here and the intent should say so when this spec is approved.
- **Library, Loaded mode** (client-side row model, up to 100 rows): the column shows, sorts and filters like a built-in column.
- **Library, All Items mode:** values show for the current page; sorting and filtering by the custom column are off, because the server cannot evaluate it. The header says why.
- **Plan** is a follow-up grid (it needs its own Loaded/All toggle first; intent Phase 0).
- No SQL, no runtime DDL, no new GraphQL sort or filter arguments.

### Operands

A formula can use any numeric field a row already carries, plus the person's own ratings. Each content type registers its numeric operands in one frontend catalogue, so a new type's fields become usable without touching the evaluator (a step added to the Adding a Content Type guide).

Movies: TMDB score, vote count, budget, box office, runtime, release year, my overall, my importance, my agreement.

**No YouTube statistics are operands.** Issue #793 removes the shipped derived columns because YouTube's API policy forbids metrics calculated from like counts, and the same reasoning covers views and comments. YouTube rows can still use non-YouTube-sourced numbers (length, age in library, my ratings).

**TMDB terms (decided).** TMDB's API terms bar making "derivatives" of TMDB content without defining the word, and have no carve-out for calculations. Decision: a custom column is the user's own calculation in their own browser, not something Perspectize makes, so movie operands go ahead. Conditions that stay: TMDB attribution (logo and notice) where the app already shows it; stored TMDB data refreshed within the terms' 6-month cache limit; no commercial use of TMDB content; a column built from TMDB fields is labelled as the user's own calculation (header tooltip: "Your calculation from TMDB score and Budget"), never as a TMDB figure. This reading is the owner's call and has not been confirmed with TMDB.

**Formula tree shape.** A node is exactly one of `{"op": "<function>", "args": [...]}`, `{"const": <number>}` or `{"operand": "<key>"}`. The function name is the `op` key; there is no separate `fn` node.

Missing is not zero (Decision 8). A formula with a missing operand gives no value: the cell is blank and the row sorts last. `coalesce` lets the author choose a fallback.

### Builder: steps first, then "Edit as formula" (option C)

Chosen after mockups of a formula bar (A), guided steps (B) and the combination (C).

- The default editor is **steps**: "Start with [TMDB score], then divided by [Budget] in $ millions". Money columns offer "in $ millions" so nobody types 1000000.
- **Edit as formula** opens the full formula bar for anything steps cannot express (`min(a, b)`, groups). Both write the same stored tree. Going from formula back to steps works only when the formula is a simple top-to-bottom chain; otherwise it stays a formula and says so.
- Live preview on the person's own loaded rows, with a count of rows that have no value.
- Fields: name, subtitle (shown on header hover), number format, optional content-type scope, privacy (private by default).
- Plain errors that name the closest real columns ("There's no column called [Rating]. Did you mean [TMDB score] or [My overall]?").
- Everything is from a fixed catalogue: operands, numbers and a small set of functions. Node count and depth are capped. Division by zero gives no value.

### Two steps that need plain words

Money-per-score ratios are dominated by tiny denominators: in the mockup a $40K film scores 173 while most films score under 1. Two steps address this, named for what they do, not how they are computed.

1. **Compress big gaps** (internally `log10`). Offered next to any step with a long tail, with a one-line explanation and a before/after on the person's own rows: "Each step up means 10× bigger, so one tiny budget stops swamping everything. A $40K film and a $400K film now sit one step apart." Shown as a toggle on the step; the formula bar still accepts `log10(x)`. Zero or negative input gives no value, and the preview says so.
2. **Compare to the rest** (z-score). Turns a value into how many standard deviations above or below the average of the **loaded rows**: 0 is typical, +1 clearly above, −2 far below. It puts different columns on one scale, which is what a weighted blend ("70% score, 30% value") needs.
   - Because it depends on the rows loaded, it changes with filters and paging. The column header and tooltip say "vs these N loaded rows".
   - It is unavailable in All Items mode (no full population in the browser).
   - Needs at least 5 rows with a value; below that it gives no value. Zero spread gives 0, not an error.

Recommendation: lead with **Compress big gaps** for ratios and long-tailed counts, and offer **Compare to the rest** when blending two columns. The stored tree has an aggregate node for the second, so the evaluator takes the population as an argument and stays pure.

### Display and discoverability

- Custom columns sit in their own "Custom columns" group in the column picker and carry an ƒ mark in the header.
- Header tooltip: name, subtitle, formula, owner or "linked from @name", privacy.
- Column layouts (`perspectize:activityColumns:v1`) reference a custom column by saved-item id; a layout naming a deleted or unreadable item drops it silently and the picker shows it as unavailable. A v2 layout migration is needed.
- Shared-columns picker follows Decision 8: what it is, the formula, last updated, how many people use it, its top result on the viewer's loaded rows, and "—" for missing, never 0. **Use a copy** is primary, **Link instead** secondary. "Used by" counts show only from 5 users up so small totals cannot identify anyone (ADR 0002 §6 aggregate rule). Authors never see who used a column.

## Testing

- Evaluator: table-driven unit tests for every function, missing operands, division by zero, caps, log of non-positive, z-score edge cases (fewer than 5 rows, zero spread).
- Steps ⇄ formula round-trip tests.
- Component tests for each distinct builder state: steps, formula, error, preview with missing values, private/public, All Items off-state.
- Backend: owner guard, null for another user's private row, soft-delete scope on every read path, copy/link rules and constraints, query counts, round trips.
- Frontend cache contract: query keys include the viewer; revoke and delete evict (ADR 0002 threat 5).

## Out of scope

Themes, views and settings payloads (the table and API shape allow them); server-side evaluation; Plan grid; sharelists and criteria rules; trash page; weighted-blend builder beyond steps plus formula.

## Open questions

1. ~~TMDB terms for derived columns~~ Decided: proceed, with the conditions in the Operands section.
2. Should a custom column be limited to chosen content types, or always offered?
3. Should the mobile card list show custom columns?
4. Show "Used by" counts at all?
5. ~~Update the intent~~ Done: the intent links this spec and notes it narrows the server-parity outcome.
