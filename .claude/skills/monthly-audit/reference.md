# Monthly Audit — Reference

Detail supporting `SKILL.md`. Loaded by Claude only when a phase needs more
than the control-flow summary in SKILL.md.

## Repo facts this skill assumes

- Go module: `github.com/CodeWarrior-debug/perspectize/backend`, Go 1.26.
- Core/adapter boundary: `backend/internal/core` (pure domain) must not
  import `backend/internal/adapters`, `gorm.io/gorm`, or
  `github.com/99designs/gqlgen`.
- Migrations: `backend/migrations/NNNNNN_description.{up,down}.sql`, strictly
  numbered, no gaps expected. Latest at time of writing: `000027`.
- Frontend: SvelteKit + Vitest. `pnpm run test:run` (unit), `pnpm run
  test:coverage`. `jscpd` and `knip` are not yet wired as package scripts
  except `test:duplication` (jscpd only) — call `pnpm dlx knip` directly.
- `backend/.golangci.yml` is v2 format; this audit's collection step runs it
  as-is, it does **not** modify it. (The `core-purity` depguard rule added
  separately in part B of this initiative runs as part of normal CI/lint,
  not as an audit-only check — the audit's `architecture` agent still greps
  for violations directly since golangci-lint's depguard only fails, not
  reports counts/trends.)

## Collect (Phase 1) — exact commands

Run each only if `command -v <tool>` succeeds (local mode). Redirect all
output to files under `.docs/audits/raw/YYYY-MM/`; never inline into chat.

```bash
# Go lint
(cd backend && golangci-lint run --output.json.path=stdout ./...) \
  > .docs/audits/raw/YYYY-MM/golangci-lint.json 2>&1 || true

# Go vuln scan
(cd backend && go run golang.org/x/vuln/cmd/govulncheck@latest -json ./...) \
  > .docs/audits/raw/YYYY-MM/govulncheck.json 2>&1 || true

# Dead code
(cd backend && go run golang.org/x/tools/cmd/deadcode@latest ./...) \
  > .docs/audits/raw/YYYY-MM/deadcode.txt 2>&1 || true

# Go test coverage — SKIP if no Postgres reachable at $DATABASE_URL
# (never point this at the shared Sevalla dev DB from a local run)
if [ -n "${DATABASE_URL:-}" ] && pg_isready -d "$DATABASE_URL" >/dev/null 2>&1; then
  (cd backend && go test -coverprofile=coverage.out ./...) \
    > .docs/audits/raw/YYYY-MM/go-test.txt 2>&1 || true
  cp backend/coverage.out .docs/audits/raw/YYYY-MM/go-coverage.out 2>/dev/null || true
fi

# JS/TS duplication
(cd frontend && pnpm exec jscpd src/ --min-lines 3 --min-tokens 25 --reporters json) \
  > .docs/audits/raw/YYYY-MM/jscpd.json 2>&1 || true

# Unused exports/files
(cd frontend && pnpm dlx knip --reporter json) \
  > .docs/audits/raw/YYYY-MM/knip.json 2>&1 || true

# Frontend coverage
(cd frontend && pnpm run test:coverage) \
  > .docs/audits/raw/YYYY-MM/vitest-coverage.txt 2>&1 || true

# SQL lint on changed migrations only
CHANGED_SQL="$(git diff --name-only "${prev_tag:-origin/main}"..HEAD -- 'backend/migrations/*.up.sql')"
if command -v squawk >/dev/null 2>&1 && [ -n "$CHANGED_SQL" ]; then
  squawk $CHANGED_SQL > .docs/audits/raw/YYYY-MM/squawk.txt 2>&1 || true
fi

# Dependency vuln / secrets (optional, likely absent locally — note as skipped)
command -v osv-scanner >/dev/null 2>&1 && \
  osv-scanner --recursive . > .docs/audits/raw/YYYY-MM/osv-scanner.json 2>&1 || true
command -v gitleaks >/dev/null 2>&1 && \
  gitleaks detect --source . --report-format json --report-path .docs/audits/raw/YYYY-MM/gitleaks.json || true
```

In `ci` mode, none of the above run — the workflow's `collect` job already
produced these same filenames inside `./audit-artifacts/`; copy or symlink
them into `.docs/audits/raw/YYYY-MM/` before Phase 2.

## Report (Phase 4) — template

```markdown
# Monthly Audit — YYYY-MM

## Summary
<2-4 sentences: overall health delta since last audit>

## Top 5 Actions
1. ...

## Trend
| Month | New | Persisting | Resolved | Total open |
|-------|-----|------------|----------|------------|
| YYYY-MM | n | n | n | n |

## Findings by Area
### Architecture
### Docs Drift
### Tests
### Security
### Dependencies
### Migrations

## Looks Bad But Is Fine
<known false positives, accepted risk, intentional deviations>

## Tools Skipped This Run
<tool: reason (not installed / no DB reachable / etc.)>
```

`findings.json` shape (one array entry per finding, feeds next month's
Phase 3 diff):

```json
{
  "id": "sha256(rule+path)[:12]",
  "area": "architecture|docs-drift|tests|security|deps|migrations",
  "severity": "low|medium|high",
  "rule": "string",
  "file": "path/to/file.go",
  "line": 42,
  "evidence": "string",
  "fix": "string",
  "effort": "small|medium|large",
  "status": "new|persisting|resolved",
  "months_seen": 1
}
```
