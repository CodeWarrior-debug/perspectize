## CLAUDE.md Audit Report

I found 3 CLAUDE.md files with significant accuracy issues when compared against the actual codebase. Here's the detailed report:

### **Root CLAUDE.md** ✅ Mostly Accurate
- ✅ Monorepo structure (backend + frontend) — correct
- ✅ Conventional commits rule — stated clearly
- ✅ Migration warning — accurately reflects shared staging DB concern
- ❌ **References `/docs/DEPLOYMENT.md` which does not exist** (only `ARCHITECTURE.md` exists)

---

### **Backend CLAUDE.md** 🔴 Multiple Inaccuracies

**Language Version Mismatch:**
- Claims: `Go 1.21`
- Actual: `Go 1.25` (from `go.mod`)

**Missing Directory:**
- Claims: `internal/handlers/` — one file per resource
- Actual: No handlers directory exists at all. Only `internal/core/services/` exists.

**Missing Command:**
- Claims: `make seed` command available
- Actual: Makefile only has `run`, `test`, `lint`, `migrate-up`. No seed target.

**Incomplete API Implementation:**
- Claims layout suggests a functioning HTTP API with handlers
- Actual: `cmd/server/main.go` is **empty** (just `func main() {}`)
- `NoteService` struct is **empty** with no methods

---

### **Frontend CLAUDE.md** 🟡 Incomplete

- ✅ SvelteKit framework — correct (per ARCHITECTURE.md)
- ✅ Test framework (Vitest) — correct
- ❌ **Command mismatch**: Claims `pnpm run dev` but `package.json` defines `dev` script as `vite dev` (these are equivalent, but CLAUDE.md should match what's in `package.json`)
- ❌ **Command mismatch**: Claims `pnpm run test:unit` but `package.json` only has `test:run` script
- ⚠️ **Svelte 5 runes claim** — cannot verify from codebase; no svelte.config.js or actual .svelte components found

---

### **Summary**

| File | Severity | Issues |
|------|----------|--------|
| Root | Low | Missing doc link |
| Backend | **High** | Wrong Go version, wrong directory structure, missing commands, incomplete implementation |
| Frontend | Medium | Script names don't match package.json, unverifiable Svelte 5 claim |

**Recommendation:** The CLAUDE.md files document an *intended* architecture that hasn't been fully implemented. They should either be updated to match the current empty/minimal codebase, or the code should be completed to match the documented structure.
