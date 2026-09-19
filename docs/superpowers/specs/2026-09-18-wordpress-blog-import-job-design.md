# WordPress Blog Import Job — Design

Status: draft for review. **Not implementing yet.** Scope: admin-triggered import first; user-requested import is a later phase that reuses the same tables and worker.

## Problem

We want to bring posts from a WordPress blog into Perspectize as content that perspectives can attach to. Ingestion today is synchronous and single-item (`CreateFromYouTube`); there is no job, worker, or queue. A blog import is many items, slow, partly fails, and needs a human review step before anything reaches the `content` table.

## Decisions already made

| Topic | Decision |
|---|---|
| Trigger | Admin screen first; user-requested "request import" later, once trusted |
| Execution | DB-backed job tables + in-process worker (no external queue) |
| Output | One `Content` row per post (`contentType` = `BLOG_POST`, url = permalink); re-runs dedupe on URL |
| Stored data | Derived metadata only: title, author, permalink, published date, featured image URL, word count. Body is discarded after the word count is computed |
| Later feature | Short excerpt, lazy-loaded into the description area (as YouTube's description). Out of scope here |
| Source scope | Self-hosted WordPress exposing `/wp-json/wp/v2/posts` |

## User flow (control surface)

RBAC-gated admin screen: **Import Jobs**.

1. **Create New Import Job** button → admin pastes a blog URL.
2. **Probe.** Backend checks whether it is a WordPress site and returns metadata: site name, total post count (`X-WP-Total`), total pages (`X-WP-TotalPages`). Not WordPress → clear error, no job created.
3. **Choose scope:** import none · import all · import the N newest (or oldest). See open item 1 about "most read / most liked".
4. **Start.** A job is created and begins fetching.
5. **Job list** shows, per job: job #, status, status detail, started time, original estimated time to completion, time remaining, elapsed time.
6. **Review.** When fetching finishes, the job enters `awaiting_review`. Admin sees every fetched post and ticks the ones to exclude (`excluded_from_import`; `NULL` and `false` both mean included).
7. **Approve.** Included items are promoted into `content`. Per-item outcome is recorded.

## Pipeline

Three stages connected by channels, each with one responsibility. Everything is checkpointed in Postgres, so a restart resumes rather than restarts.

```
fetch goroutine  ──chan──▶  stage goroutine  ──▶  import_job_items (staging)
                                                        │
                                              admin review (exclude flags)
                                                        │
                                          promote goroutine ──▶ content
```

1. **Fetch:** pulls pages from the WordPress REST API (`per_page=100`, custom User-Agent, `_fields` trimmed, `X-WP-TotalPages` for progress, polite delay between pages). Computes word count from the HTML-stripped, entity-decoded body, then drops the body. Emits post records on a channel.
2. **Stage:** reads the channel and inserts rows into the staging table. Commits the job's `next_page` checkpoint in the same transaction as the page's rows, so resume never double-counts or skips.
3. **Promote (after approval):** for each staged row where `excluded_from_import IS NOT TRUE`, creates the `Content` via the existing `ContentService`/repo (validation and URL dedupe reused, not duplicated). Records the result on the staging row: `imported`, `skipped_duplicate`, or `failed` + error text.

### Job state

`queued → fetching → awaiting_review → promoting → succeeded`, plus `failed` and `cancelled` reachable from any active state. The worker claims jobs with `SELECT … FOR UPDATE SKIP LOCKED` so it is safe with more than one server instance, and re-claims unfinished jobs after a restart.

### ETA

The original estimate is computed once at start (pages remaining × a rolling average of page latency) and frozen. Time remaining is recomputed as the job runs; elapsed comes from `started_at`. Both are derived at read time from stored timestamps and counters, not stored.

## Data model (sketch, not final)

Migration number: next free after `000021` at implementation time (re-check open PRs, per CLAUDE.md). SQL only; applied manually per environment, and the PR must say so.

`import_jobs`: `id`, `source_url`, `status`, `status_detail`, `scope` (`none|all|newest|oldest`) + `scope_limit`, `total_pages`, `next_page`, `fetched_count`, `imported_count`, `skipped_count`, `failed_count`, `estimated_seconds`, `started_at`, `finished_at`, `requested_by`, `created_at`.

`import_job_items` (one shared staging table, `job_id` FK): `id`, `job_id`, `permalink` (unique per job), `title`, `author`, `published_at` (from `date_gmt`), `image_url`, `word_count`, `excluded_from_import boolean NULL`, `import_status`, `import_error`, `content_id` (set on promote).

Deviation from the original sketch: a **single** staging table keyed by `job_id` rather than a new `job_xxxxxx` table per job. Per-job tables mean DDL at runtime, awkward migrations, and cleanup jobs; a shared table gives the same review behavior with an index on `job_id`.

## GraphQL (admin-only)

- Mutations: `probeBlog(url)`, `createImportJob(input)`, `setImportItemsExcluded(jobId, itemIds, excluded)`, `approveImportJob(id)`, `cancelImportJob(id)`.
- Queries: `importJobs`, `importJob(id)`, `importJobItems(jobId, pagination)`. The UI polls `importJob` for progress.

## Safety (built in now, because user-requested import makes the URL untrusted)

- Only `http`/`https`. Refuse private, loopback, and link-local addresses, checked **at dial time** (not just at URL parse) so DNS rebinding cannot bypass it. Re-check on redirects.
- Response size cap, per-request timeout, per-job page cap, fixed User-Agent with contact address.
- Honor `429`/`5xx` with bounded retry and backoff; fail the page, not the whole job, after retries are exhausted.
- Admin-only for now. When opened to users: per-user concurrent-job limit, per-user daily cap, and a lower page cap.

## Frontend

Admin route gated by the existing role check (see open item 2). Components and the states each must be tested:

- **Create-job dialog:** URL entry → probing → not-WordPress error → probe result with scope choices (none/all/newest N) → submitting.
- **Job list:** each status renders its own detail and timing columns (queued, fetching with live progress, awaiting review, promoting, succeeded, failed, cancelled).
- **Review table:** no items excluded / some excluded / all excluded; bulk toggle; approve disabled when nothing is included.

Single-state, static visuals do not need unit tests.

## Testing

- **Adapter:** pagination via `X-WP-TotalPages`, missing/blocked embedded author, missing featured image, entity and `<script>` handling in word count, non-WordPress site, 429/5xx retry.
- **Safety:** each blocked address class, redirect to a private address, oversize body.
- **Worker:** checkpoint-and-resume after a simulated crash mid-page, `SKIP LOCKED` claim by two workers, cancel mid-fetch.
- **Promote:** excluded (`true`) vs `NULL`/`false` handling, duplicate URL → `skipped_duplicate`, partial failure leaves the job `succeeded` with `failed_count > 0` visible.
- **Resolvers:** admin-only enforcement on every operation.

## Open items

1. **"Most read / most liked" is not available from core WordPress REST.** Core `orderby` supports date, title, and similar, but no views or likes; that data exists only if a plugin (e.g. Jetpack stats) exposes it. Proposal: ship `newest`/`oldest` and treat popularity ordering as a later, per-plugin enhancement. Decide before implementation.
2. **Does an admin role exist?** The spec assumes an RBAC check that can gate the route and every resolver. Confirm what exists in the Clerk-derived identity work; if not, that is a prerequisite.
3. **"Import status file"**: read here as the per-item `import_status`/`import_error` on the staging row plus the job-level counters. If a downloadable report file was intended, add it as an export from the job screen.
4. **Retention:** how long staging rows are kept after `succeeded`/`cancelled` (proposal: purge after 30 days).
5. **Cross-type URL uniqueness:** `UNIQUE(url)` on `content` already blocks the same URL under two types; confirm that is acceptable for blog posts.
6. **WordPress.com-hosted blogs** use a different API and are out of scope unless wanted.

## Boundary

Out of scope: excerpts, user-requested import UI, scheduled re-sync, popularity ordering, WordPress.com API, non-WordPress sources.
