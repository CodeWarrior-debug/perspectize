# Git Worktrees

## Location

All git worktrees in this repo live under `.claude/worktrees/` — not sibling folders like `perspectize-worktrees/*`. This is the native `EnterWorktree` tool's default location, is harness-managed, and is gitignored so it never shows up as clutter in `git status` on the main checkout.

(Pre-existing sibling worktrees at `perspectize-worktrees/*` are legacy — leave them as-is until naturally cleaned up, but don't create new ones there.)

## Numbered reusable worktrees for Claude Code sessions

For routine isolated work (branch inspection, PR analysis, one-off experiments — not necessarily a full feature implementation), Claude Code should use a fixed, bounded set of **5 reusable worktrees** instead of spinning up a new randomly-named one per task:

```
.claude/worktrees/1
.claude/worktrees/2
.claude/worktrees/3
.claude/worktrees/4
.claude/worktrees/5
```

**Home branches:** each numbered slot has a **home branch** `wt/<n>` (`wt/1` to `wt/5`) that exists only to give the slot somewhere to rest. It is never pushed, never gets a PR, and never merges; it just tracks `origin/main` (`git merge --ff-only origin/main` brings it up to date, or don't bother, since the next task branches from `origin/main` anyway). An idle slot sits on `wt/<n>`; a busy slot sits on a task branch. Name them `wt/<n>`, not a bare digit, which makes `git checkout 2` and pathspecs ambiguous.

**Why a home branch:** a task branch stays checked out in its slot after the PR merges, so git refuses to delete it (`gh pr merge --delete-branch` skips the local delete, `git branch -d` fails) until something else is checked out there. Returning the slot to `wt/<n>` when the work ends frees the task branch, and gives the registry and `worktree-report.sh` a stable "this slot is idle" signal instead of guessing from PR state.

**Claim order:** take the lowest-numbered slot that is free. A slot is free when it doesn't exist yet, or when it is on its home branch `wt/<n>` and clean. A slot still on a task branch is busy until that branch is finished (see **Finishing** below): this covers a legacy slot from before home branches existed. A free slot holding only untracked files is still claimable (they survive a branch switch); mention them. Check for conflicts first: no open PR on the slot's branch, and no overlap with another in-flight branch touching the same files. If a slot is not claimable, move to the next number.

**Starting work:**
- Missing slot: `.claude/scripts/new-worktree.sh wt/<n> <n>` creates it on its home branch (no upstream, push disabled), then `git -C .claude/worktrees/<n> checkout --no-track -b <type/name> origin/main`.
- Existing free slot: `git -C .claude/worktrees/<n> checkout --no-track -b <type/name> origin/main`. `--no-track` means the task branch has no upstream, so a bare `git push` can't target `main`.

**Finishing (PR merged or abandoned):** from the slot, `git checkout wt/<n>`, `git merge --ff-only origin/main`, then `git branch -D <task-branch>` (`-D`, because a squash merge hides that the branch's commits landed). Do this before leaving the slot; the next session finds it free. Never push `wt/<n>`: `new-worktree.sh` sets `branch.wt/<n>.pushRemote` to a remote that doesn't exist, so a bare `git push` fails loudly. An explicit `git push origin wt/<n>` still works, so don't type it.

**Migrating a legacy slot:** a slot already on a task branch moves to its home branch when that work finishes: `git checkout --no-track -b wt/<n> origin/main` (or, if `wt/<n>` exists, `git checkout wt/<n>` then `git merge --ff-only origin/main`), then `git config branch.wt/<n>.pushRemote no_push` (a fresh `wt/<n>` made by hand has no push block until you set it), then delete the finished task branch. Do not move a slot off a live task branch just to adopt the convention.

**Live claims:** a worktree (or the main checkout) can also be busy because another Claude session on this machine is writing to it. The agent registry records that in `LOCAL_AGENT_CHECKOUTS.md` at the main checkout root, and its PreToolUse hook denies writes there. Treat a claimed slot as busy; `node .claude/agent-registry/agent-registry.mjs status` lists the claims and drops dead ones. The hook judges by the shell's cwd: `git -C <worktree> …` run from a claimed main checkout is still denied. `cd` into the worktree first.

**Overflow:** once all 5 numbered slots are busy, use a work-specific named worktree (e.g. `.claude/worktrees/idle-pause-realtime-stream`) instead of asking.

**Reuse policy:**

1. **Before reusing** a numbered slot (`1`-`5`) for a new task, check it first:
   ```bash
   git worktree list
   git -C .claude/worktrees/<n> status
   ```
   If it's on its home branch `wt/<n>`, clean (no uncommitted changes) and not flagged `locked` in `git worktree list`, it's free: branch from `origin/main` as in **Starting work**. If it's clean but on a task branch, it's busy until that work is finished (**Finishing**).
2. **If it has uncommitted changes or looks mid-task**, don't silently discard that state — surface what's in it and ask before switching its branch.
3. **If all 5 are busy**, use a named overflow worktree (see above) rather than freeing one of them.
4. This numbered set is separate from worktrees created by other flows (e.g. `EnterWorktree`-spawned random-named directories, agent `isolation: worktree` (`agent-<hash>`), or a `superpowers:using-git-worktrees` isolation worktree for an in-flight feature). Don't reuse those as slots, and don't treat them as ownerless either: **whoever created one removes it when the task ends** (push or discard its work first). `bash .claude/scripts/worktree-report.sh` lists what is removable.

**Why a fixed set:** keeps worktree usage bounded and predictable instead of accumulating one-off directories under `.claude/worktrees/` indefinitely.

## Guard and cleanup

- **Guard:** `.claude/hooks/worktree-guard.sh` (PreToolUse, Bash) denies `git worktree add` unless the path is under the main checkout's `.claude/worktrees/`: no scratchpad, `/tmp`, sibling folder, `..` escape, or nesting inside another worktree. It only fires for commands that go through Bash. Worktrees the harness makes itself (agent `isolation: worktree`, `EnterWorktree`) are invisible to it. Test: `bash .claude/hooks/test-worktree-guard.sh`.
- **Report:** `bash .claude/scripts/worktree-report.sh` (read-only) groups every worktree as REMOVABLE, MERGED-DIRTY, NO-PR, OPEN-PR, IDLE-SLOT (a clean numbered slot resting on its `wt/<n>` home branch) or OUT-OF-PLACE and prints the removal commands for the safe group, one per line. The `monthly-maintenance` skill runs it (step 1b).
- **Before removing a NO-PR or MERGED-DIRTY worktree,** look for work that exists nowhere else: push unpushed commits to `<branch>-followup`, then remove it. Squash merges hide whether a branch's commits were merged, so compare the tip with the PR's head commit rather than trusting `git branch --merged`.

## Worktrees on an existing branch: use the script

`.worktreeinclude` (repo root) lists gitignored files that a fresh worktree needs: `.env` files with `DATABASE_URL`, and machine-local Claude settings. Claude Code copies them **only** into worktrees it creates itself (`EnterWorktree`, `--worktree`, agent `isolation: worktree`). Those always start a **new** branch, created from `main`, not from the session's current branch. A subagent working on a feature branch must first `git merge --ff-only <feature-branch>` in its worktree, and the lead cherry-picks the subagent's commits back onto the feature branch.

To put a worktree on an **existing** branch (e.g. a long-running integration branch), use the script instead of raw `git worktree add`, which skips the copy and leaves a checkout with no env files:

```bash
.claude/scripts/new-worktree.sh <branch> [name] [--dry-run]
```

- Picks the mode automatically: existing local branch, existing `origin/<branch>` (tracking it), or a new branch from freshly fetched `origin/main` (no upstream set).
- Always creates the worktree at an absolute path under the **main** checkout's `.claude/worktrees/`, even when run from inside another worktree (a relative path there nests the new worktree inside the old one).
- Copies only files that are untracked, match `.worktreeinclude`, **and** are gitignored. It never prints file contents, skips `node_modules`, and lists relative paths only. Use `--dry-run` to preview.
- Does not run `pnpm install`; do `pnpm install --dir frontend` afterward.

Note the bare `.env` pattern in `.worktreeinclude` also matches `.claude/.env` (the self-verify test-user credentials), so those are copied too. Narrow the pattern if that is not wanted.
