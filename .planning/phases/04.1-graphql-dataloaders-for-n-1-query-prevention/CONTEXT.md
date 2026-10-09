# Phase 04.1: GraphQL Dataloaders for N+1 Query Prevention

## Problem Statement

The GraphQL schema defines three nested relationship fields that will cause N+1 query problems once field resolvers are implemented:

| Parent Type | Field | Resolves To | FK Source |
|---|---|---|---|
| `Perspective` | `user` | `User` | `Perspective.UserID` (required) |
| `Perspective` | `content` | `Content` | `Perspective.ContentID` (optional) |
| `Content` | `addedBy` | `User` | `Content.AddedByUserID` (required) |

**Current state:** No field resolvers exist for these relationships. The generated model structs have the fields (`model.Perspective.User`, `model.Perspective.Content`, `model.Content.AddedBy`) but they always resolve to `null` because no code populates them.

**Without dataloaders:** A query like `perspectives(first: 50) { items { user { name } content { name } } }` would execute 1 + 50 + 50 = 101 SQL queries. With dataloaders, it executes 1 + 1 + 1 = 3.

## Architecture Analysis

### Hexagonal Architecture Layers

```
schema.graphql                    ← GraphQL schema (relationship fields defined here)
  ↓
resolvers/schema.resolvers.go     ← Query/mutation resolvers (current, no field resolvers)
resolvers/helpers.go              ← domainToModel converters (no nested object population)
  ↓
ports/services/*_service.go       ← Service interfaces (GetByID only, no batch methods)
  ↓
core/services/*_service.go        ← Service implementations
  ↓
ports/repositories/*_repository.go ← Repository interfaces (GetByID only, no batch methods)
  ↓
adapters/repositories/postgres/   ← GORM implementations
```

### What Exists Today

**Resolver (`resolver.go`):**
```go
type Resolver struct {
    ContentService     portservices.ContentService
    UserService        portservices.UserService
    PerspectiveService portservices.PerspectiveService
}
```
Only `queryResolver` and `mutationResolver` types exist. No `contentResolver` or `perspectiveResolver` for field-level resolution.

**Repository interfaces — single-entity only:**
- `ContentRepository.GetByID(ctx, id int) (*Content, error)`
- `UserRepository.GetByID(ctx, id int) (*User, error)`
- `PerspectiveRepository.GetByID(ctx, id int) (*Perspective, error)`

No `GetByIDs(ctx, ids []int)` batch methods on any repository.

**GraphQL schema relationships (schema.graphql:45-65, 78-97):**
```graphql
type Perspective {
  userID: ID!
  user: User          # ← needs field resolver + dataloader
  contentID: ID
  content: Content    # ← needs field resolver + dataloader
}

type Content {
  addedByUserID: ID!
  addedBy: User       # ← needs field resolver + dataloader
}
```

**gqlgen config:** No `fieldsolver` directives. All model types are auto-generated with flat struct fields. Relationships are modeled as nullable pointers in the generated types but never populated.

### Key Files

| File | Role | Lines |
|---|---|---|
| `backend/schema.graphql` | GraphQL schema with relationship fields | 251 |
| `backend/gqlgen.yml` | gqlgen code generation config | 67 |
| `backend/internal/adapters/graphql/resolvers/resolver.go` | Resolver struct + constructor | 30 |
| `backend/internal/adapters/graphql/resolvers/schema.resolvers.go` | All query/mutation resolvers | 490 |
| `backend/internal/adapters/graphql/resolvers/helpers.go` | Domain-to-model conversion helpers | 147 |
| `backend/internal/adapters/graphql/model/models_gen.go` | Generated GraphQL model types | 163 |
| `backend/internal/adapters/graphql/generated/generated.go` | Generated gqlgen runtime | large |
| `backend/internal/core/ports/repositories/content_repository.go` | Content repo interface | 22 |
| `backend/internal/core/ports/repositories/user_repository.go` | User repo interface | 18 |
| `backend/internal/core/ports/repositories/perspective_repository.go` | Perspective repo interface | 17 |
| `backend/internal/core/ports/services/content_service.go` | Content service interface | 19 |
| `backend/internal/core/ports/services/user_service.go` | User service interface | 37 |
| `backend/internal/core/domain/content.go` | Content domain type | 28 |
| `backend/internal/core/domain/user.go` | User domain type | 37 |
| `backend/internal/core/domain/perspective.go` | Perspective domain type | 128 |
| `backend/test/resolvers/content_resolver_test.go` | Test infra: mocks, setupTestServer, executeGraphQL | 945 |
| `backend/test/resolvers/helpers_test.go` | Integration tests for helper functions | 412 |

### Domain Types (Foreign Keys)

```go
// domain.Perspective — FK fields for dataloaders
type Perspective struct {
    ID        int
    UserID    int  // Required FK → users.id
    ContentID *int // Optional FK → content.id
    // ...
}

// domain.Content — FK field for dataloader
type Content struct {
    ID            int
    AddedByUserID int // Required FK → users.id
    // ...
}

// domain.User — target of all three relationships
type User struct {
    ID       int
    Username string
    Email    string
    Role     UserRole
    Active   bool
    // ...
}
```

## Implementation Approach

### Library: `graph-gophers/dataloader/v7`

Generic Go dataloader with per-request caching and automatic batching. Well-established in the gqlgen ecosystem.

### Three Dataloaders Needed

| Dataloader | Batch Key | Returns | Used By |
|---|---|---|---|
| `UserLoader` | `int` (user ID) | `*domain.User` | `Perspective.user`, `Content.addedBy` |
| `ContentLoader` | `int` (content ID) | `*domain.Content` | `Perspective.content` |

Note: `UserLoader` serves two relationships (both `Perspective.user` and `Content.addedBy` resolve users by ID), so only 2 distinct dataloaders are needed.

### Batch Functions → New Repository Methods

Each dataloader needs a batch function backed by a new repository method:

```go
// New method on UserRepository
GetByIDs(ctx context.Context, ids []int) ([]*User, error)
// SQL: SELECT * FROM users WHERE id IN ($1, $2, ...) — single query for N users

// New method on ContentRepository
GetByIDs(ctx context.Context, ids []int) ([]*Content, error)
// SQL: SELECT * FROM content WHERE id IN ($1, $2, ...) — single query for N content
```

### gqlgen Field Resolvers

Add to `gqlgen.yml`:
```yaml
models:
  Perspective:
    fields:
      user:
        resolver: true
      content:
        resolver: true
  Content:
    fields:
      addedBy:
        resolver: true
```

After `go run github.com/99designs/gqlgen generate`, this creates:
- `perspectiveResolver` type with `User()` and `Content()` methods
- `contentResolver` type with `AddedBy()` method

These field resolvers call the dataloader instead of the repository directly.

### Middleware Pattern

Dataloaders are per-request (they cache within a single request to deduplicate). Standard pattern:

1. HTTP middleware creates dataloader instances, attaches to `context.Context`
2. Field resolvers extract loaders from context via helper functions
3. Loaders batch and cache automatically within the request lifecycle

```
HTTP Request → Middleware (creates loaders) → context.Context → GraphQL execution
                                                                  ↓
                                                           Field resolver calls loader.Load(key)
                                                                  ↓
                                                           Loader batches keys, calls repo.GetByIDs
```

## Testing Strategy

**No Docker required.** All tests use the existing mock repository + `httptest.Server` pattern.

### Existing Test Infrastructure (reusable)

From `backend/test/resolvers/content_resolver_test.go`:
- `mockContentRepository` — function-stub mock implementing `ContentRepository`
- `mockUserRepository` — function-stub mock implementing `UserRepository`
- `mockPerspectiveRepository` — function-stub mock implementing `PerspectiveRepository`
- `setupTestServer(repo, ytClient)` — wires mocks → services → resolver → `httptest.Server`
- `executeGraphQL(t, server, query)` — sends GraphQL query, returns parsed response

### New Tests Needed

**1. Unit tests for batch functions:**
- Given IDs `[1, 3, 5]`, mock returns `[user1, user3, user5]`, verify correct ordering
- Given IDs with a missing one `[1, 2, 999]`, verify error/nil at correct index
- Given empty IDs `[]`, verify no DB call

**2. Integration test for N+1 prevention (key test):**
- Mock `perspectives.List` returns 10 perspectives with varying `UserID`/`ContentID`
- Add **call counters** to `mockUserRepository.GetByIDs` and `mockContentRepository.GetByIDs`
- Execute: `{ perspectives { items { user { username } content { name } } } }`
- Assert: `GetByIDs` called exactly **1 time each** (not N times)
- Assert: response contains correct nested user/content data

**3. Field resolver tests:**
- `Perspective.user` resolves correctly when `UserID` is set
- `Perspective.content` resolves correctly when `ContentID` is set
- `Perspective.content` returns `null` when `ContentID` is `nil`
- `Content.addedBy` resolves correctly

### Test Setup Changes

`setupTestServer` needs to be extended to:
1. Accept dataloader-enabled middleware (or create loaders from the mock repos)
2. Wire field resolvers that use the dataloaders

The mock repositories need new `getByIDsFn` function stubs for the batch methods.

## Constraints & Decisions

- **Hexagonal architecture**: Dataloaders sit in the adapter layer (GraphQL), not in domain/services. Batch repo methods are a port concern.
- **Per-request scoping**: Loaders MUST be created per-request via middleware, not as singletons (prevents cross-request cache leaks).
- **Wait time tuning**: Default 2ms wait time for batching is standard. Can tune later based on production latency.
- **Error handling**: If a batch returns fewer results than keys, the missing entries should return `nil` (not error) — the relationship is nullable in the schema.
