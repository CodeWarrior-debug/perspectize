# Per-user rate limiting (and the missing chat button)

Status: draft <!-- Direction for 1a and 1b approved by the product owner; formal sign-off on the *why* still pending. Parts 2 and 3 are undecided. -->

## Context: the original report and how it led here

This intent started as a bug report, not a rate-limiting project.

- **Report (relayed 2026-11-01):** a user, using the deployed app (`https://perspectize-fe-rf767.sevalla.page/`) on an iPhone, could not see the chat button in Safari, and then not in Chrome either. She was confirmed to be **signed in**. (Chrome on iOS uses Apple's WebKit engine, so a Safari-specific restriction would also affect it. That theory was dropped once sign-in was confirmed.)
- **What the button needs:** `MessagingWidget` renders only when Clerk reports a signed-in user *and* the `me` GraphQL query has returned a user. A signed-out visitor sees only the guest landing page, with no button at all.
- **Hypotheses checked, in order:**
  1. *Not signed in / Clerk development-instance cookie issue on Safari:* ruled out, she was signed in.
  2. *Popup blockers:* not applicable, the button and its panel are ordinary in-page elements, not popup windows.
  3. *Button off-screen* (pinch-zoom, or page wider than the screen on iOS): possible but not confirmed. The code clamps the button on-screen, so a stale saved position is unlikely.
  4. *Onboarding coach covering it:* real overlap in the code (`OnboardingCoach` is `z-40`, same as the button and later in the DOM; on phones it opens as a modal bottom drawer at `z-50`). Plausible for a new account, but not confirmed.
  5. *`me` request failing:* the logs were then searched for this (below).
- **Log review (Sevalla backend, 2026-10-26 to 2026-11-02):** 0 ERROR entries. Only 9 `4xx` and 3 `5xx` responses in a week. The `5xx` (and one `400`) on 2026-10-31 ~01:16 UTC line up with a backend restart. Four `401`s on 2026-11-02 01:55 UTC came from the product owner's own address and show requests going out before the auth token was ready. The **only event whose timing matches the user's attempt** was the 2026-10-30 ~03:13 UTC burst of `429`s, confirmed by the product owner.

**How it ties together:** a rate-limited `me` call is a plausible way for a signed-in user to lose the button with no visible error, and the per-IP limiter is what made that outcome easy to hit. Fixing the limiter addresses the most likely cause and a real design weakness regardless of whether it turns out to be this user's exact cause. The remaining unconfirmed pieces (was the user that client, was `me` one of the rejected calls) are listed under Open questions.

## Problem

A user on mobile (Safari, then Chrome on iPhone) was signed in but could not see the floating chat button in the deployed web app. Backend logs (Sevalla, 2026-10-26 to 2026-11-02) show no server errors in that period, but they do show one event whose timing matches the report:

- **2026-10-30 ~03:13 UTC:** well over 100 `POST /graphql` calls arrived within about one second from two clients. The backend answered **4 × `429`** (rate limited), all to the IPv6 client `2a09:bac6:b560:13f5::1fd:70`. The logs do not show which operations were rejected, and whether that client was the reporting user is **unconfirmed**.

The chat button (`MessagingWidget.svelte`) renders only when the `me` query has succeeded. If `me` is rejected with a `429`, the app retries once (default `retry: 1`, ~1 s delay), which can land while the caller is still over the limit. The query then stays failed, and the button silently does not render, even though the user is signed in and the rest of the page may work.

The rate limiter makes this more likely than it should be:

- **Per IP only.** `GlobalRateLimit` is `httprate.LimitByIP(RATE_LIMIT_PER_MIN, 1m)` with a default of 100/min (`backend/internal/adapters/web/middleware/ratelimit.go`, `backend/internal/config/security.go`). Everyone behind the same address (household Wi-Fi, office, carrier-grade NAT) shares one budget, so one chatty page load can lock out the people next to it.
- **Low for a single-page app.** One screen can fire many GraphQL calls at once.
- **Runs before auth by design** (`api.go`: "rate limit before auth to prevent DoS"), so it cannot key on the user.
- **Likely spoofable.** `middleware.RealIP` (chi) trusts client-supplied `X-Forwarded-For` / `X-Real-IP` / `True-Client-IP` headers. Not yet verified against the Cloudflare/Sevalla setup.

## Proposed outcome

A signed-in user is never rate limited because of what other people on the same network are doing, and a normal page load by one user stays well inside their own budget. Unauthenticated and abusive traffic is still bounded.

Approved direction (part 1):

- **1a.** Keep an IP-based limit *before* auth as flood protection only, set generously.
- **1b.** Add a per-user limit *after* `auth.Middleware`, keyed on the authenticated user ID, so each person has their own budget.
- *Implied by 1a/1b, confirm in the spec:* unauthenticated requests (the guest landing page) stay on the IP tier only.

**Numbers are not decided.** The values floated in conversation (600/min per IP, 300/min per user) are placeholders. Final numbers are to be set from a code review (how many GraphQL calls the app actually makes per page load, per route, and over a session, including the realtime/WebSocket paths) plus a logical projection of expected users per IP and abuse tolerance.

## Affected users and systems

- All signed-in users, especially those on shared networks and mobile carriers.
- Guests (the sign-in landing page) via the IP tier.
- Backend: `backend/internal/server/api.go` (middleware order), `backend/internal/adapters/web/middleware/ratelimit.go`, `backend/internal/config/security.go` (`RATE_LIMIT_PER_MIN`, and a new per-user setting), `auth.Middleware`.
- Deployment config: `RATE_LIMIT_PER_MIN` on the Sevalla backend app (production value not visible from the repo or logs).
- Frontend (indirectly): any component that depends on `me` loading, notably `MessagingWidget`.

## Constraints

- Rate limiting must remain a protection against unauthenticated floods; the per-user tier cannot replace it.
- Limiter state is in-process (`httprate`), so limits are per backend instance. Check this against how many instances run before choosing numbers.
- The existing messaging-specific limit (`ErrRateLimited` in `messaging_service.go`) is separate and must not be affected.
- Do not weaken the existing pre-auth ordering without a reason recorded in the spec.
- Low-cost hosting: no new infrastructure (for example Redis) just for rate limiting without a decision.

## Open questions

- **Decided in direction, numbers open:** the final per-IP and per-user limits (see Proposed outcome).
- **Part 2: harden the IP source (undecided, needs understanding first).** Replace `RealIP`'s first-match header logic with trust in only the proxy's own header (for example `CF-Connecting-IP`). Needs to be understood first: what headers Cloudflare and Sevalla actually send to the backend, whether the current setup is exploitable in practice, and what happens in local/dev without a proxy.
- **Part 3: reduce the page-load burst on the frontend (undecided, needs understanding first).** Batch or stagger calls that fire together. Needs to be understood first: what actually generates the burst. The ~100-call spike on 2026-10-30 was not traced to a specific component in code review, and it may have been automated traffic (tests or perf runs) rather than a normal page load.
- Was the reporting user actually on `2a09:bac6:b560:13f5::/64`, and was `me` one of the four rejected requests? (Ask the user to check their IP address and whether the button appeared after a reload a minute or two later.)
- Separate fixes discussed but **not decided and not part of this intent**: making the `me` query retry on `429`/`401` with a longer backoff (or rendering the chat button as soon as Clerk reports a session), and raising the button above the onboarding coach panel (`OnboardingCoach` is `z-40`, same as the button, and later in the DOM). Likely their own intents or small PRs.
- Should limits be exposed as separate environment variables for each tier, and what should the response look like when the per-user limit trips (same GraphQL-formatted 429 as `GraphQLRateLimit`)?
- Production observability: do we want a log line or metric when either tier trips, so this can be seen without reading access logs?

## Downstream

- Spec: <!-- link, e.g. ../../docs/superpowers/specs/YYYY-MM-DD-per-user-rate-limiting-design.md -->
- Plan(s): <!-- link(s) -->
- PRs (one line each, add as they open; tick on merge):
  - [ ] <!-- title — PR link — open | merged -->
