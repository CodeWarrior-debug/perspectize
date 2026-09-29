# Planning & Execution Workflow

Details behind the two-line summary in the root [CLAUDE.md](../CLAUDE.md).

**Primary workflow: obra/superpowers** (plugin enabled in `.claude/settings.json`). Use `superpowers:writing-plans` (or its brainstorming/spec-writing counterparts) for planning, and `superpowers:executing-plans` / `superpowers:subagent-driven-development` for execution. Plans and specs live in `docs/superpowers/plans/` and `docs/superpowers/specs/` — see `docs/superpowers/plans/2026-08-15-clerk-derived-user-identity-plan.md` for the established format (plan header names the required execution sub-skill, links its spec, checkbox-tracked (`- [ ]`) tasks).

**Lightweight spike/research docs** (pre-planning, not meant for autonomous execution — e.g. a cost/feasibility writeup before committing to a real plan) also live in `docs/superpowers/specs/`, dated like plans/specs, but state "Status: spike, not a superpowers plan" up top instead of a sub-skill header. Link them from `.planning/ROADMAP.md` at the relevant phase so they aren't orphaned.

**Optional/unscheduled roadmap items:** write a superpowers spec (`docs/superpowers/specs/YYYY-MM-DD-<name>-design.md`, `Status: optional roadmap item — unscheduled`, no plan file) + a short [FEATURE_BACKLOG.md](../FEATURE_BACKLOG.md) entry linking it. Don't add to legacy `.planning/ROADMAP.md`.

**Superpowers unavailable this session?** Check the session's available-skills listing for `superpowers:*` entries before claiming to follow this workflow. If no `superpowers:*` skill is listed (plugin not loaded/connecting in this environment), any plan/spec/spike doc written anyway must say so at the top — `⚠️ Written without superpowers loaded — a superpowers-enabled session should review via writing-plans before this is executed` — so a later session with superpowers actually available knows to validate/regenerate it rather than trusting it as already vetted.

**GSD is legacy — do NOT start new work with it.** Some milestones still have unfinished work tracked under the old workflow in `.planning/phases/` (`PROJECT.md`, `ROADMAP.md`, `STATE.md`, phase `PLAN.md`/`must_haves.truths` files). Finish those specific in-flight phases using their existing GSD plan files/commands rather than replanning them from scratch under superpowers — don't discard partially-done GSD work. All new planning and execution goes through superpowers. Branching for legacy GSD phases: see [GSD_BRANCHING.md](GSD_BRANCHING.md).

**Select GSD commands are kept** only for codebase mapping (`gsd:map-codebase`) and roadmap/milestone management (`gsd:new-milestone`, `gsd:add-phase`/`gsd:remove-phase`/`gsd:insert-phase`, `gsd:analyze-dependencies`, `gsd:milestone-summary`, `gsd:complete-milestone`, `gsd:docs-update`).

**Vendored GSD is a frozen legacy subset** (`.claude/get-shit-done/`, curated `.claude/commands/gsd/`). Do not run `npx get-shit-done-cc` against this repo — a full install dumps ~200 unused command/agent/workflow files and bakes absolute paths into the command files. The `VERSION` marker tracks the toolchain maintainers run locally so the update-check hook stays quiet; it is not a claim that every vendored file is on that release. For phase CRUD / dependency analysis on newer GSD, use a personal global install.
