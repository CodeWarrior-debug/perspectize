# Perspectize Backend Architecture

## Overview

Perspectize is a multi-dimensional perspective rating platform for YouTube content. The backend provides a GraphQL API for managing content, perspectives, and user interactions.

**Core Philosophy**: Contemplative interfaces that encourage depth over speed, with deliberate friction to promote thoughtful engagement.

## System Context

```
+------------------------------------------------------------------+
|                         Clients                                   |
+------------------+------------------+-----------------------------+
|   Svelte Web     |   Mobile PWA     |    Future Native Apps       |
+--------+---------+--------+---------+--------------+--------------+
         |                  |                        |
         v                  v                        v
+------------------------------------------------------------------+
|                    Perspectize Go Backend                         |
|  +--------------+  +--------------+  +--------------------------+ |
|  | GraphQL API  |  |   REST API   |  |    Background Jobs       | |
|  |   (gqlgen)   |  |    (chi)     |  |    (robfig/cron)         | |
|  +--------------+  +--------------+  +--------------------------+ |
+-----------------------------+------------------------------------+
                              |
          +-------------------+-------------------+
          v                   v                   v
+-----------------+ +-----------------+ +-----------------+
|   PostgreSQL    | |  YouTube API    | |   Future:       |
|   (Primary DB)  | |  (Data Source)  | |   Redis Cache   |
+-----------------+ +-----------------+ +-----------------+
```

## Technology Choices

### Why Go?

| Factor | Decision | Rationale |
|--------|----------|-----------|
| Performance | Go | Compiled, low memory footprint, excellent concurrency |
| Simplicity | Standard library | Fewer dependencies, easier maintenance |
| Team fit | Explicit patterns | No magic, clear code flow |
| Deployment | Single binary | Simple containerization, fast startup |

### Library Selection Matrix

| Component | Choice | Alternatives Considered | Why This Choice |
|-----------|--------|------------------------|-----------------|
| Router | chi | Fiber, Gin, stdlib only | Lightweight, net/http compatible |
| Database | sqlx + pgx | GORM, ent | Direct SQL control, performance |
| Migrations | golang-migrate | goose, GORM AutoMigrate | Version-controlled SQL, PostgreSQL features |
| GraphQL | gqlgen | graphql-go | Schema-first, type-safe, performant |
| Validation | validator/v10 | ozzo-validation | De facto standard, struct tags |
| Logging | log/slog | zap, zerolog | Standard library, sufficient features |
| Testing | testify + sqlmock | gomock, testcontainers | Simple mocking, good assertions |

## Hexagonal Architecture

This project follows **Hexagonal Architecture** (Ports and Adapters pattern):

```
+------------------------------------------------------------------+
|                     Adapters (Infrastructure)                      |
|  +--------------------+  +--------------------+                   |
|  | GraphQL Resolvers  |  |  HTTP Handlers     |  PRIMARY          |
|  | (internal/adapters |  |  (if needed)       |  (Driving)        |
|  |  /graphql/)        |  |                    |                   |
|  +--------------------+  +--------------------+                   |
+-----------------------------+------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
|                      Core (Domain Layer)                          |
|  +--------------------+  +--------------------+                   |
|  |   Domain Models    |  |   Domain Services  |                   |
|  | (internal/core/    |  | (internal/core/    |                   |
|  |  domain/)          |  |  services/)        |                   |
|  +--------------------+  +--------------------+                   |
|                              |                                    |
|                              v                                    |
|  +--------------------+                                           |
|  |   Port Interfaces  |                                           |
|  | (internal/core/    |                                           |
|  |  ports/)           |                                           |
|  +--------------------+                                           |
+-----------------------------+------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
|                     Adapters (Infrastructure)                      |
|  +--------------------+  +--------------------+                   |
|  | PostgreSQL Repos   |  |  YouTube Client    |  SECONDARY        |
|  | (internal/adapters |  | (internal/adapters |  (Driven)         |
|  |  /repositories/)   |  |  /youtube/)        |                   |
|  +--------------------+  +--------------------+                   |
+------------------------------------------------------------------+
```

### Key Architectural Principles

**Hexagon Core (Domain Layer):**
- `internal/core/domain/` - Pure domain models, no external dependencies
- `internal/core/ports/` - Interfaces defining contracts (repositories, services)
- `internal/core/services/` - Business logic, depends only on ports

**Adapters (Infrastructure):**
- `internal/adapters/graphql/` - PRIMARY adapter: GraphQL API (gqlgen)
- `internal/adapters/repositories/` - SECONDARY adapter: PostgreSQL (sqlx + pgx)
- `internal/adapters/youtube/` - SECONDARY adapter: YouTube Data API

**Dependency Rule:** Dependencies point inward. Domain never depends on adapters. Adapters depend on domain ports.

## Domain Model

### Core Entities

```
+---------------------+       +---------------------+
|       Content       |       |     Perspective     |
+---------------------+       +---------------------+
| id: int             |       | id: int             |
| url: string         |<------| content_id: int     |
| name: string        |       | user_id: int        |
| length: int         |       | quality: int (0-100)|
| content_type: string|       | agreement: int      |
| response: jsonb     |       | claim: string       |
| created_at: time    |       | created_at: time    |
| updated_at: time    |       | updated_at: time    |
+---------------------+       +---------------------+
                                      |
                                      |
                              +-------v-------+
                              |     User      |
                              +---------------+
                              | id: int       |
                              | username: str |
                              | email: string |
                              | created_at    |
                              +---------------+
```

### Perspective Dimensions

The core innovation: multi-dimensional ratings instead of binary like/dislike.

| Dimension | Range | Meaning |
|-----------|-------|---------|
| Quality | 0-10000 | How well-made is the content? (0.01% precision) |
| Agreement | 0-10000 | How much do you agree with the message? |

**Why 0-10000?** Allows 0.01% precision stored as integer (no floating point issues), displayed as percentage.

## API Design

### GraphQL Schema

```graphql
type Query {
    content(id: ID!): Content
    contents(first: Int, after: String): ContentConnection!
    perspective(id: ID!): Perspective
    perspectivesByUser(username: String!): [Perspective!]!
    perspectivesByContent(contentId: ID!): [Perspective!]!
}

type Mutation {
    createContent(input: CreateContentInput!): Content!
    createPerspective(input: CreatePerspectiveInput!): Perspective!
    updatePerspective(id: ID!, input: UpdatePerspectiveInput!): Perspective!
}

type Content {
    id: ID!
    url: String
    name: String!
    length: Int
    contentType: String!
    perspectives: [Perspective!]!
    averageQuality: Float
    averageAgreement: Float
    perspectiveCount: Int!
    createdAt: DateTime!
}

type Perspective {
    id: ID!
    content: Content!
    user: User!
    quality: Int
    agreement: Int
    claim: String
    createdAt: DateTime!
}
```

## Data Flow Examples

### Creating a Perspective

```
Client              Resolver            Service             Repository          DB
  |                    |                   |                    |                |
  | GraphQL mutation   |                   |                    |                |
  |------------------->|                   |                    |                |
  |                    | Validate input    |                    |                |
  |                    | Parse request     |                    |                |
  |                    |                   |                    |                |
  |                    | Create(input)     |                    |                |
  |                    |------------------>|                    |                |
  |                    |                   | Check content      |                |
  |                    |                   |------------------->|                |
  |                    |                   |                    | SELECT content |
  |                    |                   |                    |--------------->|
  |                    |                   |                    |<---------------|
  |                    |                   |<-------------------|                |
  |                    |                   |                    |                |
  |                    |                   | Validate business  |                |
  |                    |                   | rules              |                |
  |                    |                   |                    |                |
  |                    |                   | Save perspective   |                |
  |                    |                   |------------------->|                |
  |                    |                   |                    | INSERT         |
  |                    |                   |                    |--------------->|
  |                    |                   |                    |<---------------|
  |                    |                   |<-------------------|                |
  |                    |<------------------|                    |                |
  | Response           |                   |                    |                |
  |<-------------------|                   |                    |                |
```

## Error Handling

### Error Types

```go
// internal/core/domain/errors.go

var (
    ErrNotFound       = errors.New("resource not found")
    ErrValidation     = errors.New("validation failed")
    ErrUnauthorized   = errors.New("authentication required")
    ErrForbidden      = errors.New("access denied")
    ErrConflict       = errors.New("resource already exists")
)
```

### HTTP Status Mapping

| Error Code | HTTP Status | When to Use |
|------------|-------------|-------------|
| NOT_FOUND | 404 | Resource doesn't exist |
| VALIDATION_ERROR | 400 | Invalid request body |
| UNAUTHORIZED | 401 | No/invalid auth token |
| FORBIDDEN | 403 | Valid auth but no permission |
| CONFLICT | 409 | Duplicate unique constraint |
| INTERNAL_ERROR | 500 | Unexpected errors |

## Database Design

### PostgreSQL-Specific Features Used

1. **JSONB**: For storing YouTube API responses (flexible schema)
2. **Custom Domains**: `valid_integer_range` for 0-10000 constraints
3. **Indexes**: GIN indexes on JSONB, B-tree on foreign keys
4. **Timestamps**: `TIMESTAMPTZ` for all time fields
5. **Triggers**: Automatic timestamp updates

### Migration Strategy

```sql
-- Example: Adding a new feature

-- migrations/000003_add_user_preferences.up.sql
CREATE TABLE user_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    theme VARCHAR(50) DEFAULT 'contemplative',
    font_preference VARCHAR(50) DEFAULT 'georgia',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);

-- migrations/000003_add_user_preferences.down.sql
DROP TABLE IF EXISTS user_preferences;
```

## Security Considerations

### Input Validation

- All inputs validated using go-playground/validator
- SQL injection prevented by sqlx parameterized queries
- XSS prevented by Go's template escaping (if HTML rendered)

### Authentication (Planned)

```
+------------------------------------------------------------------+
|                    Future Auth Flow                               |
+------------------------------------------------------------------+
|  1. OAuth 2.0 with YouTube (for creators)                        |
|  2. JWT tokens for API authentication                            |
|  3. Refresh token rotation                                       |
|  4. Rate limiting per user/IP                                    |
+------------------------------------------------------------------+
```

### Rate Limiting

```go
// Planned implementation using golang.org/x/time/rate
limiter := rate.NewLimiter(rate.Limit(10), 20) // 10 req/sec, burst 20
```

## Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| P50 response time | < 50ms | 95th percentile |
| P95 response time | < 200ms | |
| P99 response time | < 500ms | |
| Memory per instance | < 100MB | Under normal load |
| Requests/second | 1000+ | Per instance |

### Optimization Strategies

1. **Database**: Connection pooling via pgx, prepared statements
2. **Caching**: Redis for frequently accessed content (planned)
3. **N+1 Prevention**: DataLoader pattern for GraphQL
4. **Pagination**: Cursor-based for large lists

## Observability

### Logging Structure

```go
// Structured logging with slog
logger.Info("perspective created",
    "user_id", userID,
    "content_id", contentID,
    "quality", quality,
    "request_id", requestID,
)
```

### Metrics (Planned)

- Request duration histograms
- Error rate by endpoint
- Database query timing
- Cache hit/miss ratios

## Deployment Architecture

```
+------------------------------------------------------------------+
|                      Fly.io (Production)                          |
+------------------------------------------------------------------+
|  +--------------+  +--------------+  +------------------------+  |
|  |  Go App      |  |  Go App      |  |   Go App (reserve)     |  |
|  |  Instance 1  |  |  Instance 2  |  |                        |  |
|  +------+-------+  +------+-------+  +------------+-----------+  |
|         |                 |                       |              |
|         +-----------------+-----------------------+              |
|                           |                                      |
|                           v                                      |
|               +-----------------------+                          |
|               |   Neon PostgreSQL     |                          |
|               |   (Managed, Serverless)                          |
|               +-----------------------+                          |
+------------------------------------------------------------------+
```

## Future Considerations

### Planned Features

1. **WebSocket Support**: Real-time perspective updates
2. **GraphQL Subscriptions**: Live data feeds
3. **Full-Text Search**: PostgreSQL tsvector for content search
4. **Analytics Pipeline**: Aggregate perspective trends

### Scalability Path

1. **Horizontal**: Add more Go instances (stateless design)
2. **Database**: Read replicas, connection pooling
3. **Caching**: Redis for hot data
4. **CDN**: Static assets, API caching where appropriate

## References

- [Go Project Layout](https://github.com/golang-standards/project-layout)
- [Effective Go](https://go.dev/doc/effective_go)
- [chi Router Documentation](https://go-chi.io/)
- [gqlgen Documentation](https://gqlgen.com/)
- [sqlx Documentation](https://jmoiron.github.io/sqlx/)
- [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/)
