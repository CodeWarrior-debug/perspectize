# Agent Routing Guide

This document helps AI agents (Claude Code, subagents, skills) navigate the Perspectize codebase efficiently.

## Quick Navigation Matrix

| Task | Read First | Subagent | Model | Skills to Load |
|------|------------|----------|-------|----------------|
| Go backend work | `backend/internal/` | `go-backend` | Sonnet | `backend-development` |
| GraphQL changes | `schema.graphql` | `graphql-designer` | Sonnet | `api-scaffolding:graphql-architect` |
| Database migrations | `migrations/` | `db-migration` | Sonnet | `devops-tools:databases` |
| Code review | `.golangci.yml` | `code-reviewer` | Haiku | - |
| Test writing | `*_test.go` files | `test-writer` | Haiku | - |
| Architecture decisions | `docs/ARCHITECTURE.md` | - | Opus | - |

## Domain-Specific Instructions

### Go Backend (`backend/`)

**Entry Points:**
- `cmd/server/main.go` - Application bootstrap, DI wiring
- `internal/core/domain/` - Domain models (start here for new entities)
- `internal/core/services/` - Business logic (start here for feature logic)
- `internal/adapters/repositories/` - Database access (start here for queries)

**Key Patterns:**
```go
// Resolver pattern - delegates to service layer
func (r *queryResolver) Content(ctx context.Context, id string) (*model.Content, error) {
    return r.contentService.GetByID(ctx, id)
}

// Service pattern - interface-first
type ContentService interface {
    GetByID(ctx context.Context, id string) (*domain.Content, error)
    Create(ctx context.Context, input dto.CreateContentInput) (*domain.Content, error)
}

// Repository pattern - sqlx named queries
func (r *ContentRepository) GetByID(ctx context.Context, id int) (*domain.Content, error) {
    var content domain.Content
    err := r.db.GetContext(ctx, &content,
        `SELECT * FROM content WHERE id = $1`, id)
    return &content, err
}
```

**Do:**
- Use `context.Context` as first parameter everywhere
- Return `error` as last return value
- Use sqlx named queries for complex SQL
- Write table-driven tests
- Follow hexagonal architecture (domain never imports adapters)

**Don't:**
- Put business logic in resolvers
- Use raw SQL string concatenation
- Ignore errors
- Use `panic` in library code
- Add database tags to domain models

### GraphQL (`schema.graphql`)

**Workflow:**
1. Edit schema: `schema.graphql`
2. Regenerate: `make graphql-gen`
3. Implement resolver: `internal/adapters/graphql/resolvers/`
4. Test at `/graphql`

**Resolver Pattern:**
```go
func (r *queryResolver) Content(ctx context.Context, id string) (*model.Content, error) {
    // Delegate to service layer - don't put logic here
    return r.contentService.GetByID(ctx, id)
}

// Use DataLoader for N+1 prevention
func (r *contentResolver) Perspectives(ctx context.Context, obj *model.Content) ([]*model.Perspective, error) {
    return r.loaders.PerspectivesByContentID.Load(ctx, obj.ID)
}
```

### Database (`migrations/`)

**Migration Naming:**
```
{sequence}_{description}.up.sql
{sequence}_{description}.down.sql
```

**Examples:**
- `000001_initial_schema.up.sql`
- `000002_add_perspectives_table.up.sql`
- `000003_add_user_preferences.up.sql`

**Rules:**
1. Always provide both `.up.sql` AND `.down.sql`
2. Make down migrations reversible when possible
3. Use `IF EXISTS` / `IF NOT EXISTS` for safety
4. Add indexes for foreign keys and frequently queried columns
5. Use `TIMESTAMPTZ` not `TIMESTAMP` for times

**PostgreSQL-Specific:**
```sql
-- Use custom domains for constraints
CREATE DOMAIN valid_integer_range AS INTEGER
CHECK (VALUE BETWEEN 0 AND 10000);

-- Use JSONB for flexible data
response JSONB,

-- Index JSONB paths you query
CREATE INDEX idx_content_response_title
ON content ((response->>'title'));
```

### Testing (`*_test.go`, `test/`)

**Unit Test Location:** Same package as code being tested
```
internal/core/services/
├── perspective_service.go
└── perspective_service_test.go  # Tests for perspective_service.go
```

**Integration Tests:** `test/integration/`
```
test/
├── integration/
│   ├── content_test.go
│   └── perspective_test.go
└── fixtures/
    └── test_data.sql
```

**Test Pattern:**
```go
func TestPerspectiveService_Create(t *testing.T) {
    tests := []struct {
        name    string
        input   dto.CreatePerspectiveInput
        want    *domain.Perspective
        wantErr bool
    }{
        {
            name: "valid perspective",
            input: dto.CreatePerspectiveInput{
                ContentID: 1,
                Quality:   7500,
            },
            want: &domain.Perspective{Quality: 7500},
        },
        {
            name:    "quality out of range",
            input:   dto.CreatePerspectiveInput{Quality: 15000},
            wantErr: true,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            // Setup mocks...
            got, err := service.Create(ctx, tt.input)
            if tt.wantErr {
                assert.Error(t, err)
                return
            }
            assert.NoError(t, err)
            assert.Equal(t, tt.want.Quality, got.Quality)
        })
    }
}
```

## Build & Test Commands

```bash
# Development
make run              # Start server on :8080
make dev              # Start with hot reload (air)

# Testing
make test             # Run unit tests
make test-coverage    # Generate coverage report

# Database
make migrate-up       # Apply migrations
make migrate-down     # Rollback one migration
make migrate-version  # Show migration status
make migrate-create   # Create new migration

# Code Quality
make lint             # Run golangci-lint
make fmt              # Format code

# GraphQL
make graphql-gen      # Regenerate gqlgen code
```

## File Discovery Patterns

When searching the codebase, use these patterns:

```bash
# Find all domain models
Glob: internal/core/domain/*.go

# Find all services
Glob: internal/core/services/*.go

# Find all tests
Glob: **/*_test.go

# Find repository implementations
Glob: internal/adapters/repositories/**/*.go

# Find migrations
Glob: migrations/*.sql

# Find GraphQL schema
Glob: schema.graphql

# Search for error handling
Grep: "if err != nil"

# Search for TODO/FIXME
Grep: "TODO|FIXME"
```

## Context Boundaries

### What Each Subagent Should Know

**`go-backend` (Sonnet):**
- Go idioms and best practices
- Hexagonal architecture patterns
- sqlx query patterns
- Error handling conventions
- Project structure

**`graphql-designer` (Sonnet):**
- GraphQL schema design
- gqlgen configuration
- Resolver patterns
- DataLoader for N+1
- Input validation

**`db-migration` (Sonnet):**
- PostgreSQL DDL syntax
- Migration best practices
- Indexing strategies
- Data type selection

**`code-reviewer` (Haiku):**
- Go style guidelines
- golangci-lint rules
- Common code smells
- Security considerations

**`test-writer` (Haiku):**
- Table-driven test patterns
- testify assertions
- sqlmock for DB mocking
- Test file organization

## Prompt Caching Optimization

For agents working on this project, structure prompts with:

1. **First (cacheable):** Project context from CLAUDE.md
2. **Second (cacheable):** Relevant skill content
3. **Third (cacheable):** Architecture patterns from this file
4. **Last (dynamic):** Specific task instructions

This ordering maximizes cache hits across sessions.

## Escalation Rules

| Situation | Escalate To |
|-----------|-------------|
| Architecture change affecting multiple packages | Opus |
| Security-related code review | Opus |
| Performance optimization decisions | Opus |
| Simple bug fix | Stay with current model |
| New endpoint following existing pattern | Sonnet |
| Documentation updates | Haiku |
