# Perspectize Go Backend

Go implementation of the Perspectize backend, migrated from C# ASP.NET Core.

## Overview

This is a RESTful API for storing, refining, and sharing perspectives on content (initially YouTube videos). Built with Go, PostgreSQL 17, and focused on simplicity and developer experience.

## Prerequisites

- **Go**: 1.21 or later
- **PostgreSQL**: 17.x
- **Docker & Docker Compose**: For local PostgreSQL (optional)
- **golang-migrate**: For database migrations

## Quick Start

### 1. Install Dependencies

```bash
go mod download
```

### 2. Setup PostgreSQL

Using Docker:
```bash
make docker-up
```

Or use your existing PostgreSQL instance (update config/config.json).

### 3. Run Migrations

> Only against a local or demo database. With a Neon `DATABASE_URL` this hits the shared database; see [.docs/MIGRATION_ROLLOUT.md](../.docs/MIGRATION_ROLLOUT.md).

```bash
make migrate-up
```

### 4. Configure

Copy the example config and add your secrets:
```bash
cp config/config.example.json config/config.json
```

Set environment variables:
```bash
export DATABASE_PASSWORD=testpass
export YOUTUBE_API_KEY=your_youtube_api_key
```

### 5. Run the Server

```bash
make run
```

Server starts on `http://localhost:8080`

### 6. View API Documentation

Browse to `http://localhost:8080/swagger/index.html`

## Development

### Available Make Commands

```bash
make build          # Build the binary
make run            # Run the application
make test           # Run tests
make test-coverage  # Run tests with coverage report
make migrate-up     # Run database migrations
make migrate-down   # Rollback last migration
make swagger        # Generate Swagger docs
make lint           # Run linter
make fmt            # Format code
make docker-up      # Start PostgreSQL in Docker
make docker-down    # Stop Docker containers
```

### Project Structure

```
backend/
├── cmd/server/          # Application entry point
├── internal/            # Private application code
│   ├── config/          # Configuration loading
│   ├── models/          # Domain models
│   ├── dto/             # Request/Response DTOs
│   ├── controllers/     # HTTP controllers
│   ├── services/        # Business logic
│   ├── repositories/    # Database access
│   ├── middleware/      # HTTP middleware
│   └── validator/       # Input validation
├── pkg/database/        # Database connection
├── migrations/          # SQL migration files
├── test/                # Tests
├── config/              # Configuration files
└── docs/                # Generated Swagger docs
```

### Running Tests

```bash
# Unit tests only (fast)
make test

# Integration tests (requires database)
go test -tags=integration ./...

# With coverage
make test-coverage
```

## API Endpoints

### Content
- `GET /content` - List all content
- `GET /content/{name}` - Get content by name

### YouTube
- `GET /youtube/video?videoId={id}` - Fetch video from YouTube API
- `POST /youtube/videos` - Import multiple videos
- `PUT /youtube/videos` - Update videos

### Perspectives
- `GET /perspectives/{username}` - Get user's perspectives
- `GET /perspectives/{id}` - Get single perspective
- `POST /perspectives` - Create perspectives (batch)
- `PUT /perspectives/{id}` - Update perspective
- `DELETE /perspectives` - Delete perspectives (batch)

### Health
- `GET /health` - Health check endpoint

## Configuration

Configuration is loaded from:
1. `config/config.json` - Default configuration
2. Environment variables - Override config.json (for secrets)

### Environment Variables

- `DATABASE_PASSWORD` - PostgreSQL password
- `YOUTUBE_API_KEY` - YouTube Data API v3 key

## Database

Uses PostgreSQL 17 with advanced features:
- JSONB columns for structured data
- Array types for collections
- Custom domain types for validation
- Triggers for automatic timestamp updates

### Migrations

Migrations are SQL files in `migrations/` directory:
- `000001_*.up.sql` - Forward migration
- `000001_*.down.sql` - Rollback migration

## Architecture

See [Architecture Plan](../.cursor/docs/1-architecture-plan.md) for detailed design decisions.

### Key Technologies

- **Web Framework**: `net/http` + `chi` router
- **Database**: `sqlx` + `pgx` driver (PostgreSQL)
- **Migrations**: `golang-migrate`
- **Validation**: `go-playground/validator`
- **Documentation**: `swaggo/swag` (OpenAPI/Swagger)
- **Logging**: `log/slog` (structured logging)
- **Testing**: `testing` + `testify` + `sqlmock`

## Learning Resources

New to Go? Check out:
- [Effective Go](https://go.dev/doc/effective_go)
- [Go by Example](https://gobyexample.com/)
- [Tour of Go](https://tour.golang.org/)

## Migration from C#

This project is a port of the C# ASP.NET Core backend. Key differences:
- Direct SQL (sqlx) instead of Entity Framework
- Manual dependency injection instead of DI container
- Explicit error handling (no exceptions)
- Interfaces for dependency injection

## License

[Your License Here]

## Contributing

[Your Contributing Guidelines Here]
