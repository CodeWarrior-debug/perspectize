## CLAUDE.md Quality Audit Report

I found **8 significant issues** where documentation doesn't match the actual codebase:

### 🔴 Critical Issues (Breaking Documentation)

1. **Conflicting migration guidance** — Root CLAUDE.md and backend/CLAUDE.md contradict:
   - Root: "Never run `make migrate-up` locally — `DATABASE_URL` points at the shared staging database"
   - Backend: "make migrate-up # first-time setup: apply migrations to your DB"
   - **Reality**: Makefile has `migrate-up`, so this conflict creates confusion about when/where to run it

2. **Non-existent `make seed` command** — Backend CLAUDE.md documents:
   ```bash
   make seed         # load sample notes
   ```
   - **Reality**: No `seed` target in Makefile

3. **Frontend test script mismatch** — Frontend CLAUDE.md says:
   ```bash
   pnpm run test:unit
   ```
   - **Reality**: package.json only has `test:run`, not `test:unit`

4. **Missing DEPLOYMENT.md** — Root CLAUDE.md links to:
   ```
   - [Deployment](.docs/DEPLOYMENT.md)
   ```
   - **Reality**: File doesn't exist; only ARCHITECTURE.md exists in `.docs/`

### 🟡 Accuracy Issues (Version Drift)

5. **Go version outdated** — Backend CLAUDE.md states:
   ```
   Go 1.21 HTTP API
   ```
   - **Reality**: `go.mod` specifies `go 1.25` (4 versions behind)

6. **Architecture incomplete/misleading**:
   - Backend CLAUDE.md lists `internal/handlers/` — **doesn't exist**
   - Actual structure: only `internal/core/services/` exists with stub files
   - `cmd/server/main.go` is empty (just `func main() {}`)
   - `NoteService` is empty (no methods)

### 🟠 Documentation Gaps

7. **Frontend CLAUDE.md missing essentials**:
   - No package manager guidance (assumed pnpm; should be explicit)
   - No build command documented
   - No dependency installation step

8. **Root CLAUDE.md lacks setup instructions**:
   - No guidance on installing dependencies (`go mod`, `pnpm`)
   - No database setup steps
   - No instructions on running both frontend + backend together
   - Conventional commits rule documented, but no branch strategy guidance

### Summary

| File | Issue | Severity |
|------|-------|----------|
| root + backend/CLAUDE.md | Conflicting `make migrate-up` guidance | Critical |
| backend/CLAUDE.md | References non-existent `make seed` | Critical |
| frontend/CLAUDE.md | Wrong test script name (`test:unit` → `test:run`) | Critical |
| root/CLAUDE.md | Missing referenced DEPLOYMENT.md | Critical |
| backend/CLAUDE.md | Go version (1.21 → 1.25) | High |
| backend/CLAUDE.md | Missing internal/handlers/ directory | High |
| frontend/CLAUDE.md | Package manager not explicitly stated | Medium |
| root/CLAUDE.md | No end-to-end setup instructions | Medium |

**Recommendation**: These docs describe an intended architecture that doesn't match the current implementation. The backend appears to be a stub (empty main.go, empty service classes). Either the docs need alignment with actual code, or the implementation needs to be completed to match the design.
