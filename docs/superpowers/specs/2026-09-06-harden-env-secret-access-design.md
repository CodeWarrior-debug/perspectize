# Harden `.env` Secret Access + Authenticated Self-Verify — Design

**Date:** 2026-09-06
**Branch / worktree:** `chore/harden-env-secret-access` in `.claude/worktrees/security-env-access`
**Type:** chore (security hardening)
**Tracking issue:** none (no pre-existing issue; not manufacturing one per repo conventions)
**Execution sub-skill:** `superpowers:executing-plans`

## Problem

`.claude/settings.json` has no `deny` block, and `.claude/settings.local.json` broadly
allows `Bash(cat:*)`, `Bash(grep:*)`, `Bash(env:*)`, `Bash(source:*)`, `Bash(xxd:*)`, etc.
An AI agent working in this repo can therefore read `backend/.env` and `frontend/.env`
verbatim, which currently hold real values for `DATABASE_URL`, `JWT_SECRET`,
`CLERK_SECRET_KEY`, `YOUTUBE_API_KEY`, and more.

Separately, the self-verify workflow (`.docs/VERIFICATION.md`) drives Chrome via the
chrome-devtools MCP but has no authenticated-session story, so it cannot exercise
logged-in flows (adding a video, setting a primary category) without a human driving.

## Goals

1. The agent cannot read any `.env*` file except the sanitized `.env.example`
   (and `frontend/.env.test`), through the Read tool **or** through Bash.
2. `.env.example` fully documents every required variable by name + comment, with
   **no** secret-shaped placeholder values.
3. Self-verify can operate as a real logged-in user without the agent ever
   handling a credential.
4. Docs reflect the new policy so a human knows what to fill in and why reads fail.

## Non-goals

- No application code changes. No Clerk test-mode / testing-token wiring into the app.
- No CI secret-scanning changes (Trivy/pnpm-audit workflow untouched).
- No rotation of the secrets currently in the local `.env` files (out of scope;
  note it as a follow-up if they were ever committed — they were not).

## Design

### Component 1 — `.env` access policy

**1a. `.claude/settings.json` `deny` block** (new; `settings.json` is shared/committed):

```jsonc
"permissions": {
  "deny": [
    "Read(./**/.env)",
    "Read(./**/.env.*)",
    "Read(./.env)",
    "Read(./.env.*)",
    "Read(./.claude/sv-profile/**)"
  ],
  "allow": [ /* existing list, plus: */
    "Read(./**/.env.example)",
    "Read(./**/.env.test)"
  ]
}
```

Claude Code applies `deny` over `allow`; the two `.env.example` / `.env.test`
allow entries are the carve-outs. `sv-profile` is the persistent Chrome profile
directory (Component 3).

**1b. `.claude/hooks/deny-env-read.sh`** (new PreToolUse hook, matcher `Bash`) —
the Bash backstop. Reads the hook JSON on stdin, extracts `tool_input.command`,
and exits `2` (blocking, per Claude Code hook convention) with a message on stderr
when the command would read a disallowed `.env` file. Detection:

- Tokenize on shell separators (`;`, `|`, `&&`, `||`, newlines, `$(`, backticks).
- Flag any token ending in `.env` or matching `.env.<x>` where `<x>` is not
  `example` or `test`, when it appears:
  - as an argument to a read-ish command: `cat tac nl grep egrep fgrep rg ag sed
    awk gawk head tail less more most bat strings xxd od hexdump base64 openssl
    dd cut sort uniq column paste join comm wc md5 shasum sha256sum cp install`
  - after a `<` redirection
  - as `--env-file <path>` / `--env-file=<path>` (docker, docker compose, etc.)
  - inside `python -c` / `python3 -c` / `node -e` / `ruby -e` / `perl -e` string
    literals (substring match on `.env` with the same example/test exclusion)
- Also flag bare `env`, `printenv`, `export -p`, `set` with **no** file arg only
  when combined with a pipe to one of the read-ish commands above AND the session
  has an `.env` sourced — too fragile; instead simply flag `source ./…/.env` /
  `. ./…/.env` directly (sourcing a blocked env file).
- Allow-list short-circuit: if every flagged token resolves to `.env.example` or
  `frontend/.env.test`, exit `0`.
- Deny message: `Blocked: reading <file> is not permitted. Variable names and
  docs are in .env.example. Secrets are entered by humans only — see
  .docs/SECURITY.md.`

Wired into the existing `PreToolUse` → `Bash` `hooks` array in `settings.json`
after the current three entries.

**1c.** `settings.local.json` is left as-is (per-machine, uncommitted, not a
reliable control). The hook is what makes the broad `Bash(cat:*)` allow safe.

### Component 2 — `.env.example` as the canonical variable reference

- Edit `backend/.env.example` and `frontend/.env.example`: replace every
  secret-shaped value with an empty value, keep every key and every comment.
  - `JWT_SECRET=your-secret-key-here-minimum-32-bytes-for-security` → `JWT_SECRET=`
  - `CLERK_SECRET_KEY=sk_test_xxx` → `CLERK_SECRET_KEY=`
  - `CLERK_WEBHOOK_SIGNING_SECRET=whsec_xxx` → `CLERK_WEBHOOK_SIGNING_SECRET=`
  - `VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxx` → `VITE_CLERK_PUBLISHABLE_KEY=`
  - `VITE_YOUTUBE_API_KEY=your-youtube-api-key` → `VITE_YOUTUBE_API_KEY=`
  - Non-secret defaults are kept as-is: `ACCESS_TOKEN_MINUTES=15`,
    `RATE_LIMIT_PER_MIN=100`, `YOUTUBE_API_CACHE_TTL_SECONDS=21600`,
    `APP_ENV=development`, `VITE_GRAPHQL_URL=http://localhost:8080/graphql`.
  - `CORS_ORIGINS=*` kept (documented dev default, not a secret).
- Add a one-line header to each: `# Copy to .env and fill in real values. This
  file is the source of truth for which variables exist.`
- No new files, no `.gitignore` changes (`!.env.example` / `!.env.test` already
  allow-listed in all three gitignores).
- Verify no stale second copy: the `.claude/worktrees/*` checkouts have their own
  `.env.example`; not our concern (gitignored working trees).

### Component 3 — Authenticated self-verify session

**Mechanism:** persistent Chrome profile + dedicated Clerk **test user**. The
agent drives an already-authenticated browser; it never sees a credential. Worst
case a leaked artifact is a revocable session cookie for a throwaway identity.

- **`.claude/scripts/sv-chrome.sh`** (new): launches Chrome with
  `--user-data-dir="$REPO_ROOT/.claude/sv-profile"` plus
  `--remote-debugging-port=9222` (and `--no-first-run --no-default-browser-check`).
  Used both for the one-time human login and as the browser the chrome-devtools
  MCP attaches to.
- **`.claude/sv-profile/`**: added to root `.gitignore`; covered by the Read
  `deny` rule in Component 1a.
- **chrome-devtools MCP wiring (implementation must verify):** confirm how the
  MCP is configured in this repo (`.mcp.json` / `settings*.json` MCP args). Pin
  its `user-data-dir` to `.claude/sv-profile`, or — if the MCP cannot be pinned —
  document the "pre-launch `sv-chrome.sh`, MCP attaches to port 9222" flow. The
  fallback (attach-to-running-Chrome) is the safer assumption; pinning is a
  nice-to-have.
- **One-time setup (documented, not scripted):** human runs `sv-chrome.sh`, signs
  in as the dedicated test user against the target env (local `:5173` or the
  private staging URL — kept out of committed docs), closes the window. Session
  persists in `.claude/sv-profile`.
- **Agent rule:** assume the session is live. On hitting a signed-out state, stop
  and ask the human to re-run the one-time login — never attempt to authenticate.

### Component 4 — Remediate GitHub secret-scanning alert #1

**Alert:** GitHub secret-scanning alert #1 — a `whsec_…` literal flagged as a Stripe Webhook
Signing Secret (Stripe/Svix/Clerk share the `whsec_` prefix). Public repo.
Locations (repo tip): `backend/internal/adapters/auth/webhook_handler_test.go:22`
and `docs/superpowers/plans/2026-09-05-postgres-auth-test-coverage-plan.md:3307`.

**Assessment:** not a real credential. It is a hand-crafted "`whsec_` + 32 chars
of valid base64" fixture whose only purpose is to let `svixwebhook.NewWebhook`
build/verify signatures inside `webhook_handler_test.go`. No Stripe/Clerk/Svix
service was ever configured with it, so **no rotation is required**.

**Fix — remove the literal, generate at runtime:**

- In `webhook_handler_test.go`, replace the `const testWebhookSecret = "whsec_…"`
  with a `var testWebhookSecret = newTestWebhookSecret()` where
  `newTestWebhookSecret()` returns `"whsec_" + base64.StdEncoding.EncodeToString`
  of 24 `crypto/rand` bytes. Add `crypto/rand` + `encoding/base64` imports.
  Update the comment to explain it is generated so no secret-shaped literal lives
  in the repo. All 20+ call sites keep working unchanged (same identifier).
- In `2026-09-05-postgres-auth-test-coverage-plan.md`, update the code snippet at
  line ~3305–3307 to match (generated secret, no literal).
- `go test ./internal/adapters/auth/...` must stay green (svix signs+verifies
  with the generated value).

**Close the alert:** after the fix is committed, resolve alert #1 via
`gh api --method PATCH repos/CodeWarrior-debug/perspectize/secret-scanning/alerts/1
-f state=resolved -f resolution=used_in_tests -f resolution_comment="Synthetic
svix test fixture, never a real secret; replaced with a runtime-generated value
in <PR>."` **No git history rewrite** — the string is not a real secret, and
force-rewriting a public repo's merged history is disproportionate. The alert
resolution + tip removal is sufficient.

**Prevent recurrence:** enable **push protection** for secret scanning on the
repo (`gh api --method PATCH repos/CodeWarrior-debug/perspectize -F
security_and_analysis='{"secret_scanning_push_protection":{"status":"enabled"}}'`),
and note in `.docs/SECURITY.md` that secret-shaped test fixtures must be generated
at runtime, never hard-coded.

### Component 5 — Documentation

- **`.docs/SECURITY.md`**: new section "Local secret access for AI agents" —
  the deny rules, the `deny-env-read.sh` hook, `.env.example` as the only
  readable env file, the `sv-profile` approach, and the rule that all secret
  values are entered by humans.
- **`.docs/VERIFICATION.md`**: new "Section 0 — Authenticated session" covering
  `sv-chrome.sh`, the one-time login, and the signed-out-state rule.
- **`CLAUDE.md`** ("Self-Verification (MANDATORY)"): one line — `.env*` files
  except `.env.example` are unreadable by design; authenticated self-verify uses
  the persistent Chrome profile (link to VERIFICATION.md §0).
- **`backend/CLAUDE.md` / `frontend/CLAUDE.md`**: "copy `.env.example` → `.env`
  and fill in real values; the agent cannot read `.env`."
- **Root `CLAUDE.md` hooks list**: add a bullet for `deny-env-read.sh`.

## Testing / Verification

No application code changes, so `go build` / `go test` / `pnpm test:run` are
sanity-only (must stay green).

Hook battery — each must be **blocked**:

```
cat backend/.env
grep -r JWT_SECRET backend/.env
sed -n '1,5p' frontend/.env
awk '{print}' backend/.env
head -c 100 backend/.env; tail -n1 backend/.env
xxd backend/.env | head
strings backend/.env
cat < backend/.env
source backend/.env
. ./backend/.env
docker run --env-file backend/.env alpine
python3 -c "print(open('backend/.env').read())"
node -e "console.log(require('fs').readFileSync('backend/.env','utf8'))"
cp backend/.env /tmp/x
base64 backend/.env
```

Each must be **allowed**:

```
cat backend/.env.example
grep JWT_SECRET backend/.env.example
cat frontend/.env.test
cat backend/main.go
```

Read-tool checks: `Read(backend/.env)` denied; `Read(backend/.env.example)` allowed.

Manual: run `sv-chrome.sh`, confirm a login persists across a second launch.

## Rollout

1. All work in `.claude/worktrees/security-env-access` on
   `chore/harden-env-secret-access`.
2. Run `/revise-claude-md`, then create PR via `gh api` using the `chore.md`
   template (Summary / Changes / Verification). Paste the hook battery output in
   Verification. No screenshots (no UI change). No `Closes #`.
3. After merge: each dev re-runs the one-time `sv-chrome.sh` login locally.

## Risks

- **Hook false-negatives** — an exotic read path slips through. Mitigation: the
  battery above; the hook is defense-in-depth over the Read `deny`, not the only
  layer; easy to extend the command list later.
- **Hook false-positives** — a legit command mentioning a path ending in `.env`
  gets blocked. Mitigation: exact-suffix match on `.env` / `.env.<x>`, not a
  substring; `.env.example` / `.env.test` short-circuit.
- **chrome-devtools MCP can't be pinned to the profile** — falls back to the
  documented pre-launch/attach flow; no blocker.
- **`settings.local.json` on other machines** may re-open a gap; the hook (in
  committed `settings.json`) still fires, so the backstop holds.
