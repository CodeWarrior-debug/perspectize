# agent-registry

Keeps Claude Code sessions on **one machine** out of each other's way:

1. **Checkout claims.** A session that writes to a git checkout (the main checkout or any linked worktree) claims it. Another live session that tries to write there is denied by a hook and told to use a free worktree.
2. **Verification slots.** Browser verification uses shared resources: the signed-in debug Chrome and the dev-server ports. Only a set number of sessions may verify at once (one, to start). Others wait in a background process that costs no tokens.

State lives in two Markdown files at the **main checkout root**, so every worktree of the repo shares them. Both are gitignored, one per machine. Tracked templates sit next to them:

| File | Holds |
|---|---|
| `LOCAL_AGENT_CHECKOUTS.md` | one row per (session, checkout): session ID, branch, absolute checkout path, PID, start time |
| `LOCAL_AGENT_VERIFICATION.md` | `VERIFICATION_AVAILABLE = TRUE/FALSE`, then one row per slot: holder, branch, checkout, PID, start time, backend and frontend port with start times |

This folder is self-contained and has no repo-specific content. Copy it into any repo to reuse it. Requirements: Node 18+ and git, on Windows, macOS or Linux, with no npm dependencies.

## Setup (once per machine, per repo)

```sh
node .claude/agent-registry/agent-registry.mjs install
```

This does two things:

- **`init`**: creates the two `LOCAL_AGENT_*.md` files at the main checkout root. The checkouts file is the opt-in switch: without it, every hook does nothing.
- **User-level hooks**: copies the script to `~/.claude/agent-registry/` and adds SessionStart, SessionEnd and PreToolUse hooks to `~/.claude/settings.json`. It backs the file up to `settings.json.bak-agent-registry` first.

Why user-level hooks too: project hooks load from each worktree's own branch, so a worktree on an older branch would have no guard. When the project's own `.claude/settings.json` already runs the script, the user-level copy steps aside, so the hooks never run twice. `uninstall` removes the user-level hooks.

Then add to the repo's `.gitignore`:

```gitignore
/LOCAL_AGENT_CHECKOUTS.md
/LOCAL_AGENT_VERIFICATION.md
/LOCAL_AGENT_*.md.*.tmp
/.agent-registry.lock/
```

and register the hooks in the project's `.claude/settings.json`. Use exec form (`node` plus `args`), which runs no shell, so it behaves the same under Git Bash, PowerShell, zsh and bash:

```json
{ "type": "command", "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/agent-registry/agent-registry.mjs", "hook", "session-start"], "timeout": 15 }
```

Add the same entry with `session-end` under SessionEnd, and with `pre-tool-use` under PreToolUse using matcher `Edit|Write|MultiEdit|NotebookEdit|Bash`.

## Configuration

`.claude/agent-registry.config.json` is read from the checkout first, then the main checkout. Every field is optional:

```json
{
  "chromeDebugPort": 9222,
  "maxConcurrentVerifications": 1,
  "slots": [
    { "id": 1, "backendPort": 8080, "frontendPort": 5173, "enabled": true },
    { "id": 2, "backendPort": 8090, "frontendPort": 5174, "enabled": false }
  ],
  "waitPollSeconds": 300,
  "waitMaxMinutes": 120,
  "humanReplyMinutes": 10,
  "staleClaimHours": 24,
  "devServerProcessPatterns": ["vite", "\\bair\\b", "pnpm", "npm run dev"]
}
```

`devServerProcessPatterns` are regexes matched against a process's command line. A takeover only ever stops processes that match one of them; anything else on a slot's port is left alone and reported.

## How it behaves

**Identity.** A session is its `session_id`, which every hook receives on stdin. Liveness comes from the PID of the Claude process. An exec-form hook's parent *is* that process (tested on macOS). For a CLI call made from the Bash tool, the script walks up to the nearest `claude` ancestor. A row whose PID is gone, or reused by a different program, is stale and gets removed by the next SessionStart, `status` or `cleanup`. SessionEnd releases a session's rows right away, but it's best-effort (a killed process runs no hooks), so cleaning up by PID is what guarantees correctness.

**Claims are made on first write, not at start.** A session that only reads never blocks anyone, and one that moves into a worktree mid-session claims the worktree it actually writes to. A session may hold several checkouts; a checkout has at most one owner.

**What counts as a write.**
- Edit, Write, MultiEdit and NotebookEdit, on the file's checkout.
- A Bash command that matches a heuristic:
  - git commands that change state (commit, checkout/switch, reset, merge, rebase, stash, add, rm, mv, pull, cherry-pick, restore, clean, and worktree add/remove)
  - output redirection, and `rm`/`mv`/`cp`/`mkdir`/`touch`/`tee`, plus `sed -i`
  - package installs, `go generate`/`go mod tidy`, `gofmt -w`, `prettier --write`, `eslint --fix`, and `make gen`-style targets

  It applies to the command's working directory (after a leading `cd`) and to any absolute path it names.

This is a heuristic, not a sandbox: a determined script can still write. Reads, tests and builds stay allowed. The `LOCAL_AGENT_*.md` files can't be edited by tools; only this script writes them, under the lock.

**Concurrency.** Every read-modify-write takes a lock directory (`.agent-registry.lock/` at the main root). `mkdir` is atomic on all three OSes. A lock is broken if its holder is dead or the lock is older than 30 s. Files are written to a temp file and renamed into place, so readers never see half a file.

**Paths.** Every path is stored as its real absolute path with forward slashes and symlinks resolved (`/tmp` becomes `/private/tmp` on macOS). Paths are compared case-insensitively on macOS and Windows, so two spellings of one folder can't both be claimed.

**Cloud sessions** (`CLAUDE_CODE_REMOTE=true`) skip everything: they can't see this machine.

## Verification flow (for a pr-verification skill)

```sh
R=.claude/agent-registry/agent-registry.mjs
node $R verify-acquire                    # exit 0: ACQUIRED + the slot's ports; exit 2: BUSY + who holds it
# when busy: run this in the background so waiting costs no tokens
node $R verify-wait                       # exits 0 once it has ACQUIRED the slot for you
# start servers on the slot's ports, then record them
node $R verify-started backend
node $R verify-started frontend
# ...browser check, evidence...
node $R verify-release                    # stops the servers it recorded and frees the slot
```

`verify-wait` exit codes:
- **0**: acquired. The waiter takes the slot itself before exiting, so two woken waiters never race for it.
- **3 `NEEDS_PING`**: the ports are held by a human's servers (`human-start`) or by an unregistered process. The agent should notify the human, then rerun `verify-wait --takeover-after <humanReplyMinutes>`. When that time runs out with no `hold`, it stops matching dev servers, never anything else, and acquires the slot. The human blocks a takeover with `hold --slot N [--minutes M]`.
- **4**: timed out after `waitMaxMinutes`.

It never takes over from a live agent: an agent's slot frees up only on release or when its process dies.

`human-start` and `human-stop` let a project's own dev-server commands (e.g. `make start`/`make stop`) register the human as a slot holder, so their servers count as known rather than unknown.

## Tests

```sh
node --test .claude/agent-registry/test/agent-registry.test.mjs
```

The tests build throwaway git repos and worktrees and use real child processes as live sessions. They cover:
- claims, denials, dead-owner takeover, SessionStart/SessionEnd
- 8 simultaneous claims with no row lost
- stale-lock breaking and the Bash heuristic
- slot acquire/release/busy, dead-holder release, hold, and NEEDS_PING then takeover of a dev server

## Known limits

- **Windows and WSL are designed for but untested.** The script uses `process.kill(pid, 0)`, `netstat -ano`, `taskkill /T` and one `Get-CimInstance` call. Native Windows and WSL see the same repo under different paths (`C:\repo` and `/mnt/c/repo`), so they keep separate registries; don't mix them on one checkout.
- **Bash detection is a heuristic** (see above).
- **PID reuse:** a row also records the process name, so a recycled PID running a different program counts as dead. A recycled PID that happens to be another `claude` would look alive until `staleClaimHours`, and then it gets flagged for a human to check.
