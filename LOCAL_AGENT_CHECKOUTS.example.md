# LOCAL_AGENT_CHECKOUTS

Which Claude Code session on **this machine** is writing to which checkout.
Written only by `.claude/agent-registry/agent-registry.mjs` (see its README);
do not edit by hand while sessions are running. Gitignored; one per machine.

> This is the tracked **example**. The live file, `LOCAL_AGENT_CHECKOUTS.md`, is created by
> `node .claude/agent-registry/agent-registry.mjs init` (or `install`). The machine-readable copy
> lives in the `agent-registry-data` comment at the bottom; the tables are generated from it.

## Claims

| Session | Branch | Checkout (absolute) | PID | Started |
|---|---|---|---|---|
| 3f2c9a1e-5b7d-4c21-9e0f-8a6b2d4c1e77 | feature/INI-578-plan-cell-focus-field | /Users/you/GitHub/perspectize/.claude/worktrees/INI-578-plan-cell-focus | 41822 | 2026-10-11T14:02:10Z |
| 9d81b4c2-0a3e-4f6b-b7c5-2e1d9f8a6c30 | chore/local-agent-registry | /Users/you/GitHub/perspectize/.claude/worktrees/agent-registry | 52310 | 2026-10-11T14:20:44Z |

## Live sessions seen

| Session | PID | Started in | Started |
|---|---|---|---|
| 3f2c9a1e-5b7d-4c21-9e0f-8a6b2d4c1e77 | 41822 | /Users/you/GitHub/perspectize | 2026-10-11T13:58:01Z |
| 9d81b4c2-0a3e-4f6b-b7c5-2e1d9f8a6c30 | 52310 | /Users/you/GitHub/perspectize/.claude/worktrees/agent-registry | 2026-10-11T14:19:30Z |

<!-- agent-registry-data
{
  "version": 1,
  "sessions": {
    "3f2c9a1e-5b7d-4c21-9e0f-8a6b2d4c1e77": { "pid": 41822, "pidName": "claude", "cwd": "/Users/you/GitHub/perspectize", "startedAt": "2026-10-11T13:58:01Z" },
    "9d81b4c2-0a3e-4f6b-b7c5-2e1d9f8a6c30": { "pid": 52310, "pidName": "claude", "cwd": "/Users/you/GitHub/perspectize/.claude/worktrees/agent-registry", "startedAt": "2026-10-11T14:19:30Z" }
  },
  "claims": [
    { "session": "3f2c9a1e-5b7d-4c21-9e0f-8a6b2d4c1e77", "branch": "feature/INI-578-plan-cell-focus-field", "checkout": "/Users/you/GitHub/perspectize/.claude/worktrees/INI-578-plan-cell-focus", "pid": 41822, "pidName": "claude", "startedAt": "2026-10-11T14:02:10Z" },
    { "session": "9d81b4c2-0a3e-4f6b-b7c5-2e1d9f8a6c30", "branch": "chore/local-agent-registry", "checkout": "/Users/you/GitHub/perspectize/.claude/worktrees/agent-registry", "pid": 52310, "pidName": "claude", "startedAt": "2026-10-11T14:20:44Z" }
  ]
}
-->
