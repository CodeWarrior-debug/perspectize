# Movie content type: morning handover

Branch: `feature/movie-content-type`. Spec: `docs/superpowers/specs/2026-10-07-movie-content-type-design.md`. Plan: `docs/superpowers/plans/2026-10-07-movie-content-type-plan.md`.

## (a) What was built

- Spec and plan: `6b3bbfc0` design, `807032d1` implementation plan.
- Task 1, schema: `bce67eda` MOVIE content type, CAST/DIRECTOR search fields, sort values and `personId` filter.
- Task 2, TMDB adapter: `4bbbc27e` TMDB adapter, `MovieClient` port and fixtures.
- Task 3, service: `385b8cc5` `createContentFromMovie` service, resolver and wiring.
- Task 4, repository: `fcd1dd80` movie sort rules, cast/director search, person filter and GIN index migration (not applied).
- Task 5, formatters: `db26c54b` shared h:mm:ss duration formatter, money and vs-budget formatters.
- Task 6a, Add Movie: `364821d8` Add Movie form, `createContentFromMovie` query and hook, TMDB image CSP.
- Task 6b, columns: `e657ba76` Movie columns, cast renderer, money and duration cells, default column set; `ec52117a` unknown-last comparators for Rated, Box office and Vs. budget, Duration header kept within grid width.
- Task 7: `8b4317f5` `docs(movie): rebuild Movie preview from the amended spec; add overnight status handover` (preview rebuild and this file).
- Backend clean-up: `15c1ebf4` `fix(movie): backend review follow-ups (theatrical certification, size-capped TMDB reads, context errors, JSON-null-safe people search, resolver tests)`.
- Frontend and docs clean-up: `fix(movie): frontend and docs review follow-ups (formatter boundary tests, Duration label, status handover)` (formatter boundary tests, the details modal now says "Duration", this file updated).
- Final fix wave: `6eea0490` `fix(movie): unknown-last server sorts, movie field instead of response payload, round-trip coverage, partial-index-friendly person filter` (backend); and `fix(movie): select movie field in list, TMDB attribution in details, scope and IMDb-id consistency, status updates` (frontend and docs: list selects `movie` instead of `response`, TMDB attribution in the details modal for movie rows, hidden search scopes dropped, IMDb id pattern aligned to `tt\d{5,}`, same-name people test, this file).

The rebuilt preview is `tools/content-type-designer/previews/movie-activity.html`, built from `tools/content-type-designer/previews/movie-activity.spec.json`. The `content-type-preview` skill (engine, validator, `examples/`) is not on this branch: it lives on `chore/content-type-preview-skill` (commit `6625d888`). The spec was built with that branch's `build.mjs` from a scratch copy. The preview tool caps at 10 columns and the app has 11 (it adds Tags), so Tags is shown in the details view only. Film facts and scores in the preview are illustrative.

## (b) Not verified

- No live TMDB token: the adapter is tested only on hand-built fixtures.
- Migration `000030` (partial GIN index) is written and NOT applied anywhere; its number is provisional.
- No browser verification of any UI. This is a user-visible PR, so it needs the `needs-demo-video` label per `.docs/PR_WORKFLOW.md`.
- The Duration header ellipsis at 111px is unverified.

## (c) Morning checklist

- [ ] Set `TMDB_API_READ_ACCESS_TOKEN` in each environment by hand.
- [ ] Re-check the migration number (`000030`) against main, then apply it manually per environment.
- [ ] Add one real movie via the Add Movie button and check the grid.
- [ ] Open the grid at lg and mobile widths, with the Movie filter and with the YouTube default.
- [ ] Try Cast search with scope Director and with scope Cast.
- [ ] Review the spec's "Decisions to confirm" list.
- [ ] Decide on the pre-PR follow-ups below.
- [ ] Decide how to land the preview skill: this branch's rebuilt `tools/content-type-designer/previews/movie-activity.html` and branch `chore/content-type-preview-skill` (6625d888, which holds the skill and the older preview) both add that path, so whichever merges second hits an add/add conflict. Resolve by keeping this branch's rebuilt version, and move `movie-activity.spec.json` into `.claude/skills/content-type-preview/examples/movie.spec.json` once the skill is on the branch.

Note: verify with migrate-free steps only (no `make migrate-*` against the shared database).

## (d) Known follow-ups

- `personId` filter exists in the backend but has no UI (pair it with the MOVIE type filter because the GIN index is partial).
- Per-type default-column switch flow with toast/revert is issue #559 and is NOT built (the Movie default set is applied only when the type filter is exactly movie).
- Source vs user tags is issue #560.
- Rated has no value-list filter.
- Released, TMDB Score and Cast are not sortable (Genre is not sortable either).
- Mobile card list and details modal have no Movie fields.
- Item header still says "Item".
- Movie Tags filter only works in Loaded mode.
- CAST/DIRECTOR search scopes in Loaded mode scan all rows.
- Studio picker column and the TMDB person-page link in the cast tooltip: both promised by the spec, not built.
- Deploy order: the backend must deploy before the frontend. A frontend ahead of the backend gets GraphQL validation errors for the MOVIE filter, the `movie` field and the Add Movie mutation.
- Migration `000030` collides with branch `claude/bible-passage-hermeneutic-field-hebiut`, which also adds `000030_add_hermeneutic_approach`. Rename to the next free number on main just before merge.
- No adult-title guard: TMDB returns `adult: true` titles by id and their posters would show to every viewer. A product decision.
- Inherited cursor bug C-02 for computed sort keys: BoxOffice, VsBudget and AgeRating are `gorm:"-"` fields, so the paginator encodes 0 in the cursor and pages 2+ in All mode can skip rows (same as Views, Likes and % Liked).
- `core/services` imports `adapters/tmdb` for `ParseMovieInput`/`CanonicalMovieURL`. This copies the YouTube import and is a hexagonal-rule exception to unwind later.
- TMDB attribution is now shown in the details modal for movie rows, but the TMDB logo is not.
- Round-trip statement counts for `createContentFromMovie` (new = 2, duplicate = 1) are unverified against a database (the tests skip without `DATABASE_URL`). Run them with `RT_MEASURE=1` against the local demo Postgres before trusting them.
- The server-side ascending sort now puts unknown last via sentinel NULLReplacement values (2^53, 99, 1e18). Check pagination across pages with a real DB.
- Deferred minors (the SDD ledger is git-ignored scratch and will not survive a fresh checkout, so they are listed here):
  - `formatMoneyCompact` for values >= 1e12 renders "$1000B" (no unit above B).
  - A tiny positive vs-budget ratio renders "0%" after rounding.
  - `tmdbScoreValueGetter` treats `voteAverage` 0 with votes > 0 as unknown.
  - The `?f.type=movie` deep link briefly shows the YouTube layout until the first animation frame.
  - `durationComparator` (pre-existing) sorts unknown durations first when ascending.
  - The width tests parse `ActivityTable.svelte` source text (fragile).
  - The Duration header at 111px may ellipsize next to the sort/filter icons (not checked in a browser).
  - The partial GIN index only helps when the query also filters `content_type = 'movie'`.
  - `parseDurationInput('1:30:99')` returns 5499 (seconds >= 60 are accepted, not rejected); pinned in `tests/unit/formatting.test.ts`.

## (e) Rulings I made

- T5 vs existing YouTube tests: `formatDuration` rendered `142:00`-style for an hour or more. Ruling: change to h:mm:ss (user asked) and update the affected tests. Cost if wrong: YouTube durations of an hour or more display differently; revert is one branch in the shared formatter.
- Ruling: execute all tasks continuously with no human gates, because the owner delegated the overnight run. Cost if wrong: owner reviews the branch in the morning; nothing is pushed or merged.
- Ruling: split Task 6 into 6a (queries, hook, `movie.ts` validator, `AddMoviePopover`, CSP) and 6b (COLUMNS entries, Movie default column set, renderers/getters, `ActivityTable` visibility) run sequentially, since one dispatch would span about 10 files with design judgment. Cost if wrong: one extra review cycle. 6a BASE=db26c54b.
- Ruling: `@auth` on `createContentFromMovie` accepted, since it matches sibling mutations. Cost if wrong: none (unauthenticated callers are refused).
- Ruling: no worktree; work stays on `feature/movie-content-type` in the main checkout (owner's explicit branch plan; no other session editing it). Cost if wrong: a dirty tree collides with a concurrent session.
- Ruling (this task): Tags left out of the preview grid because the preview validator caps columns at 10. Cost if wrong: the preview under-represents the default set; the app itself has the column.
