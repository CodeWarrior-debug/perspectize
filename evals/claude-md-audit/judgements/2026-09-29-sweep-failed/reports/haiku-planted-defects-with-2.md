## CLAUDE.md Quality Report

I found 3 CLAUDE.md files. The structure is sound, but there are **critical inaccuracies** where documented commands don't match the actual codebase.

### Summary
- **Files found:** 3 (root, frontend, backend)
- **Average score:** 58/100 (Grade: C)
- **Files needing update:** 2 (frontend, backend both have command errors)

---

### File-by-File Assessment

#### 1. `./CLAUDE.md` (Project Root)
**Score: 65/100 (Grade: C)**

| Criterion | Score | Notes |
|-----------|-------|-------|
| Commands/workflows | 0/20 | No build, dev, or test commands documented for the monorepo |
| Architecture clarity | 15/20 | Clear it's a monorepo, but no quick-start |
| Non-obvious patterns | 10/15 | Good: documents the migration rule (don't run locally) |
| Conciseness | 15/15 | Appropriately brief |
| Currency | 15/15 | References exist (.docs/ARCHITECTURE.md, .docs/DEPLOYMENT.md) |
| Actionability | 10/15 | Has rules but no executable setup steps |

**Issues:**
- No quick-start instructions (how does a new contributor begin?)
- Missing monorepo-level commands or guidance

**Recommended additions:**
- Quick setup section (install dependencies, which commands to run)
- Link to .docs/DEPLOYMENT.md exists but DEPLOYMENT.md isn't easily discoverable

---

#### 2. `./frontend/CLAUDE.md`
**Score: 45/100 (Grade: D)**

| Criterion | Score | Notes |
|-----------|-------|-------|
| Commands/workflows | 5/20 | ❌ **ERROR: `pnpm run test:unit` doesn't exist** — package.json has `test:run`, not `test:unit` |
| Architecture clarity | 10/20 | Says "Svelte 5 runes only" but no file structure |
| Non-obvious patterns | 5/15 | No gotchas documented |
| Conciseness | 15/15 | Good brevity |
| Currency | 5/15 | Has a factual error in the command name |
| Actionability | 5/15 | Build command missing; test command incorrect |

**Issues:**
- ❌ **CRITICAL:** Test command is wrong (`test:unit` → should be `test:run`)
- Missing `build` command (exists in package.json)
- No directory structure or file layout

**Recommended additions:**
- Correct test command
- Include build command
- Mention entry points (e.g., `src/` or `routes/`)

---

#### 3. `./backend/CLAUDE.md`
**Score: 60/100 (Grade: D)**

| Criterion | Score | Notes |
|-----------|-------|-------|
| Commands/workflows | 8/20 | ❌ **ERROR: `make seed` doesn't exist in Makefile** — only run, test, lint, migrate-up |
| Architecture clarity | 12/20 | Good layout description but missing handlers pattern details |
| Non-obvious patterns | 10/15 | No mention of the migration warning from root CLAUDE.md |
| Conciseness | 15/15 | Appropriate level |
| Currency | 5/15 | References non-existent command |
| Actionability | 10/15 | Most commands work, but seed is a blocker |

**Issues:**
- ❌ **CRITICAL:** `make seed` command doesn't exist in Makefile
- Missing `make lint` command (exists in Makefile but not documented)
- No database setup instructions
- Doesn't cross-reference the root rule about not running migrations locally

**Recommended additions:**
- Remove `make seed` (doesn't exist)
- Add `make lint` (exists but missing)
- Clarify database requirements
- Reference the root migration warning

---

### Summary of Problems

| Severity | Issue |
|----------|-------|
| 🔴 **CRITICAL** | Frontend: `pnpm run test:unit` → should be `pnpm run test:run` |
| 🔴 **CRITICAL** | Backend: `make seed` doesn't exist in Makefile |
| 🟡 HIGH | Backend: Missing `make lint` from documented commands |
| 🟡 HIGH | Root: No quick-start / setup instructions |
| 🟡 MEDIUM | Frontend: Missing build command documentation |
| 🟠 MEDIUM | Backend: Doesn't reference the migration warning from root |

---

**Ready to fix?** These updates will make the CLAUDE.md files match the actual codebase and help Claude execute commands correctly on first try. Approve and I'll apply the targeted corrections.
