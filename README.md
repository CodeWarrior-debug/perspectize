# Perspectize

<!-- TODO: Add hero banner image -->
<!-- ![Perspectize Banner](assets/banner.png) -->

A platform for storing, refining, and sharing perspectives on content, with philosophy that the app should give the user calm and control - not addicting and endlessly distracting the user, in the way of many sharing platforms.  Currently supports YouTube videos and Bible passages, with a foundation designed to support more content types (books, articles, podcasts, etc.).

<!-- TODO: Add demo GIF showing the Activity page in action -->
<!-- ![Perspectize Demo](assets/demo.gif) -->

## Overview

Perspectize helps users organize and analyze video content by automatically fetching metadata from YouTube and presenting it in a powerful, filterable data grid. Users can track their video library, view statistics, and (eventually) share perspectives with others.

## Tech Stack

**Backend** — Go 1.27+
- GraphQL API with gqlgen
- PostgreSQL database with GORM and pgx
- Hexagonal architecture (ports & adapters)
- YouTube Data API v3 integration

**Frontend** — SvelteKit + Svelte 5
- TanStack Query for data fetching
- Clerk for authentication
- AG Grid for data tables
- shadcn-svelte UI components
- Tailwind CSS v4

## Project Structure

```
perspectize/
├── backend/           # Go GraphQL API
│   ├── cmd/server/    # Entry point
│   ├── internal/      # Core application (hexagonal architecture)
│   ├── migrations/    # PostgreSQL migrations
│   └── schema.graphql # GraphQL schema
├── frontend/          # SvelteKit web app
│   ├── src/
│   │   ├── routes/    # SvelteKit pages
│   │   ├── lib/       # Components, queries, utilities
│   │   └── app.css    # Global styles & design tokens
│   └── tests/         # Vitest tests
├── .docs/             # Architecture & development guides
├── docs/              # Plans and specs (docs/superpowers/)
└── .planning/         # GSD workflow artifacts (legacy)
```

## Getting Started

### Prerequisites

- Go 1.27+
- Node.js 22+ (CI runs 24) and pnpm 10
- PostgreSQL 17 (what CI runs; older versions are untested)
- YouTube Data API key and Clerk keys, or use the demo stack below

### Backend Setup

```bash
cd backend

# Set environment variables
export DATABASE_URL="postgres://user:pass@localhost:5432/perspectize?sslmode=disable"
export YOUTUBE_API_KEY="your-api-key"

# Run migrations
migrate -path ./migrations -database "$DATABASE_URL" up

# Start server
go run cmd/server/main.go
```

The GraphQL API runs at `http://localhost:8080/graphql`.

### Frontend Setup

```bash
cd frontend

# Install dependencies
pnpm install

# Start dev server
pnpm run dev
```

The web app runs at `http://localhost:5173`.

### Try it without any keys

A self-contained demo stack (Docker, seeded sample users, no Clerk, no YouTube key) runs with:

```bash
make demo-up   # http://localhost:4173 — pick a persona in the Sign in dialog
```

See [Demo Mode](.docs/DEMO_MODE.md).

## Development

### Running Tests

```bash
# Backend tests
cd backend && go test ./...

# Frontend tests
cd frontend && pnpm run test:run
```

### Code Quality

```bash
# Frontend type checking
cd frontend && pnpm run check
```

## Documentation

- [Architecture](.docs/ARCHITECTURE.md) — System design and hexagonal architecture
- [Local Development](.docs/LOCAL_DEVELOPMENT.md) — Detailed setup guide
- [Domain Guide](.docs/DOMAIN_GUIDE.md) — Domain layer patterns
- [Go Patterns](.docs/GO_PATTERNS.md) — Error handling and DB patterns
- [Demo Mode](.docs/DEMO_MODE.md) — Docker demo stack with seeded personas
- [Query Budget](.docs/QUERY_BUDGET.md) — Query-count tests and caching rules
- [PR Workflow](.docs/PR_WORKFLOW.md) — PR templates, labels and merging
- [Feature Backlog](FEATURE_BACKLOG.md) — Future ideas and enhancements

## Contributing

This project uses conventional commits (`feat`, `fix`, `refactor`, `chore`, `docs`, `test`).

Please see the development guides in `.docs/` before contributing.

## License

This project is licensed under the **GNU Affero General Public License v3.0** (AGPL-3.0).

See [LICENSE](LICENSE) for the full license text.

### What this means

- You can use, modify, and distribute this software
- If you modify and deploy it as a network service, you must release your source code
- All derivative works must also be licensed under AGPL-3.0
- No warranty is provided

---

Built with care by the Perspectize team.

