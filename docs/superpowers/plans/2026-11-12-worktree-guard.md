# Worktree Guard and Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "extra checkouts live under `.claude/worktrees/` and are cleaned up by their creator" rule binding, enforced and auditable.

**Architecture:** One prose rule (root `CLAUDE.md`, aligned with `.docs/WORKTREES.md`), one PreToolUse(Bash) hook that denies `git worktree add` outside the main checkout's `.claude/worktrees/`, one read-only report script that classifies every worktree, and a `monthly-maintenance` step that runs the report.

**Tech Stack:** bash 3.2-compatible shell, `jq`, `gh`, Claude Code PreToolUse hooks.

**Spec:** none. Derived from the worktree-rules investigation of 2026-11-11/12 (38 stale worktrees found). Root causes: no hard rule in `CLAUDE.md`, a Branch Naming instruction that contradicts it, no enforcement, no cleanup owner.

## Global Constraints

- Hooks read the tool call as JSON on stdin with `jq -r '.tool_input.command // empty'`, `exit 0` (no output) to allow, and emit `hookSpecificOutput.permissionDecision: "deny"` to block, like `.claude/hooks/deny-env-read.sh`.
- Hooks are registered in `.claude/settings.json` as `bash "$CLAUDE_PROJECT_DIR/.claude/hooks/<name>.sh"`.
- Match on command position (start of string or after `;`, `&&`, `||`, `|`), never a raw substring, so a commit message that mentions `git worktree add` does not fire (`.docs/HOOKS.md`).
- Scripts must run on macOS bash 3.2 (no `mapfile`, no `${var,,}`, no `set -u` with empty arrays).
- Repo rule: every command a script prints for a human to run is a single command, never joined with `&&`.
- Allowed location: an absolute path under `<main checkout>/.claude/worktrees/`, after collapsing `.` and `..`.
- The hook cannot see harness-made `agent-<hash>` worktrees (Agent `isolation: worktree`, `EnterWorktree`); only the report and the ownership rule cover those.

## Review Focus

- `git worktree add <root>/.claude/worktrees/../../x`: passes a naive prefix check; must be denied.
- `git worktree add .claude/worktrees/x` run from inside another worktree: nests the new one inside the old; must be denied (from the main checkout it is allowed).
- `git worktree add --lock --reason why /tmp/x`: `--reason` takes a value that must not be read as the path.
- `git commit -m "git worktree add /tmp/x"` and `git worktree remove /tmp/x`: must not fire.
- `<root>/.claude/worktrees-evil/x`: prefix lookalike; must be denied.

---

### Task 1: worktree-guard hook (test first)

**Files:**
- Create: `.claude/hooks/test-worktree-guard.sh`
- Create: `.claude/hooks/worktree-guard.sh`

**Interfaces:**
- Produces: `worktree-guard.sh` reads PreToolUse JSON on stdin (`.tool_input.command`, `.cwd`); prints nothing and exits 0 to allow; prints a `permissionDecision: "deny"` JSON whose reason names the allowed directory and `.claude/scripts/new-worktree.sh` to block.
- Produces: `test-worktree-guard.sh` exits non-zero if any case fails and prints one `PASS`/`FAIL` line per case.

- [ ] **Step 1: Write `test-worktree-guard.sh`.** A helper `run <cwd> <command>` pipes `{"cwd":..., "tool_input":{"command":...}}` (built with `jq -n`) into the hook; `expect_allow` / `expect_deny` assert empty output / `"deny"` in output. `MAIN` is the first path from `git worktree list --porcelain`. Cases (cwd `MAIN` unless stated):
  - allow: `git worktree add MAIN/.claude/worktrees/x -b b origin/main`; `git -C MAIN worktree add MAIN/.claude/worktrees/x branch`; `git worktree add .claude/worktrees/x branch`; `git worktree add --lock --reason why MAIN/.claude/worktrees/x branch`
  - deny: `git worktree add /tmp/x branch`; `git worktree add /private/tmp/claude-501/s/scratchpad/wt branch`; `git -C MAIN worktree add /tmp/x branch`; `git worktree add MAIN/.claude/worktrees/../../x branch`; `git worktree add MAIN/.claude/worktrees-evil/x branch`; `cd foo && git worktree add /tmp/x branch`; `git worktree add --lock --reason why /tmp/x branch`; `git worktree add MAIN/.claude/worktrees/2/.claude/worktrees/x branch` (nested, absolute); and, only when `MAIN/.claude/worktrees/2` exists (else print SKIP), `git worktree add .claude/worktrees/x branch` with that cwd
  - allow (not a worktree add): `git status`; `git worktree list`; `git worktree remove /tmp/x`; `git commit -m "git worktree add /tmp/x"`
- [ ] **Step 2: Run it and confirm it fails.** Run: `bash .claude/hooks/test-worktree-guard.sh`. Expected: FAIL lines (hook file missing).
- [ ] **Step 3: Implement `.claude/hooks/worktree-guard.sh`.** Split the command on `&&`, `||`, `;`, `|` (as `deny-env-read.sh` does); for each segment that starts with `git [-C <dir>] worktree add`, take the first positional argument after `add` (skip flags; `-b`, `-B`, `--reason` consume the next token), strip quotes; if relative, resolve it against the `-C` dir else the JSON `.cwd`; collapse `.`/`..` with a small awk function; allow iff the result starts with `<main root>/.claude/worktrees/` (trailing slash included). Main root is the first `worktree` entry of `git -C <cwd> worktree list --porcelain`; if it cannot be found, allow. Missing `jq`, like the sibling hooks, allows.
- [ ] **Step 4: Run the test and confirm every case passes.** Run: `bash .claude/hooks/test-worktree-guard.sh`. Expected: all PASS, exit 0.
- [ ] **Step 5: Commit.** `git add .claude/hooks/worktree-guard.sh .claude/hooks/test-worktree-guard.sh` then `git commit -m "feat(hooks): deny git worktree add outside .claude/worktrees"`.

### Task 2: register the hook and document it

**Files:**
- Modify: `.claude/settings.json` (the `"matcher": "Bash"` block under `PreToolUse`)
- Modify: `.docs/HOOKS.md`

**Interfaces:**
- Consumes: `.claude/hooks/worktree-guard.sh` (Task 1).

- [ ] **Step 1: Add the hook entry** after `deny-env-read.sh` in the existing Bash block: `bash "$CLAUDE_PROJECT_DIR/.claude/hooks/worktree-guard.sh"`.
- [ ] **Step 2: Validate the JSON.** Run: `jq empty .claude/settings.json`. Expected: no output, exit 0.
- [ ] **Step 3: Add a "Worktree guard" bullet to `.docs/HOOKS.md`** next to the other PreToolUse hooks: what it denies, the `new-worktree.sh` pointer, the blind spot (harness-made worktrees), and that it only takes effect in a checkout that has this file merged.
- [ ] **Step 4: Commit.** `git add .claude/settings.json .docs/HOOKS.md` then `git commit -m "chore(hooks): register worktree-guard and document it"`.

### Task 3: worktree-report script

**Files:**
- Create: `.claude/scripts/worktree-report.sh`

**Interfaces:**
- Produces: read-only; prints groups `REMOVABLE`, `MERGED-DIRTY`, `NO-PR`, `OPEN-PR`, `OUT-OF-PLACE`. `REMOVABLE` prints two lines per worktree (`git worktree remove '<path>'` and `git branch -D '<branch>'`), never joined.

- [ ] **Step 1: Start from the draft** written during the worktree investigation (classifier only, no `OUT-OF-PLACE` group) and save it as `.claude/scripts/worktree-report.sh`.
- [ ] **Step 2: Add the `OUT-OF-PLACE` group:** any worktree other than the main checkout whose path is not under `<main root>/.claude/worktrees/` is listed there (with branch and dirty count) instead of being classified.
- [ ] **Step 3: Split the REMOVABLE command line** into two printed lines.
- [ ] **Step 4: Run it.** Run: `bash .claude/scripts/worktree-report.sh`. Expected: all five section headers print, this worktree (`.claude/worktrees/2`) appears under `NO-PR`, exit 0.
- [ ] **Step 5: Commit.** `git add .claude/scripts/worktree-report.sh` then `git commit -m "feat(scripts): worktree-report classifies worktrees for cleanup"`.

### Task 4: the rule, the contradiction and the cleanup owner

**Files:**
- Modify: `CLAUDE.md` (Hard rules; Branch Naming)
- Modify: `.docs/WORKTREES.md` (Reuse policy point 4; a short "Guard and cleanup" section)
- Modify: `.claude/skills/monthly-maintenance/SKILL.md` (new step 2b)

- [ ] **Step 1: Add one Hard-rules bullet to `CLAUDE.md`:** extra checkouts live only under `.claude/worktrees/` (never a scratchpad, `/tmp` or a sibling folder); create with `.claude/scripts/new-worktree.sh <branch> [name]` or `EnterWorktree`; whoever creates one removes it when done, after pushing or discarding its work; `worktree-guard.sh` denies the rest; link `.docs/WORKTREES.md`. Keep it to about three lines.
- [ ] **Step 2: Replace the Branch Naming "Always branch from updated `main`" sentence** with: branch from fresh `origin/main` inside a worktree via `new-worktree.sh <type>/<name>` (it fetches first); checking out branches in the main checkout collides with other sessions.
- [ ] **Step 3: Rewrite `.docs/WORKTREES.md` Reuse-policy point 4** so worktrees from `EnterWorktree`, agent `isolation: worktree` and isolation skills are cleaned up by their creator, and point to `bash .claude/scripts/worktree-report.sh`. Add the guard's blind spot to the doc.
- [ ] **Step 4: Invoke `superpowers:writing-skills`, then add step 2b to `monthly-maintenance/SKILL.md`:** run `bash .claude/scripts/worktree-report.sh`, show REMOVABLE and remove on a yes (one command per call), summarise MERGED-DIRTY, NO-PR and OUT-OF-PLACE, touch none of those.
- [ ] **Step 5: Stale-reference check.** Run: `git grep -n "git checkout main" -- CLAUDE.md .docs`. Expected: no remaining instruction to switch branches in the main checkout.
- [ ] **Step 6: Commit.** `git add CLAUDE.md .docs/WORKTREES.md .claude/skills/monthly-maintenance/SKILL.md` then `git commit -m "docs: worktree rule, branch-naming fix, creator owns cleanup"`.

### Task 5: outside the repo (not part of the PR)

**Files:**
- Modify: `~/.claude/skills/low-risk-merge/SKILL.md` line 16
- Modify: `~/.claude/projects/-Users-jamesjordan-GitHub-perspectize/memory/concurrent-sessions-need-worktrees.md`

- [ ] **Step 1: Edit `low-risk-merge/SKILL.md` step 3 (Docs PR),** after `superpowers:writing-skills` guidance: replace the scratchpad `git worktree add <scratchpad>/<name> origin/<branch>` with `.claude/scripts/new-worktree.sh <branch> lowrisk-<pr>`, and replace "Remove the worktree afterward" with removing it and then `git branch -D <branch>` (the script leaves a local tracking branch), each as its own command.
- [ ] **Step 2: Update the existing memory file** (do not create a new one): the rule was prose only and covered interactive sessions; the `CLAUDE.md` hard rule plus `worktree-guard.sh` now enforce it, and the hook applies only once merged to `main`.
