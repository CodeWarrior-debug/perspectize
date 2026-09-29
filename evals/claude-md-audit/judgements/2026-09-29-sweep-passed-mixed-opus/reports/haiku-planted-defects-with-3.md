## CLAUDE.md Quality Report

### Summary
- **Files found:** 3
- **Average score:** 52/100 (Grade: C)
- **Files needing update:** 3 (all have issues)

---

### File-by-File Assessment

#### 1. ./CLAUDE.md (Project Root)
**Score: 45/100 (Grade: D)**

| Criterion | Score | Notes |
|-----------|-------|-------|
| Commands/workflows | 5/20 | References non-existent docs and missing setup guidance |
| Architecture clarity | 10/20 | High-level monorepo structure clear, but lacks dev workflow |
| Non-obvious patterns | 10/15 | Good rule about migrate-up, but incomplete reasoning |
| Conciseness | 15/15 | ✓ Well-written |
| Currency | 0/15 | References DEPLOYMENT.md which doesn't exist |
| Actionability | 5/15 | Missing setup steps; cannot run project from scratch |

**Issues:**
- **Missing DEPLOYMENT.md**: Referenced but file does not exist
- **No setup instructions**: No `pnpm install`, `go mod download`, or initial DB setup guidance
- **No dev workflow**: Doesn't explain how to run both frontend and backend together locally
- **Incomplete rule**: The migrate-up warning doesn't explain what developers should do instead

**Recommended additions:**
- Setup/prerequisites section (Node.js, Go 1.25, pnpm, migrate CLI)
- Local development workflow (running both services)
- Environment configuration template (.env requirements)

---

#### 2. ./frontend/CLAUDE.md
**Score: 50/100 (Grade: C)**

| Criterion | Score | Notes |
|-----------|-------|-------|
| Commands/workflows | 10/20 | Command exists but name is wrong; missing build script |
| Architecture clarity | 15/20 | Svelte 5 runes noted; minimal description |
| Non-obvious patterns | 5/15 | No gotchas or patterns documented |
| Conciseness | 15/15 | ✓ Well-written |
| Currency | 5/15 | Test command doesn't match package.json |
| Actionability | 5/15 | Can't run tests as documented |

**Issues:**
- **Wrong test command**: Documents `pnpm run test:unit` but package.json has `test:run` — will fail if developer copies command
- **Missing build command**: No mention of `pnpm run build` (required for deployment)
- **No setup**: Missing `pnpm install` instruction
- **No API config**: Missing guidance on backend API endpoint configuration (staging vs local)

**Recommended additions:**
- Correct test command
- Build command documentation
- Environment variables (API endpoint)
- Port conflicts note (if frontend needs to know backend port)

---

#### 3. ./backend/CLAUDE.md
**Score: 58/100 (Grade: C-)**

| Criterion | Score | Notes |
|-----------|-------|-------|
| Commands/workflows | 10/20 | Documents non-existent `make seed` command; missing `make lint` |
| Architecture clarity | 15/20 | ✓ Layout is accurate; handler/service split is clear |
| Non-obvious patterns | 10/15 | Good service layer pattern documented |
| Conciseness | 15/15 | ✓ Well-written |
| Currency | 8/15 | Go version mismatch (docs say 1.21, go.mod says 1.25) |
| Actionability | 10/15 | Most commands work but `make seed` will fail |

**Issues:**
- **Non-existent `make seed` command**: Documented but doesn't exist in Makefile
- **Version mismatch**: Documents "Go 1.21" but go.mod specifies 1.25
- **Missing `make lint`**: Available in Makefile but not documented
- **No environment setup**: Missing DATABASE_URL requirement and format
- **Incomplete migration guidance**: Doesn't explain staging database or when migrations run
- **No setup instruction**: Missing `go mod download` or equivalent

**Recommended additions:**
- Correct Go version (1.25)
- Remove `make seed` reference or explain why it's not in Makefile
- Add `make lint` to commands
- Database setup instructions (staging URL, local testing approach)
- What the migrations directory contains

---

### Critical Issues Summary

| Issue | Severity | Files | Impact |
|-------|----------|-------|--------|
| Incorrect/non-existent commands | **High** | frontend, backend | Commands fail when copied from docs |
| Version mismatch | **High** | backend | Confuses setup |
| Missing environment setup | **High** | root, both | Can't run locally from scratch |
| Referenced files don't exist | **High** | root | Broken links undermine trust |
| Wrong test command | **High** | frontend | Tests can't run |

---

### Recommendations Before Updating

Would you like me to propose **targeted fixes** for these issues? The updates will:

1. ✅ Correct the test command in frontend (test:unit → test:run)
2. ✅ Fix Go version in backend (1.21 → 1.25)
3. ✅ Remove/clarify non-existent `make seed` in backend
4. ✅ Add `make lint` documentation
5. ✅ Add minimal setup/environment guidance to root CLAUDE.md
6. ✅ Add environment variables (DATABASE_URL, API endpoint) to respective files

I'll keep changes minimal and actionable — only adding what's truly necessary and removing what's broken.
