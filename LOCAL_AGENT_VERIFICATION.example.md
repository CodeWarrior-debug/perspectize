# LOCAL_AGENT_VERIFICATION

VERIFICATION_AVAILABLE = FALSE

One browser verification at a time on this machine (max concurrent: 1).
Shared: Chrome on :9222 plus the slot's ports. Written only by
`.claude/agent-registry/agent-registry.mjs`; snapshot as of 2026-10-11T14:31:05Z. Run its `status` for a fresh check.

> This is the tracked **example**. The live file, `LOCAL_AGENT_VERIFICATION.md`, is created by
> `node .claude/agent-registry/agent-registry.mjs init` (or `install`) and rewritten on every change.
> `VERIFICATION_AVAILABLE` is TRUE when an enabled slot is free and under the concurrency limit.

| Slot | Status | Holder | Session | Branch | Checkout | PID | Started | Backend port | Frontend port |
|---|---|---|---|---|---|---|---|---|---|
| 1 | IN USE | agent | 3f2c9a1e-5b7d-4c21-9e0f-8a6b2d4c1e77 | feature/INI-578-plan-cell-focus-field | /Users/you/GitHub/perspectize/.claude/worktrees/INI-578-plan-cell-focus | 41822 | 2026-10-11T14:30:12Z | 8080 (since 2026-10-11T14:30:40Z) | 5173 (since 2026-10-11T14:30:51Z) |
| 2 | disabled | - | - | - | - | - | - | 8090 | 5174 |
| 3 | disabled | - | - | - | - | - | - | 8091 | 5175 |

## Holds (takeover blocked)

_None._

<!-- agent-registry-data
{
  "version": 1,
  "slots": {
    "1": {
      "holder": { "kind": "agent", "session": "3f2c9a1e-5b7d-4c21-9e0f-8a6b2d4c1e77", "branch": "feature/INI-578-plan-cell-focus-field", "checkout": "/Users/you/GitHub/perspectize/.claude/worktrees/INI-578-plan-cell-focus", "pid": 41822, "pidName": "claude", "startedAt": "2026-10-11T14:30:12Z" },
      "ports": {
        "backend": { "port": 8080, "pid": 61204, "startedAt": "2026-10-11T14:30:40Z" },
        "frontend": { "port": 5173, "pid": 61377, "startedAt": "2026-10-11T14:30:51Z" }
      }
    }
  },
  "holds": {}
}
-->
