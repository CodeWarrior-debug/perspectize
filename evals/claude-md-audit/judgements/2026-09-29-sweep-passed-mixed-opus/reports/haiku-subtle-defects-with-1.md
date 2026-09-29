## CLAUDE.md Quality Report

### Summary
- **Files found:** 3
- **Average score:** 48/100 (Grade: D)
- **Files needing update:** 3/3 (All have accuracy or completeness issues)

### File-by-File Assessment

---

#### 1. `./CLAUDE.md` (Project Root)
**Score: 35/100 (Grade: D)**

| Criterion | Score | Notes |
|-----------|-------|-------|
| Commands/workflows | 2/20 | No setup commands provided; monorepo setup unclear |
| Architecture clarity | 5/20 | Minimal structure info; links to bare ARCHITECTURE.md (only 1 line) |
| Non-obvious patterns | 3/15 | Nothing about monorepo tooling or dependencies |
| Conciseness | 8/15 | Very brief, but too brief—lacks actionable info |
| Currency | 10/15 | Node version claim (20) conflicts with actual code (≥22) |
| Actionability | 2/15 | No copy-paste commands; vague references |

**Critical Issues:**
- ❌ **Node version mismatch**: States "Use Node 20" but `frontend/package.json` requires `">=22"`
- ❌ **No root commands**: Missing monorepo setup steps (pnpm install? workspace setup?)
- ❌ **Architecture doc is empty**: `.docs/ARCHITECTURE.md` is literally one line; more detailed than root CLAUDE.md would help

**Recommended additions:**
- Node version requirement (correct to ≥22)
- Initial setup commands (pnpm install, how to run both services)
- Clarify which package manager is used (pnpm vs npm)

---

#### 2. `./frontend/CLAUDE.md`
**Score: 42/100 (Grade: D)**

| Criterion | Score | Notes |
|-----------|-------|-------|
| Commands/workflows | 8/20 | Commands listed but some are inaccurate |
| Architecture clarity | 6/20 | Vite/SvelteKit basics mentioned; proxy setup is incorrect |
| Non-obvious patterns | 4/15 | Proxy forwarding described but with wrong target port |
| Conciseness | 10/15 | Reasonably concise |
| Currency | 5/15 | Multiple factual inaccuracies vs. actual code |
| Actionability | 9/15 | Commands are mostly correct but one doesn't exist |

**Critical Issues:**
- ❌ **Node version mismatch**: States "Node 18+" but `package.json` requires `">=22"`
- ❌ **Wrong proxy port**: Says "/api is proxied to the backend" then claims "forwards to the API on port 3000", but `vite.config.ts` shows `'http://localhost:8080'` (correct—backend runs on 8080, not 3000)
- ❌ **Non-existent command**: Lists `pnpm run check` but actual script is `typecheck`, not `check`
- ❌ **Missing setup**: No `pnpm install` instruction before running dev

**Recommended additions:**
- Correct Node version
- Fix proxy documentation (clarify it forwards to localhost:8080 where the Go backend runs)
- Fix script name to `pnpm run typecheck`
- Add `pnpm install` as first step

---

#### 3. `./backend/CLAUDE.md`
**Score: 58/100 (Grade: C)**

| Criterion | Score | Notes |
|-----------|-------|-------|
| Commands/workflows | 10/20 | Commands exist but `db-reset` uses different env var than documented |
| Architecture clarity | 12/20 | Mentions validation pattern and repo injection, but structure vague |
| Non-obvious patterns | 8/15 | Validation and DI pattern is helpful; could be clearer |
| Conciseness | 12/15 | Good balance; readable |
| Currency | 8/15 | Env var name is wrong (`DB_URL` vs actual `DATABASE_URL`) |
| Actionability | 8/15 | Commands work but require non-obvious env setup |

**Critical Issues:**
- ❌ **Environment variable mismatch**: Documents `DB_URL` but code uses `DATABASE_URL` (found in `cmd/server/main.go`)
- ❌ **Missing Go setup**: No mention of Go version requirement or module setup
- ❌ **Incomplete database setup**: `db-reset` command exists but requires `DATABASE_URL` env var—not mentioned how to set it

**Recommended additions:**
- Correct env var name to `DATABASE_URL`
- Add Go version requirement
- Document how to set `DATABASE_URL` for local development
- Clarify that `mk/db.mk` is included in main Makefile

---

### Key Patterns Across All Files

1. **Environment variable inconsistency**: Backend docs mention `DB_URL` but code uses `DATABASE_URL`
2. **Node version rot**: Root and frontend both claim older versions than actual requirement
3. **Proxy/port confusion**: Frontend docs cite wrong port for backend
4. **Missing initial setup**: None document the `pnpm install` or Go module setup steps
5. **Architecture doc is incomplete**: The linked `ARCHITECTURE.md` only has one sentence

Would you like me to update these CLAUDE.md files with corrections? I'll fix:
- All version requirements
- Proxy port clarification
- Correct command names
- Correct environment variable names
- Add initial setup steps
