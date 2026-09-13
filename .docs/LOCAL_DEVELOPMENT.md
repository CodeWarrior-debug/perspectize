# Local Development Guide

Complete guide to setting up and running the Perspectize backend locally.

## Prerequisites

### Required Software

| Tool | Version | Installation |
|------|---------|--------------|
| Go | 1.25+ | [go.dev/dl](https://go.dev/dl/) |
| PostgreSQL | 18+ | Docker recommended (see below) |
| Docker | 24+ | [docker.com](https://docker.com) |
| Make | Any | Usually pre-installed on Mac/Linux |
| golang-migrate | v4.17+ | `go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest` |

### Optional Tools

| Tool | Purpose | Installation |
|------|---------|--------------|
| golangci-lint | Linting | `go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest` |
| air | Hot reload | `go install github.com/air-verse/air@latest` |
| DBeaver | DB GUI | [dbeaver.io](https://dbeaver.io) |

## Quick Start

```bash
# 1. Clone repository
git clone https://github.com/CodeWarrior-debug/perspectize.git
cd perspectize/backend

# 2. Start PostgreSQL (Docker)
make docker-up

# 3. Copy environment file
cp .env.example .env
# Edit .env with your settings

# 4. Install dependencies
go mod download

# 5. Install shared git hooks (auto-formats staged Go/Svelte/TS on commit)
make install-hooks

# 6. Run migrations
make migrate-up

# 7. Start the server
make run

# Server running at http://localhost:8080
# GraphQL Playground at http://localhost:8080/graphql
```

## Detailed Setup

### 1. Database Setup

#### Option A: Docker Compose (Recommended)

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:18-alpine
    container_name: perspectize-db
    environment:
      POSTGRES_USER: testuser
      POSTGRES_PASSWORD: testpass
      POSTGRES_DB: testdb
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U testuser"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

```bash
# Start database
make docker-up

# Verify connection
docker exec -it perspectize-db psql -U testuser -d testdb -c "SELECT version();"
```

#### Option B: Local PostgreSQL

```bash
# macOS (Homebrew)
brew install postgresql@18
brew services start postgresql@18

# Create database
createdb testdb
createuser -s testuser
```

### 2. Environment Configuration

Create `.env` file in `backend/`:

```bash
# Database
DATABASE_URL=postgres://testuser:testpass@localhost:5432/testdb?sslmode=disable

# YouTube API (optional for basic development)
YOUTUBE_API_KEY=your_youtube_api_key_here

# Server
PORT=8080
ENV=development

# Logging
LOG_LEVEL=debug
LOG_FORMAT=text  # text or json
```

### 3. Database Migrations

```bash
# Apply all migrations
make migrate-up

# Rollback last migration
make migrate-down

# Check migration status
make migrate-version

# Create new migration
make migrate-create
# Then enter migration name when prompted
```

#### Migration File Structure

```sql
-- migrations/000001_initial_schema.up.sql
CREATE TABLE IF NOT EXISTS content (
    id SERIAL PRIMARY KEY,
    url VARCHAR(2048) UNIQUE,
    name VARCHAR(255) NOT NULL UNIQUE,
    length INTEGER,
    length_units VARCHAR(50),
    content_type VARCHAR(100) NOT NULL,
    response JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_content_name ON content(name);
CREATE INDEX idx_content_type ON content(content_type);

-- migrations/000001_initial_schema.down.sql
DROP TABLE IF EXISTS content;
```

### 4. Running the Server

#### Standard Mode

```bash
make run
# or
go run cmd/server/main.go
```

#### Hot Reload Mode (Development)

```bash
# Install air if not already
go install github.com/air-verse/air@latest

# Run with hot reload
make dev
```

#### With Specific Flags

```bash
# Custom port
PORT=3000 make run

# Debug logging
LOG_LEVEL=debug make run

# Production mode locally
ENV=production make run
```

### 5. Running Tests

```bash
# All unit tests
make test

# With coverage
make test-coverage
# View report: open coverage.html

# Specific package
go test -v ./internal/core/services/...

# Single test
go test -v -run TestFunctionName ./path/to/package

# Race detection
go test -race ./...
```

## Project Structure

```
backend/
├── cmd/
│   └── server/
│       └── main.go           # Application entry point, DI wiring
├── internal/                  # Private application code
│   ├── config/
│   │   └── config.go         # Environment configuration
│   ├── core/                  # Domain layer (hexagonal core)
│   │   ├── domain/           # Domain models and entities
│   │   ├── ports/            # Interface definitions
│   │   │   ├── repositories/ # Repository interfaces
│   │   │   └── services/     # Service interfaces
│   │   └── services/         # Business logic
│   ├── adapters/             # Infrastructure layer
│   │   ├── graphql/          # GraphQL resolvers (primary adapter)
│   │   ├── repositories/     # PostgreSQL (secondary adapter)
│   │   └── youtube/          # YouTube API (secondary adapter)
│   └── middleware/           # HTTP middleware
├── pkg/                       # Public utilities
│   └── database/
│       └── connection.go     # DB connection management
├── migrations/                # SQL migrations
│   ├── 000001_initial_schema.up.sql
│   └── 000001_initial_schema.down.sql
├── test/
│   ├── integration/          # Integration tests
│   └── fixtures/             # Test data
├── schema.graphql            # GraphQL schema
├── gqlgen.yml                # gqlgen configuration
├── .env.example              # Environment template
├── .golangci.yml             # Linter configuration
├── docker-compose.yml        # Local services
├── Makefile                  # Build commands
├── go.mod
└── go.sum
```

## Common Tasks

### Adding a New API Endpoint

1. **Define the domain model** (if new):
   ```go
   // internal/core/domain/user_preference.go
   type UserPreference struct {
       ID        int
       UserID    int
       Theme     string
       CreatedAt time.Time
   }
   ```

2. **Create port interface**:
   ```go
   // internal/core/ports/repositories/user_preference_repository.go
   type UserPreferenceRepository interface {
       GetByUserID(ctx context.Context, userID int) (*domain.UserPreference, error)
       Upsert(ctx context.Context, pref *domain.UserPreference) error
   }
   ```

3. **Create service layer**:
   ```go
   // internal/core/services/user_preference_service.go
   type UserPreferenceService struct {
       repo ports.UserPreferenceRepository
   }
   ```

4. **Implement repository adapter**:
   ```go
   // internal/adapters/repositories/postgres/user_preference_repository.go
   ```

5. **Update GraphQL schema and regenerate**:
   ```bash
   make graphql-gen
   ```

6. **Implement resolver**:
   ```go
   // internal/adapters/graphql/resolvers/user_preference_resolver.go
   ```

7. **Wire in main.go**:
   ```go
   // cmd/server/main.go
   ```

8. **Write tests**

### Adding a GraphQL Query/Mutation

1. **Update schema**:
   ```graphql
   # schema.graphql
   type Query {
       userPreferences(userID: ID!): UserPreferences
   }

   type UserPreferences {
       id: ID!
       theme: String!
   }
   ```

2. **Regenerate code**:
   ```bash
   make graphql-gen
   ```

3. **Implement resolver**:
   ```go
   // internal/adapters/graphql/resolvers/resolver.go
   func (r *queryResolver) UserPreferences(ctx context.Context, userID string) (*model.UserPreferences, error) {
       // Implementation
   }
   ```

### Debugging

#### Database Queries

```bash
# Enable query logging in .env
LOG_LEVEL=debug

# Or use psql directly
docker exec -it perspectize-db psql -U testuser -d testdb

# View slow queries
SELECT query, calls, mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

#### Request Tracing

```go
// Check logs for request_id field
{"level":"info","request_id":"abc123","method":"POST","path":"/graphql"}
```

## Troubleshooting

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker ps | grep perspectize-db

# Check connection
psql $DATABASE_URL -c "SELECT 1"

# Reset database
docker compose down -v
make docker-up
make migrate-up
```

### Port Already in Use

```bash
# Find process using port
lsof -i :8080

# Kill it
kill -9 <PID>

# Or use different port
PORT=3000 make run
```

### Migration Failures

```bash
# Check current version
make migrate-version

# Force to specific version (careful!)
make migrate-force
# Enter version when prompted

# Start fresh
make migrate-down  # Repeat until at version 0
make migrate-up
```

### Go Module Issues

```bash
# Clean module cache
go clean -modcache

# Re-download
go mod download

# Tidy
go mod tidy
```

## IDE Setup

### VS Code

Recommended extensions:
- Go (official)
- Go Test Explorer
- PostgreSQL (by Chris Kolkman)
- Thunder Client (API testing)
- GraphQL (for schema syntax highlighting)

Settings (`.vscode/settings.json`):
```json
{
    "go.useLanguageServer": true,
    "go.lintTool": "golangci-lint",
    "go.lintFlags": ["--fast"],
    "editor.formatOnSave": true,
    "[go]": {
        "editor.defaultFormatter": "golang.go"
    }
}
```

### GoLand

- Enable "Go Modules" integration
- Set GOROOT to your Go installation
- Configure database data source for auto-completion

## Next Steps

1. Review `.docs/ARCHITECTURE.md` for system design
2. Check `.docs/AGENTS.md` for AI agent routing
3. Run `make test` to ensure everything works
