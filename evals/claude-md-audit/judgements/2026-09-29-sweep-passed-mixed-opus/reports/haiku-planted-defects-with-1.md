## CLAUDE.md Quality Report

### Summary
- **Files found:** 3
- **Average score:** 50/100 (Grade D)
- **Files needing update:** 3/3
- **Critical issues:** 5 (stale/incorrect commands, broken references)

---

### File-by-File Assessment

#### 1. Root `./CLAUDE.md` (Project Root)
**Score: 53/100 (Grade D)**

| Criterion | Score | Notes |
|-----------|-------|-------|
| Commands/workflows | 10/20 | Minimal; no build/setup commands for monorepo |
| Architecture clarity | 5/20 | References missing docs; very sparse |
| Non-obvious patterns | 10/15 | DATABASE_URL rule present but not explained |
| Conciseness | 15/15 | Good structure and brevity |
| Currency | 5/15 | **References non-existent `DEPLOYMENT.md`** |
| Actionability | 8/15 | Rules don't explain setup steps |

**Issues:**
- ❌ **Broken link:** References `[Deployment](.docs/DEPLOYMENT.md)` but file doesn't exist
- ❌ **Incomplete setup:** No instructions for DATABASE_URL, environment variables, or local development
- ❌ **Missing context:** No mention of monorepo setup or which package manager to use
- ⚠️ Conventional commits rule is clear but lacks examples

**Recommended additions:**
- Clear setup instructions (which commands to run first)
- Environment variable documentation
- Monorepo-specific workflow guidance

---

#### 2. `./frontend/CLAUDE.md` (Frontend)
**Score: 45/100 (Grade F)**

| Criterion | Score | Notes |
|-----------|-------|-------|
| Commands/workflows | 5/20 | **Test command is wrong; missing build** |
| Architecture clarity | 10/20 | Mentions SvelteKit/Svelte 5 but sparse |
| Non-obvious patterns | 5/15 | No gotchas or patterns mentioned |
| Conciseness | 15/15 | Good |
| Currency | 5/15 | **Commands don't match package.json** |
| Actionability | 5/15 | Wrong test command will fail |

**Issues:**
- ❌ **Critical:** Says `pnpm run test:unit` but package.json has `test:run`
- ❌ **Missing:** No `build` command documented (exists in package.json)
- ⚠️ No mention of Svelte 5 runes-only rule enforcement or patterns

**Recommended additions:**
- Correct test command: `test:run`
- Build command: `pnpm run build`
- Note about Svelte 5 runes-only requirement

---

#### 3. `./backend/CLAUDE.md` (Backend)
**Score: 53/100 (Grade D)**

| Criterion | Score | Notes |
|-----------|-------|-------|
| Commands/workflows | 8/20 | **`make seed` doesn't exist** |
| Architecture clarity | 12/20 | Good layout description, but incomplete |
| Non-obvious patterns | 5/15 | No gotchas or patterns |
| Conciseness | 15/15 | Good |
| Currency | 5/15 | **Stale Makefile reference** |
| Actionability | 8/15 | One command won't work as documented |

**Issues:**
- ❌ **Critical:** References `make seed` which doesn't exist in Makefile
- ❌ **Missing:** No environment setup instructions (Go version, dependencies)
- ⚠️ No mention of database migration workflow or prerequisites

**Recommended additions:**
- Remove `make seed` command (doesn't exist)
- Add `make lint` command (exists in Makefile)
- Document Go 1.21+ requirement and migration workflow

---

### Summary of Critical Issues

| Issue | Severity | Files |
|-------|----------|-------|
| Wrong/non-existent commands | Critical | frontend, backend |
| Broken documentation links | Critical | root |
| Missing environment setup | High | root, backend |
| Missing build commands | High | frontend |
| Stale Makefile references | High | backend |

Would you like me to proceed with targeted updates to fix these issues? I'll correct the commands, add missing documentation, and remove broken references.
