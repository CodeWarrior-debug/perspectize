# Phase 12: Authentication — Synthesized Research

**Researched:** 2026-02-16
**Confidence:** HIGH (Go backend), MEDIUM (SvelteKit SPA mode)

## Decision: Clerk

After evaluating 8 auth providers against Perspectize's architecture constraints (SvelteKit adapter-static, Go chi backend, Sevalla hosting), **Clerk is the recommended provider**.

**Key constraint:** `adapter-static` eliminates any provider requiring `hooks.server.ts` (Supabase Auth, Logto).

See individual research documents for full analysis:
- `12-RESEARCH-sveltekit.md` — svelte-clerk SDK, SPA patterns, token forwarding
- `12-RESEARCH-go-backend.md` — clerk-sdk-go v2, webhook sync, user mapping
- `12-RESEARCH-provider-comparison.md` — 8 providers evaluated

## Technology Stack

| Component | Library | Version | Purpose |
|-----------|---------|---------|---------|
| Go middleware | `github.com/clerk/clerk-sdk-go/v2` | v2.5.1 | JWT verification, session claims |
| Webhook verification | `github.com/svix/svix-webhooks/go` | latest | HMAC-SHA256 signature verification |
| SvelteKit SDK | `svelte-clerk` | v0.20.5 | Clerk components, auth state |
| Fallback JS SDK | `@clerk/clerk-js` | v5.123.0 | If svelte-clerk SPA issues arise |

## Architecture Summary

### Auth Flow

```
1. User clicks "Sign In" → Clerk modal/page opens
2. Clerk handles login (email/password, social, passkeys)
3. Clerk returns session token to ClerkJS (60-second TTL)
4. Frontend calls getToken() before each GraphQL request
5. Frontend sends Authorization: Bearer <token> header
6. Go middleware (WithHeaderAuthorization) verifies JWT via JWKS
7. Custom middleware resolves Clerk user ID → local DB user
8. Resolver accesses local user via auth.ForContext(ctx)
```

### User Sync Flow

```
1. User signs up via Clerk frontend
2. Clerk fires user.created webhook to /webhooks/clerk
3. Go handler verifies Svix signature
4. Handler creates local user with clerk_user_id mapping
5. (Fallback) If webhook hasn't fired, create on-demand from Clerk API
```

### Frontend Changes

| Change | Before | After |
|--------|--------|-------|
| Layout prerender | `true` | `false` |
| Layout ssr | (not set) | `false` |
| Config fallback | `404.html` | `index.html` |
| User selector | Dropdown component | Clerk `<UserButton>` |
| GraphQL client | No auth headers | `Authorization: Bearer <token>` |
| Query keys | No user scope | Include userId prefix |

### Backend Changes

| Change | Before | After |
|--------|--------|-------|
| Auth middleware | None | `clerkhttp.WithHeaderAuthorization()` + local user resolver |
| CORS headers | `Content-Type` only | `Content-Type, Authorization` |
| Users table | No clerk column | `clerk_user_id TEXT UNIQUE` |
| Webhook endpoint | None | `POST /webhooks/clerk` |
| User repository | No GetByClerkID | New `GetByClerkID(ctx, clerkID)` method |

## Critical Pitfalls

1. **CORS must allow Authorization header** — Current middleware only allows `Content-Type`
2. **No hooks.server.ts** — Skip svelte-clerk's SSR quickstart entirely
3. **Email not in default JWT** — Use webhook sync for email, don't expect it in claims
4. **60-second token lifetime** — ClerkJS handles refresh automatically; don't cache tokens yourself
5. **Webhook race condition** — Implement on-demand user creation as fallback
6. **Keep integer IDs** — Don't replace existing FK structure with Clerk string IDs

## Phase 9 Impact

Phase 9 Plan 01 (custom JWT infrastructure) is **fully superseded** by Clerk. Plans 02-06 remain valid with minor adjustments (wire to Clerk context instead of custom JWT context).

## Confidence Assessment

| Area | Level | Notes |
|------|-------|-------|
| Go SDK integration | HIGH | Official SDK, verified patterns |
| SvelteKit SPA mode | MEDIUM | Community SDK, inferred SPA support |
| User sync webhooks | MEDIUM-HIGH | Documented pattern, Go examples sparse |
| Pricing | HIGH | Verified on clerk.com |
| Existing user migration | MEDIUM | API supports it, exact workflow TBD |
