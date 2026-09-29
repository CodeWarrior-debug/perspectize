# Phase 17: YouTube URL Normalization and Duplicate Upsert - Research

**Researched:** 2026-02-22
**Domain:** YouTube URL normalization, PostgreSQL unique constraints, GORM upsert, idempotent API design
**Confidence:** HIGH

## Summary

Phase 17 addresses two tightly coupled concerns: (1) normalizing all YouTube URL variants to a single canonical form before storing or deduplication-checking, and (2) changing `CreateFromYouTube` from an error-returning duplicate check to an idempotent upsert that returns the existing record. These concerns are inseparable because normalization must happen before any uniqueness comparison.

The current system stores the raw user-supplied URL as the deduplication key and uses a two-step TOCTOU pattern (SELECT then INSERT). This means `https://www.youtube.com/watch?v=abc123` and `https://youtu.be/abc123` are treated as different videos even though they refer to the same content. The fix involves: extracting the video ID early (already supported), building a canonical URL (new), looking up/inserting by canonical URL (modified repository), and returning the existing record rather than an error on duplicate.

The current database schema already has a `UNIQUE(url)` constraint on `content.url` (from migration 000001, retained after migration 000010 dropped `UNIQUE(name)`). The canonical URL becomes the correct value for this constraint. The GORM upsert pattern uses `clause.OnConflict{DoNothing: true}` followed by a SELECT — or alternatively `FirstOrCreate` — to achieve idempotency without a separate pre-check. No `external_id` column is needed: the canonical URL itself is the stable, unique identifier.

**Primary recommendation:** Use `NormalizeYouTubeURL(videoID string) string` to produce `https://www.youtube.com/watch?v=<videoID>` as the canonical URL. Replace the service-level TOCTOU check with a repository-level `GetOrCreateByURL` method using GORM `clause.OnConflict{DoNothing: true}` + SELECT, relying on the existing DB UNIQUE constraint. The GraphQL mutation signature stays unchanged — it always returns `Content!`.

## Standard Stack

### Core (already in use — no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `gorm.io/gorm` | v1.25.x | ORM with upsert clause support | Already project ORM |
| `gorm.io/gorm/clause` | (bundled) | `clause.OnConflict` for INSERT ON CONFLICT | Official GORM upsert API |
| `github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/youtube` | local | `ExtractVideoID` already parses all URL forms | Already extracts video ID |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `net/url` (stdlib) | Go stdlib | URL construction for canonical form | Building `https://www.youtube.com/watch?v=<id>` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| GORM `clause.OnConflict{DoNothing: true}` + SELECT | `FirstOrCreate` | `FirstOrCreate` is application-level (still TOCTOU under concurrent load); `OnConflict` is DB-atomic |
| Canonical URL as unique key | New `external_id` column | External_id is more forward-compatible but adds schema complexity not needed for v1 |
| Canonical URL as unique key | Keep raw URL, normalize only for lookup | Inconsistent stored data — canonical is simpler and more correct |

**Installation:** No new dependencies required.

## Architecture Patterns

### Recommended Layering

```
adapters/youtube/parser.go        # Add NormalizeYouTubeURL(videoID) string — pure function
core/ports/repositories/          # Add GetByVideoID or keep GetByURL (takes canonical URL)
core/ports/repositories/          # Add GetOrCreateByURL (new method) — OR modify Create
core/services/content_service.go  # Normalize URL, then call GetOrCreateByURL
adapters/repositories/postgres/   # gorm_content_repository.go — implement GetOrCreateByURL
backend/migrations/               # New migration: 000012_add_content_external_id_index.up.sql
                                  #   (index only — constraint already exists on url)
frontend/src/lib/utils/youtube.ts # Already handles same URL variants — no changes needed
```

### Pattern 1: NormalizeYouTubeURL (pure function in parser.go)

**What:** Convert any valid YouTube video ID to a single canonical URL form.
**When to use:** Called immediately after `ExtractVideoID` succeeds, before any DB lookup.
**Canonical form:** `https://www.youtube.com/watch?v=<videoID>` — shortest standard watch URL, no extra params.

```go
// Source: derived from existing parser.go patterns
// In backend/internal/adapters/youtube/parser.go

// NormalizeYouTubeURL returns the canonical watch URL for a YouTube video ID.
// Example: "dQw4w9WgXcQ" -> "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
func NormalizeYouTubeURL(videoID string) string {
    return "https://www.youtube.com/watch?v=" + videoID
}
```

**Where it fits:** After `ExtractVideoID` returns `videoID`, call `NormalizeYouTubeURL(videoID)` to get the URL to store and look up. The raw user-supplied URL is NOT stored.

### Pattern 2: Idempotent CreateFromYouTube (service layer)

**What:** Replace TOCTOU check-then-create with normalize-then-upsert.
**When to use:** On every `createContentFromYouTube` mutation call.

```go
// Source: current content_service.go + this pattern
func (s *ContentService) CreateFromYouTube(ctx context.Context, url string, userID int) (*domain.Content, error) {
    // 1. Extract video ID (validates URL format)
    videoID, err := s.youtubeClient.ExtractVideoID(url)
    if err != nil {
        return nil, fmt.Errorf("%w: %v", domain.ErrInvalidURL, err)
    }

    // 2. Normalize to canonical URL — this is the stored key
    canonicalURL := s.youtubeClient.NormalizeURL(videoID)

    // 3. Attempt upsert — returns existing if already present
    existing, err := s.repo.GetOrCreateByURL(ctx, canonicalURL, userID)
    if err != nil {
        // ...handle errors
    }
    return existing, nil
}
```

**Key change:** URL validation (via `ExtractVideoID`) happens BEFORE the duplicate check. The old code checked by raw URL first, which means a variant URL would skip deduplication and then fail at the parser stage with a confusing error flow.

### Pattern 3: Repository GetOrCreateByURL (atomic upsert)

**What:** Database-level idempotency using GORM `clause.OnConflict`.
**When to use:** Content creation — always, replaces current `Create`.

```go
// Source: GORM docs + existing gorm_content_repository.go patterns
// In gorm_content_repository.go

// GetOrCreateByURL fetches existing content by canonical URL, or creates it.
// Returns the content (whether existing or newly created), never ErrAlreadyExists.
// The underlying INSERT ON CONFLICT DO NOTHING is atomic — no TOCTOU race.
func (r *GormContentRepository) GetOrCreateByURL(ctx context.Context, content *domain.Content) (*domain.Content, error) {
    model := contentDomainToModel(content)

    // Atomic: INSERT ... ON CONFLICT (url) DO NOTHING
    result := r.db.WithContext(ctx).Clauses(clause.OnConflict{
        Columns:   []clause.Column{{Name: "url"}},
        DoNothing: true,
    }).Create(model)

    if result.Error != nil {
        return nil, fmt.Errorf("failed to upsert content: %w", result.Error)
    }

    // If RowsAffected == 0, the row already existed — fetch it
    if result.RowsAffected == 0 {
        return r.GetByURL(ctx, *content.URL)
    }

    // Freshly created — fetch to get DB-generated timestamps
    return r.GetByID(ctx, model.ID)
}
```

**Why `DoNothing: true` + SELECT vs `UpdateAll: true`:** For content, we never want to overwrite an existing video's metadata (title, stats) during a duplicate submission. The correct behavior is to return the existing record unchanged.

### Pattern 4: Service-level response for duplicates

**What:** The GraphQL API contract stays `createContentFromYouTube: Content!` — it always succeeds with a content object. No error on duplicate.
**When to use:** Always. Callers receive the content whether new or existing.

```go
// In resolver — NO CHANGE to error mapping
// ErrAlreadyExists is no longer raised by the service, so this branch becomes dead code
// The resolver returns the content returned by the service directly
```

**Frontend impact:** The `useAddVideo` hook in `frontend/src/lib/queries/hooks/useAddVideo.ts` currently shows "This video has already been added" toast when the error message includes "already exists". With idempotent upsert, a duplicate submission returns a successful response (the existing content), so:
- `onSuccess` fires instead of `onError`
- The toast says "Added: <title>" even for duplicates
- The cache is updated with the existing item (harmless — it's already there)
- Requirement VIDEO-05: "User is warned via toast if video already exists" — needs a new signal

### Anti-Patterns to Avoid
- **TOCTOU select-then-insert:** The old `GetByURL` + `Create` two-step is a race condition under concurrent load. Don't keep it.
- **Storing raw user URLs:** Raw URLs vary (www vs no-www, http vs https, timestamp params, playlist params). Store canonical form only.
- **Normalizing the URL in the resolver:** Normalization belongs in the YouTube adapter (parser.go) or service, not the GraphQL layer. Keep adapters independent.
- **Changing the GraphQL mutation return type:** `Content!` is already correct. Don't add a union or error type for this case.
- **Updating metadata on duplicate:** Don't overwrite existing content stats on re-submission (unexpected side effects, performance cost). Use `DoNothing`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic duplicate-safe insert | Custom mutex / advisory lock / retry loop | `clause.OnConflict{DoNothing: true}` | DB constraint + GORM clause is atomic per-connection, simpler, no retry logic |
| URL parsing | Regex-based URL normalization | `ExtractVideoID` (already in parser.go) + simple string concat | Parser already tested for 17 URL variants |

**Key insight:** The existing `ExtractVideoID` function already handles all URL variants — the video ID IS the canonical unique key. Normalization is trivial string construction from that ID.

## Common Pitfalls

### Pitfall 1: Storing raw user URL (status quo bug)
**What goes wrong:** Two different URL forms for the same video are stored as separate content records. DB `UNIQUE(url)` only prevents exact URL string duplicates, not semantic duplicates.
**Why it happens:** The old code stores `url` as-is from the user input.
**How to avoid:** Always store the canonical URL (`https://www.youtube.com/watch?v=<videoID>`), not the input URL.
**Warning signs:** Multiple content rows with different URLs but same video titles.

### Pitfall 2: YouTube URL parameters contaminating deduplication
**What goes wrong:** `https://youtu.be/abc123?t=120` (timestamp) and `https://youtu.be/abc123?list=PL...` (playlist context) treated as separate videos.
**Why it happens:** `ExtractVideoID` strips params correctly, but if the URL is used for storage instead of just extraction, params leak in.
**How to avoid:** Use `NormalizeYouTubeURL(videoID)` — build from video ID only, no query params.
**Warning signs:** URLs with `?t=`, `?list=`, `?si=` (YouTube share tracking) stored in DB.

### Pitfall 3: YouTube URL `?si=` sharing parameter
**What goes wrong:** YouTube share links (since ~2023) append `?si=<tracking>` param. E.g., `https://youtu.be/abc123?si=XYZ...`. If this is stored without normalization, it fails deduplication.
**Why it happens:** `si` is a YouTube sharing analytics parameter not part of video identity.
**How to avoid:** Canonical normalization after `ExtractVideoID` strips all params including `si`.
**Warning signs:** `?si=` appearing in stored URLs.

### Pitfall 4: Metadata fetch happens for every submission (even duplicates)
**What goes wrong:** Even if a video already exists, the old code's flow: validate URL, extract ID, then check — but with upsert, if we move metadata fetch after the upsert attempt, we save an API call on duplicates.
**Why it happens:** The service calls `GetVideoMetadata` before knowing if the content exists.
**How to avoid:** Two-pass approach — normalize URL, check for existing first (via `GetOrCreateByURL` partial flow), fetch metadata only if creating new. OR accept the extra API call (simpler code, YouTube API quota allows it).
**Recommendation:** For Phase 17, keep metadata fetch regardless of duplicate status (simpler). Optimization is a separate concern.

### Pitfall 5: `GetOrCreateByURL` needs content data to create — but content data needs metadata fetch
**What goes wrong:** The repository method needs a complete `domain.Content` struct to create (including `Name`, `Length`, etc.), so we can't check existence purely at the repository level without first fetching metadata from YouTube.
**Why it happens:** Architectural coupling between content creation and metadata fetching.
**How to avoid:** Service flow: (1) normalize URL, (2) check if exists with `GetByURL(canonical)`, (3) return existing if found, (4) fetch metadata from YouTube, (5) create with `Create` using `clause.OnConflict{DoNothing:true}`, (6) if `RowsAffected==0` after create (race), re-fetch and return existing. This handles the common case efficiently.

### Pitfall 6: Frontend VIDEO-05 requirement — "user warned if video already exists"
**What goes wrong:** With idempotent upsert returning success, the frontend `onError` branch for duplicates never fires. VIDEO-05 requires a user-visible warning for duplicates.
**Why it happens:** Idempotent design conflicts with the requirement to inform users of duplicates.
**How to avoid:** Two options:
  - (A) Add a boolean `wasAlreadyPresent` field to the GraphQL `Content` type (schema change, minimal)
  - (B) Compare the returned content's `createdAt` to a recent threshold to infer "probably existing" (fragile heuristic)
  - (C) Keep the error path for duplicates but change the error type from failure to a "soft warning" response
  - **Recommended:** Option A — add `alreadyExisted: Boolean` to `Content` or use a wrapper type `CreateContentResult { content: Content!, alreadyExisted: Boolean! }`. The planner should decide between A (minimal schema change) and keeping error (current behavior, simpler).

### Pitfall 7: Test updates required — AlreadyExists assertion changes
**What goes wrong:** `TestCreateFromYouTube_AlreadyExists` in `content_service_test.go` asserts `errors.Is(err, domain.ErrAlreadyExists)`. With idempotent upsert, this test must be rewritten to assert success with the existing item returned.
**Why it happens:** Tests encode the old error behavior.
**How to avoid:** Plan must include test rewrites. Also, `test/resolvers/content_resolver_test.go:TestCreateContentFromYouTube_AlreadyExists` needs updating.

## Code Examples

Verified patterns from codebase and GORM official docs:

### Current duplicate check (to be replaced)
```go
// Source: backend/internal/core/services/content_service.go:28-36
// This TOCTOU pattern is replaced by atomic upsert
existing, err := s.repo.GetByURL(ctx, url)
if err == nil && existing != nil {
    return nil, fmt.Errorf("%w: content with URL %s already exists", domain.ErrAlreadyExists, url)
}
```

### Canonical URL construction (new function)
```go
// Source: to be added to backend/internal/adapters/youtube/parser.go
func NormalizeYouTubeURL(videoID string) string {
    return "https://www.youtube.com/watch?v=" + videoID
}
```

### GORM ON CONFLICT (atomic upsert)
```go
// Source: GORM docs (gorm.io/docs/create.html) + existing gorm_content_repository.go patterns
import "gorm.io/gorm/clause"

result := r.db.WithContext(ctx).Clauses(clause.OnConflict{
    Columns:   []clause.Column{{Name: "url"}},
    DoNothing: true,
}).Create(model)

if result.Error != nil {
    return nil, fmt.Errorf("failed to upsert content: %w", result.Error)
}
if result.RowsAffected == 0 {
    // Row existed — fetch it
    return r.GetByURL(ctx, *content.URL)
}
// Newly inserted — fetch with timestamps
return r.GetByID(ctx, model.ID)
```

### Migration for index (if needed)
```sql
-- Next migration: 000012
-- The UNIQUE constraint content_unique_url already exists from 000001.
-- Only needed if adding external_id or a separate index.
-- If only normalizing URLs (no schema column change), no migration may be needed.
-- Verify with: \d content in psql
```

### Frontend — no change required
```typescript
// Source: frontend/src/lib/utils/youtube.ts
// The frontend validation already accepts all URL variants and passes them to backend.
// The backend normalizes before storing. No frontend change needed for normalization.

// Source: frontend/src/lib/queries/hooks/useAddVideo.ts:53
// This duplicate detection branch may become unreachable depending on design choice:
} else if (message.includes('already exists')) {
    toast.error('This video has already been added');
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw URL stored | Raw URL stored (same) | N/A | Phase 17 changes this |
| TOCTOU check-then-create | TOCTOU check-then-create | N/A | Phase 17 changes this |
| Error on duplicate | Error on duplicate | N/A | Phase 17 changes this (idempotent) |

**What currently works well (keep):**
- `ExtractVideoID` parser handles 17+ URL variants correctly with tests
- DB `UNIQUE(url)` constraint already exists — no new migration for constraint, only to ensure canonical URLs are stored
- `GetByURL` in repository is clean and can stay as the fallback after conflict
- Frontend validation already accepts all URL forms

**Deprecated/outdated after Phase 17:**
- `domain.ErrAlreadyExists` for content: no longer raised by `CreateFromYouTube`
- `TestCreateFromYouTube_AlreadyExists` (old behavior): rewrite as `TestCreateFromYouTube_ReturnExistingOnDuplicate`
- `TestCreateContentFromYouTube_AlreadyExists` in resolver tests: rewrite

## Open Questions

1. **VIDEO-05 requirement: "User warned if video already exists"**
   - What we know: Idempotent upsert returns success; frontend cannot distinguish new vs existing from current `Content` response
   - What's unclear: Does the planner want (A) schema change to expose `alreadyExisted: Boolean`, (B) keep error path for the "already exists" case (backward compatible, simpler), or (C) treat it as a UX non-requirement (submitting a duplicate URL is harmless, success toast is fine)?
   - Recommendation: Plan should decide. Option B (keep `ErrAlreadyExists`, but return the existing content alongside it — not possible in current Go error model) is awkward. Option A (schema wrapper type) is cleanest. **Most likely the planner should choose: keep ErrAlreadyExists in the service, but handle it gracefully in the resolver by returning the existing item.** This satisfies both "no hard error" and VIDEO-05.

2. **Should `GetByURL` be renamed to `GetByCanonicalURL` or kept?**
   - What we know: The method semantics are the same; only the stored values change (now always canonical)
   - What's unclear: Naming
   - Recommendation: Keep `GetByURL` name — the port interface doesn't need to change if the implementation always stores canonical URLs

3. **`NormalizeURL` on `YouTubeClient` interface or standalone in parser?**
   - What we know: `ExtractVideoID` is on the `YouTubeClient` interface (port/services/youtube_client.go). Adding `NormalizeURL` there would require mock updates.
   - What's unclear: Whether normalization belongs on the interface or is a pure utility function
   - Recommendation: Pure function in `parser.go` (`NormalizeYouTubeURL(videoID string) string`) — no interface changes needed. The service calls `ExtractVideoID` (via interface), then `youtube.NormalizeYouTubeURL(id)` directly. This avoids interface pollution and mock maintenance.

4. **Migration needed?**
   - What we know: `UNIQUE(url)` constraint already exists. Existing data in prod has raw (non-canonical) URLs.
   - What's unclear: Is there production data that needs backfilling?
   - Recommendation: A data migration that normalizes existing URLs (extract video ID, build canonical URL, UPDATE content SET url = canonical WHERE content_type = 'youtube') is needed if production data exists with non-canonical URLs. The constraint enforcement will naturally work once all new inserts use canonical form.

5. **Metadata fetch on every call regardless of duplicate?**
   - What we know: YouTube API has quota limits (10,000 units/day, videos.list costs 1 unit per video)
   - What's unclear: Call volume expectations
   - Recommendation: For v1 (low traffic), fetch metadata regardless. Skip the pre-check optimization. Document as a future optimization if quota becomes a concern.

## Sources

### Primary (HIGH confidence)
- Codebase: `backend/internal/core/services/content_service.go` — actual implementation, duplicate handling
- Codebase: `backend/internal/adapters/youtube/parser.go` — `ExtractVideoID`, URL format support
- Codebase: `backend/internal/adapters/repositories/postgres/gorm_content_repository.go` — Create, GetByURL
- Codebase: `backend/internal/core/ports/repositories/content_repository.go` — ContentRepository interface
- Codebase: `backend/migrations/000001_create_content.up.sql` — confirms `UNIQUE(url)` constraint
- Codebase: `backend/internal/adapters/graphql/resolvers/schema.resolvers.go` — resolver error mapping
- Codebase: `frontend/src/lib/queries/hooks/useAddVideo.ts` — frontend duplicate error handling
- Codebase: `backend/test/services/content_service_test.go` — existing test assertions to update
- Codebase: `backend/test/youtube/parser_test.go` — URL variant coverage (17 test cases)

### Secondary (MEDIUM confidence)
- [GORM Create docs](https://gorm.io/docs/create.html) — `clause.OnConflict{DoNothing: true}` pattern confirmed via WebSearch
- [PostgreSQL UPSERT](https://neon.com/postgresql/postgresql-tutorial/postgresql-upsert) — `INSERT ON CONFLICT DO NOTHING` semantics
- [Upsert Operations DeepWiki](https://deepwiki.com/go-gorm/gorm/4.5-upsert-operations) — GORM upsert patterns

### Tertiary (LOW confidence)
- None. All critical claims are verified against actual codebase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, using existing GORM clause API
- Architecture: HIGH — all layers and files identified from actual codebase reads
- Pitfalls: HIGH — identified from actual code paths, tests, and schema

**Research date:** 2026-02-22
**Valid until:** 2026-04-22 (stable stack, no external dependencies changing)

---

## Appendix: Files to Change (Summary for Planner)

| File | Change | Layer |
|------|--------|-------|
| `backend/internal/adapters/youtube/parser.go` | Add `NormalizeYouTubeURL(videoID string) string` | Adapter |
| `backend/internal/core/services/content_service.go` | Replace TOCTOU check with: extract ID → normalize → `GetOrCreateByURL` | Service |
| `backend/internal/core/ports/repositories/content_repository.go` | Add `GetOrCreateByURL(ctx, *domain.Content) (*domain.Content, error)` | Port |
| `backend/internal/adapters/repositories/postgres/gorm_content_repository.go` | Implement `GetOrCreateByURL` using `clause.OnConflict{DoNothing:true}` | Adapter |
| `backend/migrations/000012_*.up.sql` | Backfill existing URLs to canonical form (if prod data exists) | DB |
| `backend/test/services/content_service_test.go` | Rewrite `TestCreateFromYouTube_AlreadyExists` — now expects success + existing item returned | Test |
| `backend/test/resolvers/content_resolver_test.go` | Rewrite `TestCreateContentFromYouTube_AlreadyExists` | Test |
| `backend/test/youtube/parser_test.go` | Add tests for `NormalizeYouTubeURL` | Test |
| `backend/schema.graphql` | Possibly add `alreadyExisted: Boolean` to `Content` or a wrapper type | Schema |
| `frontend/src/lib/queries/hooks/useAddVideo.ts` | Update `onError` branch if schema change removes `ErrAlreadyExists` from resolver | Frontend |
| `frontend/src/lib/utils/youtube.ts` | No change required — already validates all URL variants | N/A |

**Note on Phase 6 M-03 overlap:** M-03 in the Phase 6 backlog says "`CreateFromYouTube` returns error instead of idempotent result". Phase 17 directly addresses this. If Phase 17 executes before Phase 6, M-03 should be marked resolved.

**Note on Phase 8.1 H-06/H-07 (TOCTOU):** H-06 (perspective claim uniqueness) and H-07 (user uniqueness) are separate from this phase. The same pattern (`clause.OnConflict` for atomic uniqueness) applies there, but is out of scope for Phase 17.
