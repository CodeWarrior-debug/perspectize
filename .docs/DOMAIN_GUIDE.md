# Domain Layer Guide

## What Belongs in Domain (`core/domain/`)

The domain layer contains pure Go structs with **no external dependencies** — no database tags, no framework imports, no HTTP/GraphQL code. You should be able to copy domain files to another project and compile them with only the standard library.

| Include | Do NOT Include |
|---------|----------------|
| Business entities (structs) | Database tags (`db:"column"`) |
| Constants/enums (`ContentType`, `Privacy`) | SQL queries |
| Domain errors (`ErrNotFound`, `ErrInvalidRating`) | HTTP/GraphQL code |
| Validation methods | External API calls |

## Core Entities

- `Content` - Media that users create perspectives on (YouTube videos, articles)
- `Perspective` - A user's viewpoint/rating on content (claim, quality, agreement, etc.)

## Optional Fields Pattern

Use pointers for nullable/optional fields:

```go
type Perspective struct {
    Claim   string  // Required - always has a value
    Quality *int    // Optional - nil means "not provided"
}

// Check if optional field is set
if p.Quality != nil {
    fmt.Println(*p.Quality)  // Dereference to get value
}

// Set an optional field
quality := 85
p.Quality = &quality
```

## Privacy

User-owned rows that other users can see carry a `privacy` column: `PUBLIC` / `PRIVATE` in Go and GraphQL (`domain.Privacy`), lowercase in the DB, `NOT NULL DEFAULT 'public'` with a `CHECK` (pattern: `000018_harden_perspective_privacy`).

- **List reads** stay open (no `@auth`) and return public rows plus the viewer's own: the resolver sets `ViewerID` from `auth.ForContext`, the service sets `RestrictToPublicOrOwner`, the repository turns it into a WHERE predicate (`PerspectiveListParams`).
- **By-id reads** return `null` for someone else's private row, never `FORBIDDEN`, so the id isn't confirmed to exist.
- **Writes** stay owner-only (see `backend/CLAUDE.md` → Gotchas).
- Origin: `docs/superpowers/specs/2026-09-09-perspective-privacy-design.md`.

## Request Flow

```
GraphQL Request
  → GraphQL Resolver (adapter)
  → Domain Service (core, uses port interfaces)
  → Repository Interface (port)
  → PostgreSQL Repository (adapter)
```
