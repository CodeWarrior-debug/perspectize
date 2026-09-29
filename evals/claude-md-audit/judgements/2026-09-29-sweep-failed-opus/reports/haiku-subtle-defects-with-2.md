## CLAUDE.md Quality Report

### Summary
- **Files found:** 3 (root, frontend, backend)
- **Average score:** 62/100
- **Files needing update:** 3 (all have accuracy issues)

---

### File-by-File Assessment

#### 1. `./CLAUDE.md` (Project Root)
**Score: 60/100 (Grade: C)**

| Criterion | Score | Notes |
|-----------|-------|-------|
| Commands/workflows | 10/20 | No build/run commands documented at root level |
| Architecture clarity | 12/20 | Monorepo structure clear but minimal |
| Non-obvious patterns | 8/15 | Doesn't explain port relationships or startup sequence |
| Conciseness | 15/15 | ✓ Appropriately brief |
| Currency | 8/15 | Node version incorrect (says "20", package.json requires "22") |
| Actionability | 7/15 | References architecture doc which is nearly empty (2 lines) |

**Issues:**
- Node version is outdated: says "Use Node 20" but package.json specifies `>=22`
- References `.docs/ARCHITECTURE.md` which only contains "Go API + SvelteKit frontend." — not helpful
- Doesn't explain how to start the app (should mention running both backend and frontend)

**Recommended additions:**
- Clarify Node version requirement (22+)
- Quick start section with commands to run backend and frontend
- Clarify port assignments (backend: 8080, frontend dev: 5173)

---

#### 2. `./frontend/CLAUDE.md`
**Score: 55/100 (Grade: D+)**

| Criterion | Score | Notes |
|-----------|-------|-------|
| Commands/workflows | 12/20 | ❌ Script names don't match package.json |
| Architecture clarity | 10/20 | No mention of SvelteKit structure or routes |
| Non-obvious patterns | 5/15 | Proxy setup mentioned but no other patterns documented |
| Conciseness | 15/15 | ✓ Appropriately brief |
| Currency | 10/15 | Node version severely outdated (says "18+", requires "22") |
| Actionability | 8/15 | Scripts don't match actual package.json |

**Issues:**
- **Critical:** Script names are wrong. CLAUDE.md says:
  - `pnpm run check` → actually `typecheck` in package.json
  - Script commands don't match what's actually in package.json
- Node version is significantly outdated (says "18+", package.json requires "22")
- No mention of SvelteKit conventions or project structure

**Recommended additions:**
- Correct script names to match package.json (`typecheck` not `check`)
- Update Node version to 22+
- Add info about SvelteKit routes structure

---

#### 3. `./backend/CLAUDE.md`
**Score: 70/100 (Grade: C+)**

| Criterion | Score | Notes |
|-----------|-------|-------|
| Commands/workflows | 16/20 | ✓ Commands are correct (make run, test, db-reset) |
| Architecture clarity | 12/20 | Mentions validation convention but sparse on structure |
| Non-obvious patterns | 12/15 | ✓ Good coverage of validation patterns |
| Conciseness | 15/15 | ✓ Well-written, focused |
| Currency | 10/15 | ❌ env var name wrong: says `DB_URL`, code uses `DATABASE_URL` |
| Actionability | 5/15 | Doesn't explain how to set up DATABASE_URL or start the server |

**Issues:**
- **Critical:** Environment variable name is wrong: says `DB_URL` but `main.go` reads `DATABASE_URL`
- Missing server port documentation (listens on 8080)
- No info on how to set up the database URL locally

**Recommended additions:**
- Correct env var name from `DB_URL` to `DATABASE_URL`
- Add server port info (`:8080`)
- Add quick setup for local DATABASE_URL

---

### Summary of Critical Issues

1. **Node version mismatch:** Root and frontend docs say 18–20, but package.json requires 22+
2. **Frontend script names:** Documentation lists `pnpm run check`, but it should be `typecheck`
3. **Backend env var:** Documentation says `DB_URL`, but code reads `DATABASE_URL`
4. **Missing architecture:** Referenced `.docs/ARCHITECTURE.md` is empty (2 lines only)
5. **No startup guide:** No single place explains how to run the entire app (backend + frontend together)

### Next Steps
Would you like me to update these CLAUDE.md files with corrections? I'll fix:
- Node version requirements (22+)
- Frontend script names (typecheck)
- Backend env var name (DATABASE_URL)
- Add port and setup information
- Enhance the root CLAUDE.md with a quick start guide
