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

## Request Flow

```
GraphQL Request
  → GraphQL Resolver (adapter)
  → Domain Service (core, uses port interfaces)
  → Repository Interface (port)
  → PostgreSQL Repository (adapter)
```
