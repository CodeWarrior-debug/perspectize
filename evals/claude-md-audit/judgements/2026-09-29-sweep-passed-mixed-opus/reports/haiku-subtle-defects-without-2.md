## Quality Audit: CLAUDE.md Files

I found **8 accuracy issues** across the three CLAUDE.md files. Here's the report:

### **Root CLAUDE.md**
✅ Backend on :8080 confirmed  
✅ Frontend is SvelteKit confirmed  
❌ **Node version outdated**: Says "Node 20" but `package.json` specifies `>=22`  
❌ **ARCHITECTURE.md is hollow**: References `.docs/ARCHITECTURE.md` which exists but contains only one line ("Go API + SvelteKit frontend") — no useful architecture info

---

### **Backend CLAUDE.md**
✅ `make run` and `make test` commands work correctly  
✅ `make db-reset` exists (in `mk/db.mk`)  
❌ **Wrong validation path**: Documents `internal/validate/` but actual path is `internal/core/validation/rules/`  
❌ **Wrong function name**: Says `postgres.NewNoteRepo()` but actual function is `postgres.NewNoteRepository()`  
❌ **Wrong env var**: Documents `DB_URL` but code reads `DATABASE_URL` (line 9 of `cmd/server/main.go`)

---

### **Frontend CLAUDE.md**
✅ Commands `pnpm run dev` and `pnpm run test:e2e` work  
✅ Proxy destination correct (backend on 8080)  
❌ **Node version outdated**: Says "Node 18+" but `package.json` requires `>=22`  
❌ **Wrong command name**: Says `pnpm run check` but actual script is `pnpm run typecheck` (typo in docs)  
❌ **Wrong proxy port**: Says dev proxy forwards to "port 3000" but `vite.config.ts` shows it goes to `http://localhost:8080` (the port number is simply wrong)

---

### **Summary**
- **Critical**: 3 issues that will fail if followed (wrong env var, wrong function name, wrong command)
- **High**: 2 version mismatches (Node 18+/20 vs 22)
- **Medium**: 2 wrong names (path and command)
- **Low**: 1 hollow reference (ARCHITECTURE.md)

The docs need updates to match the actual codebase before they'll be reliable for onboarding or CI/CD.
