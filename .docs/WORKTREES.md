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

**Claim order:** take the lowest-numbered slot that is free. A slot is free when it doesn't exist yet, or when it is clean, not `locked`, and its branch is finished (PR merged, remote branch gone). A finished slot holding only untracked files is still claimable (they survive a branch switch); mention them. Check for conflicts first: no open PR on its branch, and no overlap with another in-flight branch touching the same files. If a slot is not claimable, move to the next number. Create missing slots with `.claude/scripts/new-worktree.sh <branch> <n>`; reuse an existing one with `git -C .claude/worktrees/<n> checkout -b <new-branch> origin/main`, then `git branch --unset-upstream` so it can't push to `main`.

**Overflow:** once all 5 numbered slots are busy, use a work-specific named worktree (e.g. `.claude/worktrees/idle-pause-realtime-stream`) instead of asking.

**Reuse policy:**

1. **Before reusing** a numbered slot (`1`-`5`) for a new task, check it first:
   ```bash
   git worktree list
   git -C .claude/worktrees/<n> status
   ```
   If it's clean (no uncommitted changes) and not flagged `locked` in `git worktree list`, it's safe to switch its branch and reuse it.
2. **If it has uncommitted changes or looks mid-task**, don't silently discard that state — surface what's in it and ask before switching its branch.
3. **If all 5 are busy**, use a named overflow worktree (see above) rather than freeing one of them.
4. This numbered set is separate from worktrees created by other flows (e.g. `EnterWorktree`-spawned random-named directories, or a `superpowers:using-git-worktrees` isolation worktree for an in-flight feature) — leave those alone; they're not part of the reusable pool.

**Why:** keeps worktree usage bounded and predictable instead of accumulating one-off directories under `.claude/worktrees/` indefinitely.

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
