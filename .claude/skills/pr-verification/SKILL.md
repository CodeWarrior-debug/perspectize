---
name: pr-verification
description: Use before any local browser verification in Perspectize (dev servers + the shared signed-in sv-chrome on :9222), e.g. demo evidence for a PR or checking a UI change in the real app. Takes the machine-wide verification slot first so parallel agents never fight over ports or the browser, waits for it without spending tokens, serves YOUR checkout's code on the slot's ports, and releases everything afterwards.
---

<!-- Project copy of .claude/agent-registry/pr-verification.SKILL.template.md, with the
     Perspectize sections filled in. Generic parts: keep in step with the template. -->

# PR verification (Perspectize)

Local sessions only: cloud sessions skip browser verification entirely (`.docs/VERIFICATION.md`).
Browser verification shares this machine's dev-server ports and the signed-in sv-chrome
profile. The agent registry hands them out one session at a time. **Never start dev servers
or drive the browser for verification without holding a slot.**

`R=.claude/agent-registry/agent-registry.mjs`. Run everything from **your** checkout (a
worktree is fine). If a command says the registry isn't initialised, the human hasn't run
`node $R install` on this machine yet: ask them to, and don't verify until they have.

## 1. Take the slot

```sh
node $R verify-acquire
```

- **Exit 0 `ACQUIRED`** prints `slot`, `backendPort`, `frontendPort`, `chromeDebugPort`. Use exactly those ports.
- **Exit 2 `BUSY`** prints who holds it. Do **not** poll in your own turns. Start the waiter
  in the background (Bash tool, `run_in_background: true`), then end your turn or do other
  work. You are woken when it exits, already holding the slot:

  ```sh
  node $R verify-wait
  ```

  - exit **0 `ACQUIRED`**: go to step 2.
  - exit **3 `NEEDS_PING`**: the human's `make start` servers (or an unregistered process) hold
    the ports. Send a push notification (load `PushNotification` via ToolSearch) and a one-line
    message: *"Verification for <branch> wants :8080/:5173, held by <holder>. Reply 'keep' to stop
    me; I take over in 10 min."* Then start `node $R verify-wait --takeover-after 10` in the
    background. If the human replies "keep", stop the waiter and run `node $R hold --slot 1 --minutes 60`.
    After the takeover, the human's `make start` servers are stopped; tell them in your report.
  - exit **4 `TIMEOUT`** (2 h): give up on browser evidence. Say so in your report, and label the
    PR `needs-demo-video` ([PR workflow](../../../.docs/PR_WORKFLOW.md#demo-requirement-ready-for-review)).

## 2. Serve your checkout on the slot's ports

```sh
node .claude/scripts/verification-servers.mjs --backend-port <backendPort> --frontend-port <frontendPort>
```

It builds and starts this checkout's backend (`SERVER_PORT`) and frontend (vite, strict port,
pointed at that backend), using the **main checkout's** env files without printing them. It
waits until both listen, then records them with `verify-started`, so release stops exactly these.
Logs go to `logs/verify-backend.log` and `logs/verify-frontend.log` in your checkout. Don't use
`make start` for verification: it serves the main checkout's code.

Slot 1 is `:8080`/`:5173`, the origin where the sv-chrome Clerk session already lives, so no
sign-in is needed.

## 3. Verify and capture evidence

Attach to the shared Chrome on `:9222` and follow [.docs/VERIFICATION.md](../../../.docs/VERIFICATION.md).
- Scripted checks: `node .claude/scripts/sv-cdp-verify.cjs [scenario]` with `BASE_URL=http://localhost:<frontendPort>`.
- Clips: the video-capture recorder.
- Evidence goes to `~/Downloads/screenshots/` with the `sv-` prefix (video by default; screenshots only for pure layout changes).
- Signed out? Stop and ask the human to sign in again. Never enter credentials.

## 4. Release, always (also when you give up or fail)

```sh
node $R verify-release
```

This stops the two servers from step 2 and frees the slot for the next waiter. If you forget,
the slot is freed when your session ends or its process dies, but the next agent waits until then.

## Rules

- One slot per session. Running `verify-acquire` again while you hold one returns the same slot.
- Never stop servers you didn't start, and never take a slot from a live agent.
- `node $R status` shows who holds what. `LOCAL_AGENT_VERIFICATION.md` at the main checkout root is the record.
