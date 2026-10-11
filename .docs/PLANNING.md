# Planning & Execution Workflow

Details behind the two-line summary in the root [CLAUDE.md](../CLAUDE.md).

**Primary workflow: obra/superpowers** (plugin enabled in `.claude/settings.json`). Use `superpowers:writing-plans` (or its brainstorming/spec-writing counterparts) for planning, and `superpowers:executing-plans` / `superpowers:subagent-driven-development` for execution. Plans and specs live in `docs/superpowers/plans/` and `docs/superpowers/specs/` — see `docs/superpowers/plans/2026-08-15-clerk-derived-user-identity-plan.md` for the established format (plan header names the required execution sub-skill, links its spec, checkbox-tracked (`- [ ]`) tasks).

**Lightweight spike/research docs** (pre-planning, not meant for autonomous execution — e.g. a cost/feasibility writeup before committing to a real plan) also live in `docs/superpowers/specs/`, dated like plans/specs, but state "Status: spike, not a superpowers plan" up top instead of a sub-skill header. Link them from `.planning/ROADMAP.md` at the relevant phase so they aren't orphaned.

**Optional/unscheduled roadmap items:** write a superpowers spec (`docs/superpowers/specs/YYYY-MM-DD-<name>-design.md`, `Status: optional roadmap item — unscheduled`, no plan file) + a short [FEATURE_BACKLOG.md](../FEATURE_BACKLOG.md) entry linking it. Don't add to legacy `.planning/ROADMAP.md`.

**Superpowers unavailable this session?** Check the session's available-skills listing for `superpowers:*` entries before claiming to follow this workflow. If no `superpowers:*` skill is listed (plugin not loaded/connecting in this environment), any plan/spec/spike doc written anyway must say so at the top — `⚠️ Written without superpowers loaded — a superpowers-enabled session should review via writing-plans before this is executed` — so a later session with superpowers actually available knows to validate/regenerate it rather than trusting it as already vetted.

**GSD is legacy — do NOT start new work with it.** Some milestones still have unfinished work tracked under the old workflow in `.planning/phases/` (`PROJECT.md`, `ROADMAP.md`, `STATE.md`, phase `PLAN.md`/`must_haves.truths` files). Finish those specific in-flight phases using their existing GSD plan files/commands rather than replanning them from scratch under superpowers — don't discard partially-done GSD work. All new planning and execution goes through superpowers. Branching for legacy GSD phases: see [GSD_BRANCHING.md](GSD_BRANCHING.md).

**Select GSD commands are kept** only for codebase mapping (`gsd:map-codebase`) and roadmap/milestone management (`gsd:new-milestone`, `gsd:add-phase`/`gsd:remove-phase`/`gsd:insert-phase`, `gsd:analyze-dependencies`, `gsd:milestone-summary`, `gsd:complete-milestone`, `gsd:docs-update`).

**Vendored GSD is a frozen legacy subset** (`.claude/get-shit-done/`, curated `.claude/commands/gsd/`). Do not run `npx get-shit-done-cc` against this repo — a full install dumps ~200 unused command/agent/workflow files and bakes absolute paths into the command files. The `VERSION` marker tracks the toolchain maintainers run locally so the update-check hook stays quiet; it is not a claim that every vendored file is on that release. For phase CRUD / dependency analysis on newer GSD, use a personal global install.

## Suggested subagent types

When a plan has tasks that fit a project agent (roster: [AGENTS.md](AGENTS.md)),
tag the task with a **suggestion** line under its heading:

```markdown
### Task 3: Add visibility filter to GormPerspectiveRepository.List

**Suggested subagent:** `go-backend` (review: `code-reviewer`)
```

It is a suggestion, not a requirement. The executing skill
(`superpowers:subagent-driven-development` / `executing-plans`) keeps control
of how each task is dispatched. For each tagged task it picks one of:

1. **Dispatch the agent directly** (`subagent_type: go-backend`). This is the
   default when the task fits the agent's description and needs no special
   framing.
2. **Use the agent as a reference.** Dispatch its own implementer or reviewer
   prompt, but read `.claude/agents/<name>.md` first and carry over the parts
   that apply: the "read first" files, the hard rules (for example,
   `db-migration`'s never-apply rule), the process steps and the verification
   commands.
3. **Ignore it** when the task turned out not to fit (for example, a
   `go-backend` task that grew into frontend code). Note that in the task's completion notes.

Guidelines for plan writers:

- Tag only where an agent clearly fits. Leave the line off docs-only and
  cross-stack tasks rather than forcing one stack's agent onto them.
- Never tag a task with an agent that lacks the tools it needs. `code-reviewer`
  is read-only, so it is a review suggestion, not an implementer.
- Any task that touches `backend/migrations/` should carry `db-migration` as at
  least a reference, so its never-apply rule reaches whoever executes it.
- The older `**Subagent type:**` label (see
  `2026-09-05-postgres-auth-test-coverage-plan.md`) means the same thing; new
  plans use `**Suggested subagent:**`.
