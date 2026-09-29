# Phase 12: Authentication — Context

## Phase Goal

Replace user dropdown selector with Clerk-based authentication. Secure all GraphQL mutations. Enable user-specific features.

## Problem Statement

From FEATURE_BACKLOG.md:

"The GraphQL client has empty `headers: {}` — no auth tokens, no CSRF protection, no per-user cache scoping."

Current system allows anyone to:
- Create/update/delete perspectives
- Create/update/delete content
- Act as any user (via dropdown selector)

## Approach: Clerk Authentication Provider

**Decision:** Use [Clerk](https://clerk.com) instead of custom JWT implementation.

**Why Clerk over custom JWT:**
- Eliminates 10-17 days of auth backend development (Argon2id, refresh tokens, password reset, email verification)
- Official Go SDK v2 with chi-compatible JWT middleware
- Community SvelteKit SDK (`svelte-clerk`) with Svelte 5 runes support
- Pre-built UI components (SignIn, SignUp, UserButton, UserProfile)
- 50K MAU free tier — more than sufficient for MVP and beyond
- No password storage, no token rotation logic, no security-critical crypto code

**Why not other providers:**
- Auth0: No Svelte SDK, expensive for production features
- Supabase Auth: Requires SSR hooks — incompatible with adapter-static
- Firebase Auth: No Svelte SDK, dated UI, Google lock-in
- Logto: Requires SSR hooks — incompatible with adapter-static
- Lucia Auth: Deprecated (March 2025)
- Hanko: Smaller community, 10K free tier, less mature Go SDK
- Custom JWT: 10-17 days effort, security risk from hand-rolling auth

Full comparison: `12-RESEARCH-provider-comparison.md`

## Research Documents

- `12-RESEARCH-sveltekit.md` — Clerk + SvelteKit integration (svelte-clerk, SPA mode, token forwarding)
- `12-RESEARCH-go-backend.md` — Clerk Go SDK middleware, webhook sync, user mapping
- `12-RESEARCH-provider-comparison.md` — 8 providers evaluated against project constraints

## Current Architecture

```
Frontend                    Backend
┌─────────────┐            ┌─────────────┐
│ User Select │───────────▶│ No Auth     │
│ Dropdown    │            │ Middleware  │
└─────────────┘            └─────────────┘
     │                           │
     ▼                           ▼
┌─────────────┐            ┌─────────────┐
│ GraphQL     │───────────▶│ Resolvers   │
│ Client      │ userId     │ Trust input │
│ (no auth)   │ in request │             │
└─────────────┘            └─────────────┘
```

## Target Architecture (Clerk)

```
Frontend (SvelteKit SPA)              Backend (Go + chi)
┌──────────────────────┐              ┌──────────────────────┐
│ ClerkProvider        │              │ clerk-sdk-go/v2      │
│ ├── SignedIn/Out     │  Bearer      │ ├── WithHeaderAuth   │
│ ├── UserButton       │──token──────▶│ ├── SessionClaims    │
│ └── getToken()       │              │ └── ForContext()     │
└──────────────────────┘              └──────────────────────┘
     │                                       │
     ▼                                       ▼
┌──────────────────────┐              ┌──────────────────────┐
│ GraphQL Client       │              │ Resolvers            │
│ + Authorization      │  query/      │ ├── auth.ForContext() │
│   Bearer header      │──mutation───▶│ ├── ownership check  │
└──────────────────────┘              │ └── user.ID (local)  │
     │                                └──────────────────────┘
     ▼                                       │
┌──────────────────────┐              ┌──────────────────────┐
│ TanStack Query       │              │ Webhook Handler      │
│ (user-keyed cache)   │              │ /webhooks/clerk      │
└──────────────────────┘              │ (Svix verification)  │
                                      └──────────────────────┘
```

## Key Architecture Decisions

### 1. SPA Mode (adapter-static)

The frontend uses `adapter-static` — no `hooks.server.ts` available. All auth is client-side:
- `ClerkProvider` wraps the app with publishable key only
- `CLERK_SECRET_KEY` stays on the Go backend only
- Token verification happens on the Go backend, not SvelteKit
- Layout changes: `prerender=false`, `ssr=false`, fallback=`index.html`

### 2. Bearer Token Flow (not cookies)

Frontend gets session token via `getToken()`, sends as `Authorization: Bearer <token>`. Go backend verifies with `WithHeaderAuthorization()` middleware. No httpOnly cookie needed (Clerk manages session tokens internally with 60-second TTL and auto-refresh).

### 3. Local User ID Mapping

Keep existing integer `users.id` as primary key. Add `clerk_user_id TEXT UNIQUE` column. Middleware resolves Clerk ID → local user on each request. Foreign keys throughout the schema remain integer-based.

### 4. Webhook-Based User Sync

Clerk webhooks (via Svix) sync user creation/updates/deletion to local DB. On-demand fallback: if authenticated request arrives but webhook hasn't fired yet, fetch user from Clerk API and create locally.

## Database Changes

```sql
-- Add Clerk user ID to existing users table
ALTER TABLE users ADD COLUMN clerk_user_id TEXT UNIQUE;
CREATE INDEX idx_users_clerk_user_id ON users (clerk_user_id);

-- NO password_hash column needed (Clerk manages passwords)
-- NO refresh_tokens table needed (Clerk manages sessions)
```

## What Clerk Eliminates from Original Plan

| Original CONTEXT.md | With Clerk |
|---------------------|-----------|
| Argon2id password hashing | Not needed — Clerk handles passwords |
| JWT token generation (HS256) | Not needed — Clerk issues RS256 JWTs |
| Refresh token table + rotation | Not needed — Clerk manages sessions |
| Custom login/register mutations | Not needed — Clerk UI components |
| go-chi/jwtauth middleware | Replaced by clerk-sdk-go middleware |
| Frontend auth state (custom runes) | Use svelte-clerk reactive state |
| Password reset flow | Not needed — Clerk handles it |
| Email verification | Not needed — Clerk handles it |

## Environment Variables

```bash
# Backend (Go)
CLERK_SECRET_KEY=sk_live_xxx              # Clerk Backend API secret
CLERK_WEBHOOK_SIGNING_SECRET=whsec_xxx    # From Clerk Dashboard > Webhooks

# Frontend (SvelteKit)
VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxx    # Public key only
```

## Impact on Phase 9 (Security Hardening)

Phase 9 has 6 plans for custom JWT auth. With Clerk:

| Phase 9 Plan | Current Purpose | Impact |
|-------------|----------------|--------|
| 09-01 | JWT auth infrastructure (custom) | **SUPERSEDED** — Clerk SDK replaces custom JWT |
| 09-02 | Authorization (@owner directive) | **KEEP** — Ownership checks still needed, wire to Clerk context |
| 09-03 | Rate limiting, query complexity, CORS | **KEEP** — All still needed. Update CORS for `Authorization` header |
| 09-04 | Security headers (HSTS, CSP) | **KEEP** — Independent of auth provider |
| 09-05 | Error sanitization | **KEEP** — Still need to protect API keys in logs |
| 09-06 | Secrets management docs | **UPDATE** — Document Clerk secrets instead of JWT secrets |

**Net effect:** Phase 9 Plan 01 is replaced by Phase 12 Clerk integration. Plans 02-05 remain valid. Plan 06 needs minor updates.

## Dependencies

- Phase 8.1 (clean schema + architecture required before layering auth)
- Phase 9 Plans 03-05 can execute in parallel with Phase 12

## Risks

- **svelte-clerk SPA compatibility** — Community SDK, not official. SPA mode not explicitly documented. Mitigation: test early, fall back to `@clerk/clerk-js` vanilla if needed.
- **Vendor lock-in** — Users stored in Clerk infrastructure. Mitigation: local user table with all critical data; Clerk ID is just a link column.
- **Webhook race condition** — User authenticates before webhook fires. Mitigation: on-demand user creation fallback.
- **CORS update** — Must add `Authorization` to allowed headers. Currently only allows `Content-Type`.

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Auth mechanism | User dropdown | Clerk JWT tokens |
| Password storage | N/A | Clerk-managed |
| Token verification | None | clerk-sdk-go middleware |
| Mutation protection | None | All mutations require auth |
| Cache scoping | None | User ID prefix in query keys |
| Login UI | Dropdown selector | Clerk SignIn/UserButton |

## Open Questions

1. **Clerk appearance customization** — How well do Clerk's pre-built UI components match Perspectize's navy theme and Geist/Charter typography? Test with `appearance.variables`.
2. **Sevalla SPA fallback** — Need to configure `index.html` fallback for client-side routing.
3. **Existing user migration** — 3 users exist. Sentinel users (`[deleted]`, `[system]`) should remain local-only. Real users get Clerk accounts via Backend API.
4. **GraphQL Playground** — Auth middleware is permissive (allows unauthenticated through). Playground works for public queries. For mutations in dev, use Clerk dev tokens.

---

*Context updated: 2026-02-16 — Rewritten to favor Clerk integration over custom JWT*
*Previous approach (custom JWT) preserved in git history and v1.1-research/AUTH-ARCHITECTURE.md*
