#!/bin/bash
# Builds a small Go + SvelteKit monorepo whose CLAUDE.md files contain six
# planted defects (D1-D6) and one correct control command. Graders check the
# audit report names each defect and does not flag the control.
set -euo pipefail

git init -q
git config user.name "Eval"
git config user.email "eval@example.com"

mkdir -p backend/cmd/server backend/internal/core/services backend/migrations frontend/src/routes .docs

# --- backend ---
cat > backend/go.mod <<'EOF'
module example.com/notes/backend

go 1.25
EOF

cat > backend/cmd/server/main.go <<'EOF'
package main

func main() {}
EOF

cat > backend/internal/core/services/note_service.go <<'EOF'
package services

type NoteService struct{}
EOF

cat > backend/migrations/000001_init.up.sql <<'EOF'
CREATE TABLE notes (id SERIAL PRIMARY KEY, body TEXT NOT NULL);
EOF

cat > backend/Makefile <<'EOF'
.PHONY: run test lint migrate-up

run:
	go run ./cmd/server

test:
	go test ./...

lint:
	golangci-lint run

migrate-up:
	migrate -path migrations -database "$$DATABASE_URL" up
EOF

# D1 stale path (internal/handlers/ does not exist)
# D2 missing Makefile target (make seed)
# D4 contradiction with root (runs migrate-up in setup)
# D6 wrong Go version (1.21 vs go.mod 1.25)
# Control: `make test` is correct and must NOT be flagged
cat > backend/CLAUDE.md <<'EOF'
# Backend

Go 1.21 HTTP API.

## Layout

- `cmd/server/` — entry point
- `internal/handlers/` — HTTP handlers, one file per resource
- `internal/core/services/` — business logic

## Commands

```bash
make migrate-up   # first-time setup: apply migrations to your DB
make seed         # load sample notes
make run          # server on :8080
make test         # all tests
```
EOF

# --- frontend ---
cat > frontend/package.json <<'EOF'
{
  "name": "notes-frontend",
  "private": true,
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "test:run": "vitest run"
  }
}
EOF

cat > frontend/src/routes/+page.svelte <<'EOF'
<h1>Notes</h1>
EOF

# D3 wrong script name (test:unit does not exist; real one is test:run)
cat > frontend/CLAUDE.md <<'EOF'
# Frontend

SvelteKit app (Svelte 5 runes only).

## Commands

```bash
pnpm run dev        # http://localhost:5173
pnpm run test:unit  # run unit tests once
```
EOF

# --- root ---
cat > .docs/ARCHITECTURE.md <<'EOF'
# Architecture
Hexagonal backend, SvelteKit frontend.
EOF

# D4 contradiction (never run migrate-up) vs backend/CLAUDE.md
# D5 dead doc link (.docs/DEPLOYMENT.md does not exist)
cat > CLAUDE.md <<'EOF'
# Notes App

Monorepo: `backend/` (Go API) and `frontend/` (SvelteKit).

## Rules

- Never run `make migrate-up` locally — `DATABASE_URL` points at the shared
  staging database. Migrations are applied manually at release time.
- Conventional commits (`feat`, `fix`, `chore`, `docs`).

## Docs

- [Architecture](.docs/ARCHITECTURE.md)
- [Deployment](.docs/DEPLOYMENT.md)
EOF

git add -A
git commit -qm "initial"
