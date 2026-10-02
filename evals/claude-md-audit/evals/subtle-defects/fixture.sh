#!/bin/bash
# Harder fixture: six defects that need cross-file reasoning or reading code
# (S1-S6), plus traps that look wrong but are correct (T1-T3). See graders/.
set -euo pipefail

git init -q
git config user.name "Eval"
git config user.email "eval@example.com"

mkdir -p backend/cmd/server backend/internal/core/validation/rules backend/internal/adapters/postgres backend/mk frontend/src/routes .docs

cat > backend/go.mod <<'EOF'
module example.com/notes/backend

go 1.25
EOF

# S2 truth: validation lives in internal/core/validation (docs say internal/validate)
cat > backend/internal/core/validation/rules/note.go <<'EOF'
package rules

// MaxBodyLen caps a note body.
const MaxBodyLen = 10_000
EOF

# S3 truth: constructor is NewNoteRepository (docs say NewNoteRepo)
cat > backend/internal/adapters/postgres/note_repository.go <<'EOF'
package postgres

type NoteRepository struct{}

func NewNoteRepository() *NoteRepository { return &NoteRepository{} }
EOF

# S1 truth: API listens on :8080. S5 truth: DATABASE_URL (docs say DB_URL)
cat > backend/cmd/server/main.go <<'EOF'
package main

import (
	"net/http"
	"os"
)

func main() {
	_ = os.Getenv("DATABASE_URL")
	_ = http.ListenAndServe(":8080", nil)
}
EOF

# T1 trap: db-reset lives in an included makefile, so it DOES exist
cat > backend/Makefile <<'EOF'
include mk/db.mk

.PHONY: run test

run:
	go run ./cmd/server

test:
	go test ./...
EOF

cat > backend/mk/db.mk <<'EOF'
.PHONY: db-reset

db-reset:
	psql "$$DATABASE_URL" -f scripts/reset.sql
EOF

mkdir -p backend/scripts
cat > backend/scripts/reset.sql <<'EOF'
DROP TABLE IF EXISTS notes;
CREATE TABLE notes (id SERIAL PRIMARY KEY, body TEXT NOT NULL);
EOF

cat > backend/CLAUDE.md <<'EOF'
# Backend

## Commands

```bash
make run       # API server
make test
make db-reset  # wipe and recreate the local DB
```

## Conventions

Request validation is centralised: every handler calls into the shared
rules package under `internal/validate/` before touching a repository, so
don't re-check lengths in handlers.

Repositories are built with `postgres.NewNoteRepo()` and injected in `main.go`.

The server reads its connection string from `DB_URL`.
EOF

# S4 truth: type-check script is "typecheck" (docs say "check").
# S6 truth: engines requires Node >=22 (root says 20, frontend says 18+).
# T2 trap: test:e2e exists. T3 trap: vite proxy /api -> :8080 is correct.
cat > frontend/package.json <<'EOF'
{
  "name": "notes-frontend",
  "private": true,
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "vite dev",
    "typecheck": "svelte-check",
    "test:e2e": "playwright test"
  }
}
EOF

cat > frontend/vite.config.ts <<'EOF'
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: { proxy: { '/api': 'http://localhost:8080' } }
});
EOF

cat > frontend/playwright.config.ts <<'EOF'
import { defineConfig } from '@playwright/test';

export default defineConfig({ testDir: 'tests/e2e' });
EOF

cat > frontend/pnpm-lock.yaml <<'EOF'
lockfileVersion: '9.0'
EOF

cat > frontend/src/routes/+page.svelte <<'EOF'
<h1>Notes</h1>
EOF

cat > frontend/CLAUDE.md <<'EOF'
# Frontend

Requires Node 18+.

```bash
pnpm run dev       # dev server; /api is proxied to the backend
pnpm run check     # type-check
pnpm run test:e2e  # Playwright
```

The dev proxy forwards `/api` to the API on port 3000 (see `vite.config.ts`).
EOF

cat > .docs/ARCHITECTURE.md <<'EOF'
# Architecture
Go API + SvelteKit frontend.
EOF

cat > CLAUDE.md <<'EOF'
# Notes App

Monorepo: `backend/` (Go API on :8080) and `frontend/` (SvelteKit).
Use Node 20 for the frontend.

See [Architecture](.docs/ARCHITECTURE.md).
EOF

git add -A
git commit -qm "initial"
