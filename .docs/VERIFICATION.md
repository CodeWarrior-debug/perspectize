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
- Password: a real one, kept in a human password manager and mirrored into the
  gitignored `.claude/.env` as `SV_TEST_USER_PASSWORD` (see
  `.claude/.env.example` and §3) so a lapsed session can be re-driven — never in
  a tracked file or in the chat
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

### c. Scripted checks over CDP (no MCP needed)

If `sv-chrome.sh` is running (`:9222`) but the chrome-devtools MCP can't launch
(it reports the profile is already in use), attach to that Chrome instead:
`node .claude/scripts/sv-cdp-verify.cjs [scenario]`. It opens its own tab, runs a
scenario (default `cell-popover`: styling parity, copy values, tags multi-select,
hover/scroll behavior), prints JSON, and closes only its own tab. Copy checks
paste the real clipboard into the search box to prove what was stored — this
overwrites your clipboard. Add scenarios in the `SCENARIOS` object; helpers
(`hoverCell`, `popover`, `pasteRead`) are at the top of the file. Note that hovering
a cell scrolls it into view, and a scroll cancels a pending popover open — the
helper scrolls first and settles before hovering.

**Verifying from a worktree.** A worktree has no gitignored `frontend/.env`, and
the Clerk session doesn't carry across dev-server ports. Serve the worktree's code
on a spare port with a throwaway wrapper config (outside the repo) that spreads the
worktree's `vite.config.ts` and sets `root` to the worktree's `frontend/` and
`envDir` to the main checkout's `frontend/` (vite has no `--envDir` CLI flag; don't
symlink or read `.env`). Run it with `vite dev --config <wrapper> --port 5174
--strictPort`, ask the human to sign in once at that origin in the `sv-chrome.sh`
Chrome, then run the script with `BASE_URL=http://localhost:5174`. The `chat-panel`
scenario measures the messaging panel's top edge against the app header at several
viewport heights.

## 1. Start Services

The everyday dev database is hosted on Neon (cloud PostgreSQL) — no local database setup needed. Docker Desktop is installed and is used only for the isolated demo stack (`make demo-up` / `demo-test` / `demo-record`, own Postgres on port 5434); start it with `open -a Docker` if the daemon isn't running.

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

> **Local-only step — do not attempt in cloud / CI / fresh-machine sessions.**
> Driving the running app requires two gitignored, machine-local artifacts:
> - `.claude/.env` — `SV_TEST_USER_EMAIL` / `SV_TEST_USER_PASSWORD` / `SV_TEST_USER_OTP` for the dedicated Clerk dev-instance test user (values are hand-provisioned per machine; never commit or paste them).
> - `.claude/sv-profile/` — the persisted Chrome profile the MCP attaches to.
>
> If either is missing, or there is no real Chrome / display, **skip this section entirely** and run only the headless checklist (`go build ./...`, `go test ./...`, `pnpm run test:run`). Do not try to sign in to Clerk — the instance and creds are scoped to a single local operator. Hand any UI-behavior verification back to a local session.

| Step | MCP Tool | Purpose |
|------|----------|---------|
| Navigate | `mcp__chrome-devtools__navigate_page` | Load frontend URL |
| Screenshot | `mcp__chrome-devtools__take_screenshot` | Visual verification |
| Snapshot | `mcp__chrome-devtools__take_snapshot` | DOM/component structure |
| Resize | `mcp__chrome-devtools__resize_page` | Responsive check (375px, 768px, 1024px) |
| Console | `mcp__chrome-devtools__list_console_messages` | Check for JS errors |
| Interact | `mcp__chrome-devtools__click` | Test buttons, toasts, navigation |

> `fill` **appends** to a non-empty input rather than replacing it. Clear the field first via `evaluate_script` (native value setter + dispatch `input`) before filling.

## 4. Evidence Capture

**Video is the default.** If the change affects anything a user does or sees happen (clicks, typing, navigation, scrolling, hover, toggles, loading more, popovers opening and closing, a button changing with the input, a new tab opening), record a video of it working. A screenshot can't show any of that. If you're unsure whether something counts as behavior, record a video.

- **Record the after only.** A video doesn't need a "before" clip: show the change working on the branch.
- **Tools:** record with the shared recorder (`~/.claude/tools/video-capture/record-clip.mjs`) or a copy adapted under its `demos/<name>/` folder. Recording, encoding and the GitHub embed recipe (a GIF preview linked to the mp4, because GitHub strips `<video>`) are in [tools/video-capture](../tools/video-capture/README.md) and [PR Screenshots](PR_SCREENSHOTS.md#videos).
- **Naming:** `sv-{plan}-video-{NN}-{what}-{width}px.mp4`, e.g. `sv-bible-video-01-add-psalm-139-1-10-1280px.mp4`.
- **Check it before calling it evidence:** pull a few frames (an ffmpeg contact sheet works) and confirm the clip shows the steps, not a loading screen.

**Screenshots are the exception.** Use them only when the change doesn't affect behavior, or the behavior isn't relevant to the change: spacing, colour, typography, alignment, or a layout fix on a fixed screen. For these, take a **before/after pair** at the same width, so the reviewer can see the difference.
- **Naming:** `sv-{plan}-{description}-{width}.png`, e.g. `sv-01-02-mobile-375px.png`. The `sv-` (Self-Verify) prefix replaces the old `ccsv-`.
- **Capture:** use the `filePath` parameter on `take_screenshot` to save directly. Prefer viewport-sized shots: a full-page shot of a long feed comes out too tall to read.

**Mobile and desktop: decide for each flow.** For videos and screenshots alike, ask whether the change looks or behaves differently on a phone (375px) than on desktop (1280px; 768px if tablet matters). If it does, capture each width that differs: a layout that stacks on phones, a control that moves or hides, a mobile-only gesture. If it doesn't, one width is enough; say which one you used and why one is enough.

Save everything to `/Users/jamesjordan/Downloads/screenshots/`.

Before creating PR:
- A video of every behavior the PR changes (after only), at each width where it differs
- Before/after screenshots only for changes that don't affect behavior, at each width where they differ
- Console output showing no errors
- Verification commands output
- Upload the `sv-*` videos (with GIF previews) and screenshots and link them in the PR — see [PR Screenshots](PR_SCREENSHOTS.md)
