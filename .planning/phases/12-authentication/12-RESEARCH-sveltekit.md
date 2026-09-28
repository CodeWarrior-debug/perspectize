# Phase 12 Research: Clerk + SvelteKit Integration

**Research date:** 2026-02-16
**Confidence:** MEDIUM (community SDK, no official Clerk SvelteKit support)
**Valid until:** 2026-03-16

## TL;DR

Use `svelte-clerk` v0.20.5 (community SDK by wobsoriano) for Clerk integration with SvelteKit. The main challenge is adapter-static compatibility — skip `hooks.server.ts` entirely, use `ClerkProvider` client-side only, and verify tokens on the Go backend. Clerk eliminates the entire custom auth backend.

## SDK Landscape

### svelte-clerk (RECOMMENDED)

- **Package:** `svelte-clerk@0.20.5` (npm)
- **Author:** wobsoriano (community)
- **GitHub:** 224+ stars, actively maintained
- **Last published:** 2026-02-04
- **Svelte 5 support:** Yes — uses runes, `$props()`, snippets
- **Peer deps:** `svelte ^5.29.0`, `@sveltejs/kit ^2.20.0`
- **Perspectize compat:** YES — our `svelte ^5.51.2` and `@sveltejs/kit ^2.50.1` satisfy peers

### clerk-sveltekit (DEPRECATED)

- **Author:** markjaquith
- **Status:** Archived August 2025
- **Do not use.** Author recommends `svelte-clerk`.

### @clerk/clerk-js (Fallback)

- **Package:** `@clerk/clerk-js@5.123.0` (npm)
- **Author:** Clerk (official)
- **Use case:** Vanilla JS, framework-agnostic
- **When to use:** If svelte-clerk has SPA mode issues, fall back to this with manual Svelte wrappers

## Architecture: SPA / adapter-static Compatibility

### The Challenge

svelte-clerk's quickstart assumes SSR with `hooks.server.ts` and `CLERK_SECRET_KEY`. This is **incompatible with adapter-static**.

### The Solution

Skip `hooks.server.ts` entirely. Use ClerkProvider client-side only with `VITE_CLERK_PUBLISHABLE_KEY`. All token verification happens on the Go backend.

```
┌──────────────────────────────────────────────────┐
│ SvelteKit (adapter-static, SPA mode)              │
│                                                    │
│  ClerkProvider (publishable key only)              │
│  ├── ClerkLoading → spinner                       │
│  ├── ClerkLoaded → app content                    │
│  │   ├── SignedIn → authenticated UI              │
│  │   ├── SignedOut → sign-in prompt               │
│  │   └── getToken() → Bearer header to Go API     │
│  └── No hooks.server.ts, no CLERK_SECRET_KEY      │
│                                                    │
└────────────────────┬─────────────────────────────┘
                     │ Authorization: Bearer <token>
                     ▼
┌──────────────────────────────────────────────────┐
│ Go Backend (chi + clerk-sdk-go/v2)                │
│                                                    │
│  WithHeaderAuthorization() middleware              │
│  ├── Verifies JWT signature (RS256, JWKS)         │
│  ├── Extracts SessionClaims                       │
│  └── claims.Subject = Clerk user ID               │
│                                                    │
└──────────────────────────────────────────────────┘
```

### Required Config Changes

| Setting | Current | After Clerk | Why |
|---------|---------|-------------|-----|
| `+layout.ts` prerender | `true` | `false` | Auth pages can't prerender |
| `+layout.ts` ssr | (not set) | `false` | No server-side rendering in static mode |
| `svelte.config.js` fallback | `'404.html'` | `'index.html'` | SPA routing needs catch-all fallback |
| `svelte.config.js` strict | `true` | `false` | Allow non-prerendered routes |
| CORS headers | `Content-Type` only | `Content-Type, Authorization` | Bearer token in requests |

### What We Lose Without SSR

- No server-side route protection (acceptable — API protects data)
- Brief flash of unauthenticated content before Clerk loads (mitigated with `ClerkLoading`)
- No server-side user data in `load()` functions (use client-side queries instead)

## Integration Patterns

### Pattern 1: ClerkProvider Layout (adapter-static)

**When to use:** Always — this is the only pattern for adapter-static

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { ClerkProvider } from 'svelte-clerk';
  import Header from '$lib/components/Header.svelte';

  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  // NOTE: No buildClerkProps, no server data — pure client-side
</script>

<ClerkProvider {publishableKey}>
  <Header />
  <slot />
</ClerkProvider>
```

**Environment variable:**
```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
# NO CLERK_SECRET_KEY in frontend — that goes in Go backend only
```

### Pattern 2: Token Forwarding to GraphQL

**What:** Get Clerk session token and pass as Bearer header
**When to use:** Every GraphQL request to the backend

```typescript
// src/lib/queries/client.ts
import { GraphQLClient } from 'graphql-request';

const GRAPHQL_ENDPOINT = import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:8080/graphql';

export const graphqlClient = new GraphQLClient(GRAPHQL_ENDPOINT);

export async function getAuthToken(): Promise<string | null> {
  try {
    const token = await window.Clerk?.session?.getToken();
    return token ?? null;
  } catch {
    return null;
  }
}

export async function graphqlRequest<T>(
  document: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return graphqlClient.request<T>(document, variables, headers);
}
```

**Important:** `getToken()` caches tokens in memory with 1-minute TTL. It only makes a network request when the cached token expires. This is built into ClerkJS.

### Pattern 3: Protected Routes (Client-Side)

```svelte
<!-- src/routes/some-protected-page/+page.svelte -->
<script lang="ts">
  import { SignedIn, SignedOut, RedirectToSignIn } from 'svelte-clerk';
</script>

<SignedIn>
  <!-- Protected content here -->
  <h1>Dashboard</h1>
</SignedIn>

<SignedOut>
  <RedirectToSignIn />
</SignedOut>
```

### Pattern 4: Header with UserButton

```svelte
<!-- src/lib/components/Header.svelte -->
<script lang="ts">
  import { SignedIn, SignedOut, SignInButton, UserButton } from 'svelte-clerk';
</script>

<header>
  <div class="flex items-center gap-4">
    <h1>Perspectize</h1>
    <SignedIn>
      <UserButton />
    </SignedIn>
    <SignedOut>
      <SignInButton mode="modal">
        <button class="btn btn-primary">Sign In</button>
      </SignInButton>
    </SignedOut>
  </div>
</header>
```

### Pattern 5: TanStack Query Integration

```typescript
import { createQuery } from '@tanstack/svelte-query';

function useContentQuery(userId: string | null) {
  return createQuery({
    queryKey: ['content', userId],  // Cache scoped per user
    queryFn: () => graphqlRequest(CONTENT_QUERY),
    enabled: !!userId,
  });
}

// On sign-out: queryClient.clear() to wipe entire cache
```

### Pattern 6: Layout Config for SPA Mode

```typescript
// src/routes/+layout.ts
export const prerender = false;  // Auth pages can't prerender
export const ssr = false;        // No SSR in static mode
export const csr = true;
```

```javascript
// svelte.config.js
adapter: adapter({
  pages: 'build',
  assets: 'build',
  fallback: 'index.html',  // Changed from '404.html' for SPA routing
  strict: false
})
```

## What Clerk Eliminates

| Old Approach (CONTEXT.md) | With Clerk | Impact |
|---------------------------|-----------|--------|
| Custom JWT signing (HS256) | Clerk issues JWTs (RS256) | No jwt secret management in app |
| Argon2id password hashing | Clerk stores passwords | No password_hash column |
| Refresh tokens table | Clerk manages sessions | No refresh_tokens migration |
| Login/register mutations | Clerk UI components | No auth resolvers |
| Password reset flow | Clerk handles it | No email sending |
| Email verification | Clerk handles it | No verification tokens |
| Session management | ClerkJS auto-refresh | No custom token rotation |

## Anti-Patterns to Avoid

- **Using hooks.server.ts with adapter-static:** Will not work. Server hooks don't run in static builds.
- **Storing Clerk secret key in frontend:** Only `VITE_CLERK_PUBLISHABLE_KEY` goes to frontend. `CLERK_SECRET_KEY` is backend-only.
- **Using localStorage for tokens:** Clerk manages token storage internally.
- **Calling getToken() before Clerk loads:** Use `ClerkLoaded` component to gate UI.
- **Building custom JWT verification:** Use `clerk-sdk-go/v2` middleware on Go backend.

## Common Pitfalls

### Pitfall 1: adapter-static + hooks.server.ts

**Problem:** Following svelte-clerk quickstart adds `hooks.server.ts`. Build fails or hooks silently ignored.
**Solution:** Skip hooks.server.ts entirely. Use ClerkProvider with publishable key only.

### Pitfall 2: CORS Not Allowing Authorization Header

**Problem:** Current Go CORS middleware only allows `Content-Type` header. Bearer tokens rejected.
**Solution:** Add `Authorization` to `Access-Control-Allow-Headers` in Go CORS middleware.

### Pitfall 3: getToken() Called Before Clerk Loads

**Problem:** `window.Clerk?.session?.getToken()` returns undefined.
**Solution:** Use `ClerkLoaded` component to gate UI. Check `Clerk.loaded` before API calls.

### Pitfall 4: TanStack Query Cache Leaks Between Users

**Problem:** User signs out but cached data still visible. Or different user sees stale data.
**Solution:** Call `queryClient.clear()` on sign-out. Include `userId` in all query keys.

### Pitfall 5: SPA Fallback Page on Sevalla

**Problem:** Direct navigation to `/sign-in` returns 404 on static hosting.
**Solution:** Change fallback to `index.html`. Configure Sevalla SPA fallback routing.

### Pitfall 6: prerender Incompatibility

**Problem:** Pages with Clerk components fail during prerender (no `window` object).
**Solution:** Set `prerender = false` in root layout. App becomes pure SPA.

## Clerk Pricing

### Free Tier (Sufficient for MVP)

| Feature | Limit |
|---------|-------|
| Monthly Retained Users (MRU) | 50,000 free |
| Dashboard seats | 3 |
| Social connections | Up to 3 |
| Session lifetime | Fixed 7 days |
| MFA | Not included (Pro) |
| Branding | Clerk branding shown |

### Pro Plan — $25/month

| Feature | Detail |
|---------|--------|
| MRU included | 50,000 |
| Overage | $0.02/MRU beyond 50,000 |
| MFA, Passkeys | Included |
| Remove branding | Included |

## Open Questions

1. **svelte-clerk SPA mode completeness** — Does everything work without `hooks.server.ts`? Some features like `buildClerkProps` and `event.locals.auth()` are server-only. Need to test early.
2. **Clerk appearance + shadcn-svelte** — How well does Clerk's pre-built UI integrate with Perspectize's navy theme and Geist/Charter typography?
3. **Svelte 5 runes API surface** — Are `$auth` and `$user` stores or rune-based? Need verification after install.
4. **Sevalla SPA fallback configuration** — Exact config for SPA routing with `index.html` fallback.
5. **Clerk user ID in GraphQL** — Clerk uses string IDs (`user_2NKxxxxxxxxx`). Keep internal integer IDs, map via `clerk_user_id TEXT UNIQUE` column.

## Sources

### Primary (HIGH confidence)
- npm registry: `svelte-clerk@0.20.5` — version, dependencies, peer deps verified
- npm registry: `@clerk/clerk-js@5.123.0` — version verified
- [Clerk Go SDK v2](https://pkg.go.dev/github.com/clerk/clerk-sdk-go/v2) — v2.5.1
- [Clerk JavaScript SDK Reference](https://clerk.com/docs/reference/javascript/overview)
- [Clerk Making Authenticated Requests](https://clerk.com/docs/guides/development/making-requests)
- [Clerk Pricing](https://clerk.com/pricing)

### Secondary (MEDIUM confidence)
- [svelte-clerk GitHub](https://github.com/wobsoriano/svelte-clerk) — Svelte 5 support, actively maintained
- [Clerk SPA Mode (Remix)](https://clerk.com/docs/guides/development/spa-mode) — patterns applicable to SvelteKit

### Tertiary (LOW confidence)
- svelte-clerk SPA/adapter-static compatibility — inferred, not officially documented
- Clerk appearance + shadcn-svelte — not tested, based on general Clerk docs
