---
name: pr-verification
description: Use before any local browser verification of a change (dev servers + the shared signed-in Chrome), e.g. demo evidence for a PR. Takes the machine-wide verification slot first so parallel agents never fight over ports or the browser, waits for it without spending tokens, and releases it afterwards.
---

<!--
  TEMPLATE (from .claude/agent-registry/). Copy to .claude/skills/pr-verification/SKILL.md
  and fill in the three <PROJECT: ...> sections. Everything else is generic.
-->

# PR verification

Browser verification shares one machine's dev-server ports and its signed-in Chrome. The
agent-registry hands them out one session at a time. **Never start dev servers or drive the
browser for verification without holding a slot.**

`R=.claude/agent-registry/agent-registry.mjs` (run from your checkout). Each Bash call is a fresh
shell, so a variable set in one call is gone in the next: write the path out in full.

**Subagents share their parent's session, so they share its slot.** They cannot queue behind it or be
refused by it. Take the slot once, in the main session, and check the browser is signed in
before you hand work to anyone.

## 1. Take the slot

Look first, read-only: `node $R status` shows who holds each slot. Then take it:

```sh
node $R verify-acquire
```

- **Exit 0 `ACQUIRED`** prints `slot`, `backendPort`, `frontendPort`, `chromeDebugPort`. Use exactly those ports.
- **Exit 2 `BUSY`** prints who holds it. If the holder is a live agent working on the same change,
  tell the human instead of waiting. Do **not** poll in your own turns: start the waiter
  in the background (Bash tool, `run_in_background: true`) and end your turn or do other work. You will be
  woken when it exits, already holding the slot.

  **One-shot sessions (`claude -p`) must not start the background waiter.** The session ends when its
  turn does, so the waiter can acquire the slot after nobody is left to release it and block the next
  agent. Report BUSY and the holder, then stop. Only wait in the foreground, with a timeout, if the
  task needs the slot and you will stay until you have released it.

  ```sh
  node $R verify-wait
  ```

  - exit **0 `ACQUIRED`**: continue with step 2.
  - exit **3 `NEEDS_PING`**: a human's servers (or an unregistered process) hold the ports. Notify the
    human (push notification if available, plus a one-line message), e.g. *"Verification for <branch> wants
    ports <b>/<f>, held by <holder>. Reply 'keep' to stop me; I take over in N min."*, then start
    `node $R verify-wait --takeover-after <N>` in the background. If the human replies "keep", run
    `node $R hold --slot <slot> --minutes 60` and stop the waiter.
  - exit **4 `TIMEOUT`**: give up on browser evidence; say so in your report and mark the PR as
    needing a demo (<PROJECT: label or convention>).

## 2. Start the servers on the slot's ports, from *your* checkout

<PROJECT: commands that start backend + frontend from the current checkout on $backendPort / $frontendPort,
in the background, and how to tell they are up.>

Then record them, so release (and a crash cleanup) stops exactly these:

```sh
node $R verify-started backend
node $R verify-started frontend
```

## 3. Verify and capture evidence

<PROJECT: how to attach to the shared browser on chromeDebugPort, sign-in notes, evidence format and location.>

## 4. Release, always (also when you give up or fail)

```sh
node $R verify-release
```

This stops the servers recorded in step 2 and frees the slot for the next waiter. It acts only on the
slot your own session holds, and prints `released: false` and does nothing if you hold none, so it is
always safe to run. If you forget, the slot is freed when your session ends or its process dies, but
the next agent waits until then.

## Rules

- One slot per session; `verify-acquire` again while holding returns the same slot.
- Never stop servers you did not start, and never take a slot from a live agent.
- `node $R status` shows who holds what; `LOCAL_AGENT_VERIFICATION.md` at the main checkout root is the record.
