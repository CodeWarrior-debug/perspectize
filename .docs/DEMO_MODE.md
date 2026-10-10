# Demo Mode

A self-contained Perspectize stack — persistent Postgres, seeded users and content, no Clerk, no YouTube API — for three jobs:

1. **Guided walkthroughs / videos**, including for signed-out visitors (the guest landing's "Watch how it works" slot).
2. **E2E testing of flows that were effectively untestable**: multi-user auth, privacy between users, messaging, admin role, adding a video without a YouTube key.
3. **Exploring the app locally** with realistic data that survives restarts.

One set of Playwright scripts ("tours") serves 1 and 2: run fast they are tests; run in the `record` project they become narrated videos.

## Quick start

```bash
make demo-up        # build + start: http://localhost:4173  (API :8081, Postgres :5434 demo/demo)
# pick a persona in the "Sign in" dialog — no account needed

make demo-test      # reset demo data, run tours + flows as E2E
make demo-record    # reset demo data, record tours → frontend/demo/out/videos/*.webm
make demo-reset     # put demo-persona data back to the pristine seed
make demo-down      # stop (data kept)     make demo-wipe  # stop + delete the volume
```

Playwright runs on the host: `pnpm install` in `frontend/` once, plus a Chromium (`pnpm --dir frontend exec playwright install chromium`). In the cloud sandbox, use the preinstalled one with `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.

**Without Docker** (e.g. against a local Postgres): run migrations, `go run ./cmd/seed-demo` from `backend/`, start the server with `DEMO_MODE=true`, and the frontend with `VITE_DEMO_MODE=true pnpm run dev`. Then `pnpm run demo:test` (defaults: frontend `:5173`, API `:8080`; override with `DEMO_BASE_URL` / `DEMO_GRAPHQL_URL`).

## Personas

Defined once in `backend/internal/demo/fixtures.go` (mirrored for the picker in `frontend/src/lib/auth/demo.svelte.ts` — keep in sync).

| Key | Username | Role | Use it for |
|---|---|---|---|
| `alice` | alice_demo | DEFAULT | Lots of perspectives, including a **private** one |
| `ben` | ben_demo | DEFAULT | Disagrees with Alice — Compare has real conflict |
| `carmen` | carmen_admin | ADMIN | Admin-only UI |
| `newbie` | newbie_demo | DEFAULT | Empty account; onboarding coach still active |

Seed also includes 5 YouTube videos, 8 perspectives and an Alice↔Ben message thread (2 unread for each of them: only the other's messages count). "Me at the zoo" (`jNQXAC9IVRw`) is deliberately *not* seeded so tours can add it.

## How it works

| Piece | Where | What it does |
|---|---|---|
| Config gate | `backend/internal/config/demo.go` | `DEMO_MODE=true` enables demo mode; **fatal with `APP_ENV=production`** |
| Demo auth | `backend/internal/adapters/auth/demo_token_verifier.go` | Wraps the Clerk verifier: `Bearer demo.<persona>` → `clerk_user_id = demo_<persona>`; anything else goes to Clerk. Unseeded personas are never created on demand |
| Offline YouTube | `backend/internal/adapters/youtube/fixture_client.go` | Canned metadata for fixture IDs, a placeholder for any other ID — the add-video flow works with no API key |
| Seeder | `backend/cmd/seed-demo` | Idempotent; `-reset` deletes only demo-persona rows first. Refuses non-local DB hosts without `-allow-remote` (protects the shared Neon DB) |
| Frontend auth facade | `frontend/src/lib/auth/`, `src/lib/components/auth/` | `VITE_DEMO_MODE=true` drops `ClerkProvider`; `AuthShow` / `SignInTrigger` / `UserMenu` / `useAuthState` / `getAuthToken` pick Clerk or the demo session. `?demo_as=<key>` selects a persona (`?demo_as=` signs out) |
| Stack | `docker-compose.demo.yml` | postgres (volume `demo_pgdata`) → migrate → seed → backend (**production image**, `DEMO_MODE=true`) → frontend (`frontend/Dockerfile.demo`, nginx) |
| Tours / flows | `frontend/demo/` | Playwright; `e2e` + `record` projects |
| CI | `.github/workflows/ci.yml` → `demo-e2e` | Seeds a fresh DB and runs `demo:test` on every PR |

## Writing a tour

```ts
import { test, expect, activityRow } from '../fixtures';

test('my flow', async ({ page, tour }) => {
	await tour.start({ persona: 'alice', video: 'my-flow' }); // video name → out/videos/my-flow.webm
	await tour.caption('What the viewer should notice.');      // no-op in e2e
	await tour.click(page.getByRole('button', { name: 'Add Content' }));
	await tour.type(page.getByPlaceholder('…'), 'text');       // types visibly when recording
	await expect(page.getByText('…')).toBeVisible();           // assertions run in both modes
});
```

- `tours/*.tour.ts` run in both projects; `flows/*.spec.ts` are e2e-only (no video). API-level checks (`request.post(DEMO_GRAPHQL_URL, { headers: { Authorization: 'Bearer demo.ben' } })`) are fine in flows.
- Tours may mutate data. Each `make demo-test` / `demo-record` resets first; files run in name order with one worker, so `flows/` sees the pristine seed.
- Prefer roles/labels/`data-testid` over CSS. AG Grid rows: `activityRow(page, title)`; the perspective cell is `[col-id="perspectize"]`.

## Publishing videos

The coach and guest landing already read three optional video URLs (`frontend/src/lib/onboarding/config.ts`). The shipped tours map onto them:

| Tour video | Env var (set at build time) |
|---|---|
| `guest-product.webm` | `VITE_ONBOARDING_VIDEO_GUEST_PRODUCT` |
| `add-video.webm` | `VITE_ONBOARDING_VIDEO_HOW_ADD_VIDEO` |
| `perspective.webm` | `VITE_ONBOARDING_VIDEO_HOW_PERSPECTIVE` |

Host the files as release assets (same flow as [PR_SCREENSHOTS.md](PR_SCREENSHOTS.md)) or drop them under `frontend/static/onboarding/`, then set the env vars. Playwright records VP8 WebM (1280×720); for older Safari convert to MP4: `ffmpeg -i in.webm -c:v libx264 -pix_fmt yuv420p -movflags +faststart out.mp4`. Recordings show a "Demo mode · Sample data" banner — intentional, so nobody mistakes seeded data for real users.

## Security model

- Demo tokens are unsigned by design. The only protection is that production never runs with `DEMO_MODE=true` — enforced at startup. Never deploy the demo stack publicly with real user data.
- A production (Clerk-only) backend treats `demo.*` tokens as anonymous (covered by `TestMiddleware_DemoTokenIgnoredWithoutDemoVerifier`).
- Compose publishes ports on `127.0.0.1` only.
- New frontend code must use the auth facade (`$lib/auth`, `components/auth/*`), not `svelte-clerk` directly, or it will break in demo mode (there is no `ClerkProvider` in the tree).

## Not covered yet / next steps

- **Discover page:** Trending comes from the backend's `youtubeTrending` query, and demo mode has no Trending fixture, so the feed shows "Trending is unavailable right now." Search hands off to youtube.com, so it needs no fixture. A fixture-backed Trending client would fill the feed.
- **Clerk UI itself** (sign-up, profile modal, webhook sync) is out of scope — demo mode replaces it rather than exercising it.
- **A hosted public demo** (e.g. a Sevalla app with its own database, reset nightly) is feasible with `seed-demo -reset -allow-remote` on a schedule, but needs an explicit decision: anyone could post content as the personas.
- **Captions/voice-over**: captions are burned in; a narration track or chaptering could be layered on the same scripts.
- **Bible passage** content type isn't seeded (requires `cmd/seed-bible` reference data).
