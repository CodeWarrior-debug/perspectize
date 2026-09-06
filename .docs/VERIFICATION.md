# Verification & Evidence Capture

Before marking any work complete, run interactive verification.

## 0. Authenticated session (one-time setup)

Self-verify drives Chrome through a persistent, pre-authenticated profile so it
can exercise logged-in flows (add a video, set a primary category) without the
agent ever handling a credential. The secret is a revocable Clerk session cookie
for a throwaway test user, living in a profile dir the agent cannot read.

### a. Create the test user (one-time)

The app runs a Clerk **development** instance locally (`sk_test` / `pk_test`),
which supports test identities with no real inbox:

```bash
make start                                   # backend :8080 + frontend :5173
bash .claude/scripts/sv-chrome.sh http://localhost:5173/
```

In that Chrome window, **Sign up**:
- Email: `perspectize-sv+clerk_test@gmail.com` (any `+clerk_test` address —
  Clerk dev instances intercept these)
- Password: a real one, stored in a human password manager — never in the repo,
  an `.env`, or the chat
- Email verification code: `424242` (fixed code for `+clerk_test` on dev
  instances)
- Finish username onboarding, then load the app once while signed in so the
  backend's just-in-time user creation (`clerk_middleware.go`) writes the local
  `users` row. No Clerk webhook needed.

Close Chrome. The session persists in `.claude/sv-profile/` (gitignored; covered
by the `Read` deny rules in `.claude/settings.json`). Repeat only when the Clerk
session expires.

### b. Wire the chrome-devtools MCP to that profile

`chrome-devtools-mcp` (v0.x) launches its own Chrome. Point it at the persistent
profile so the agent's browser is already signed in. In `~/.claude.json` →
`mcpServers.chrome-devtools.args`:

```json
"args": [
  "chrome-devtools-mcp@latest",
  "--userDataDir=/ABSOLUTE/PATH/TO/repo/.claude/sv-profile"
]
```

Then **restart Claude Code** — the MCP reads its config only at startup.

Notes:
- `--userDataDir` (camelCase) is the current flag; `--isolated` already defaults
  to `false`, but without `--userDataDir` the MCP uses
  `~/.cache/chrome-devtools-mcp/chrome-profile*`, not this one.
- This is a **global** MCP config edit — chrome-devtools in every project then
  loads this profile. Revert by removing the arg.
- The MCP-launched Chrome and a manual `sv-chrome.sh` **cannot run at the same
  time** (same profile dir → SingletonLock). Use `sv-chrome.sh` only for the
  one-time human sign-in; let the MCP own the browser after that.
- Alternative: keep `sv-chrome.sh` running (it exposes `:9222`) and use
  `--browserUrl=http://127.0.0.1:9222` instead of `--userDataDir`.

**Agent rule:** assume the session is live. If you hit a signed-out state, STOP
and ask the human to re-run the sign-in — never authenticate or enter
credentials yourself.

## 1. Start Services

The database is hosted on Sevalla (cloud PostgreSQL) — no Docker or local database setup needed.

**Check if already running:**
```bash
lsof -i :8080  # Backend
lsof -i :5173  # Frontend
```

**Start if not running:**
```bash
# Terminal 1: Backend (port 8080)
cd backend
make dev    # hot reload with air
# or: make run  # standard mode

# Terminal 2: Frontend (port 5173)
cd frontend
pnpm run dev
```

## 2. Verify Backend

```bash
curl -X POST http://localhost:8080/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __typename }"}'
# Expect: {"data":{"__typename":"Query"}}
```

Also test any frontend GraphQL queries (`src/lib/queries/*.ts`) against the live backend to catch schema drift.

## 3. Verify Frontend (Chrome DevTools MCP)

| Step | MCP Tool | Purpose |
|------|----------|---------|
| Navigate | `mcp__chrome-devtools__navigate_page` | Load frontend URL |
| Screenshot | `mcp__chrome-devtools__take_screenshot` | Visual verification |
| Snapshot | `mcp__chrome-devtools__take_snapshot` | DOM/component structure |
| Resize | `mcp__chrome-devtools__resize_page` | Responsive check (375px, 768px, 1024px) |
| Console | `mcp__chrome-devtools__list_console_messages` | Check for JS errors |
| Interact | `mcp__chrome-devtools__click` | Test buttons, toasts, navigation |

## 4. GSD Plan Verification

For each plan's `must_haves`:

| Check | Command |
|-------|---------|
| `truths` | Run actual command, verify output |
| `artifacts.path` | `test -f {path} && echo "exists"` |
| `artifacts.contains` | `grep -q "{pattern}" {path}` |
| `artifacts.min_lines` | `wc -l < {path}` >= N |
| `key_links.pattern` | `grep -q "{pattern}" {from}` |

## 5. Evidence Capture

Save screenshots to `/Users/jamesjordan/Downloads/screenshots/` with naming convention:
- **Prefix:** `sv-` (Self-Verify) — supersedes the old `ccsv-` prefix; `ccsv-` may still appear in older screenshots but new captures use `sv-`
- **Format:** `sv-{plan}-{description}-{width}.png`
- **Example:** `sv-01-02-mobile-375px.png`, `sv-01-04-ag-grid-desktop-1280px.png`
- Use `filePath` parameter on `take_screenshot` to save directly
- Take full-page screenshots (`fullPage: true`) at mobile (375px), tablet (768px), desktop (1280px)

Before creating PR:
- Screenshots at mobile (375px), tablet (768px), desktop (1280px)
- Console output showing no errors
- Verification commands output
- Upload the `sv-*` screenshots and link them in the PR — see [PR Screenshots](PR_SCREENSHOTS.md)
