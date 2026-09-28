# Phase 9: Security Hardening - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Add authentication (Clerk), authorization, rate limiting, and security headers to make the app safe for multi-user deployment. The auth provider is Clerk, integrated with the existing SvelteKit + TanStack Query frontend and Go GraphQL backend.

</domain>

<decisions>
## Implementation Decisions

### Auth Provider & Session Handling
- **Clerk** as the auth provider — `@clerk/clerk-js` (vanilla JS SDK) on the SvelteKit frontend
- **JWT validation in Go** — backend validates Clerk-issued JWTs against Clerk's JWKS endpoint. No Clerk Go SDK. Stateless, no vendor coupling on backend
- **Global fetch wrapper** on the GraphQL client injects `Authorization: Bearer <jwt>` header. Uses `clerk.session.getToken()` which is cached internally by Clerk (no custom token caching needed)
- **TanStack Query** continues as-is for data fetching — auth tokens flow through the global fetch wrapper transparently
- **Email + password + Google OAuth** as sign-in methods (configurable later in Clerk dashboard without code changes)

### User Identity Mapping
- **Clerk as source of truth** for user identity — add `clerk_id` column to users table (nullable)
- **Drop email column** from users table — Clerk owns email data, accessible via Clerk dashboard for admin purposes
- **Auto-create user on first login** — when a JWT arrives with an unknown `clerk_id`, create a new user record
- **Manual linking** for existing users — after existing users sign up via Clerk, manually update `clerk_id` in the DB to preserve their content/perspective associations
- **Sentinel users exempt** — `[deleted]` and `[system]` sentinel users keep `clerk_id = NULL`, never authenticate, never appear in Clerk. Their operations happen at the service layer, not through GraphQL mutations
- **Dev-mode bypass** — keep a user switcher for local development without requiring Clerk accounts. Clerk UI for production only

### Protected vs Public Routes
- **Public browsing, auth for mutations** — anonymous users can view all content and perspectives. Login required to create/edit
- **Disabled UI for anon actions** — protected actions (add perspective, add content, etc.) are disabled for unauthenticated users with messaging like "Login to do X". No redirect or modal triggered by clicking disabled actions
- **Middleware blocks all mutations without JWT** — single blanket rule at the middleware level. No per-resolver auth checks needed
- **Queries pass through unauthenticated** — all GraphQL queries are public

### Frontend Auth UI
- **Header account menu** — Clerk sign-in opens as a modal from the header, not a dedicated /login page
- **Clerk UserButton** replaces the current user dropdown selector — shows avatar, account settings, sign out
- Post-login: header shows Clerk UserButton with avatar/dropdown

### Claude's Discretion
- JWT validation library choice for Go (e.g., `golang-jwt/jwt` or `lestrrat-go/jwx`)
- JWKS caching strategy and refresh interval
- Dev-mode bypass implementation details (env flag, mock user, etc.)
- TanStack Query key scoping with user ID
- `queryClient.clear()` on logout to prevent data leakage
- Rate limiting, security headers, CSRF, query complexity implementation details (roadmap success criteria 3-15)

</decisions>

<specifics>
## Specific Ideas

- Clerk's `getToken()` is cached internally — do not add a custom caching layer
- The existing GraphQL client has empty `headers: {}` — the global fetch wrapper replaces this
- Users table migration: add `clerk_id` (nullable), drop `email`, preserve all FK relationships
- Sentinel users (`[deleted]`, `[system]`) have `role = 'sentinel'` — use this to exclude from auth flows

</specifics>

<deferred>
## Deferred Ideas

- **Anonymous submissions** — authenticated users submitting content without attribution (e.g., `[anonymous]` sentinel or `is_anonymous` flag). Architecture should not block this, but implementation deferred to a future phase
- **Clerk webhooks** for user sync (user.created, user.updated, user.deleted) — keep it simple with login-time sync for now
- **Additional OAuth providers** (GitHub, Apple, etc.) — can be added from Clerk dashboard later without code changes

</deferred>

---

*Phase: 09-security-hardening*
*Context gathered: 2026-03-02*
