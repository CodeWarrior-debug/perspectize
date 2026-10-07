# Movie content type: morning handover

Branch: `feature/movie-content-type`. Spec: `docs/superpowers/specs/2026-10-07-movie-content-type-design.md`. Plan: `docs/superpowers/plans/2026-10-07-movie-content-type.md` (if present alongside this file).

## (a) What was built

- Spec and plan: `6b3bbfc0` design, `807032d1` implementation plan.
- Task 1, schema: `bce67eda` MOVIE content type, CAST/DIRECTOR search fields, sort values and `personId` filter.
- Task 2, TMDB adapter: `4bbbc27e` TMDB adapter, `MovieClient` port and fixtures.
- Task 3, service: `385b8cc5` `createContentFromMovie` service, resolver and wiring.
- Task 4, repository: `fcd1dd80` movie sort rules, cast/director search, person filter and GIN index migration (not applied).
- Task 5, formatters: `db26c54b` shared h:mm:ss duration formatter, money and vs-budget formatters.
- Task 6a, Add Movie: `364821d8` Add Movie form, `createContentFromMovie` query and hook, TMDB image CSP.
- Task 6b, columns: `e657ba76` Movie columns, cast renderer, money and duration cells, default column set; `ec52117a` unknown-last comparators for Rated, Box office and Vs. budget, Duration header kept within grid width.
- Task 7: preview rebuild and this file (`docs(movie): rebuild Movie preview from the amended spec; add overnight status handover`).

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
- [ ] Verify using `make migrate`-free steps only (no `make migrate-*` against the shared database).
- [ ] Review the spec's "Decisions to confirm" list.
- [ ] Decide on the pre-PR follow-ups below.

## (d) Known follow-ups

- Pre-PR: the `response` blob is now selected on every list row, which roughly doubles the wire size of YouTube rows; proper fix is a backend field (e.g. `movie: JSON`/typed `MovieDetails` returned only for MOVIE rows) selected instead of `response`.
- `personId` filter exists in the backend but has no UI (pair it with the MOVIE type filter because the GIN index is partial).
- Per-type default-column switch flow with toast/revert is issue #559 and is NOT built (the Movie default set is applied only when the type filter is exactly movie).
- Source vs user tags is issue #560.
- Rated has no value-list filter.
- Released, TMDB Score and Cast are not sortable (Genre is not sortable either).
- Mobile card list and details modal have no Movie fields.
- Item header still says "Item".
- `ActivityDetailsModal` still says "Length".
- Movie Tags filter only works in Loaded mode.
- CAST/DIRECTOR search scopes in Loaded mode scan all rows.
- Theatrical-release certification preference in the TMDB adapter (a deferred fix).
- The deferred minors are tracked in the SDD ledger (`.superpowers/sdd/2026-10-07-movie-content-type-plan/progress.md`, git-ignored scratch).

## (e) Rulings I made

- T5 vs existing YouTube tests: `formatDuration` rendered `142:00`-style for an hour or more. Ruling: change to h:mm:ss (user asked) and update the affected tests. Cost if wrong: YouTube durations of an hour or more display differently; revert is one branch in the shared formatter.
- Ruling: execute all tasks continuously with no human gates, because the owner delegated the overnight run. Cost if wrong: owner reviews the branch in the morning; nothing is pushed or merged.
- Ruling: split Task 6 into 6a (queries, hook, `movie.ts` validator, `AddMoviePopover`, CSP) and 6b (COLUMNS entries, Movie default column set, renderers/getters, `ActivityTable` visibility) run sequentially, since one dispatch would span about 10 files with design judgment. Cost if wrong: one extra review cycle. 6a BASE=db26c54b.
- Ruling: `@auth` on `createContentFromMovie` accepted, since it matches sibling mutations. Cost if wrong: none (unauthenticated callers are refused).
- Ruling: no worktree; work stays on `feature/movie-content-type` in the main checkout (owner's explicit branch plan; no other session editing it). Cost if wrong: a dirty tree collides with a concurrent session.
- Ruling (this task): Tags left out of the preview grid because the preview validator caps columns at 10. Cost if wrong: the preview under-represents the default set; the app itself has the column.
