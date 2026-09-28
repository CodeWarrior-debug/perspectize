# Phase 9 Impact Assessment: Clerk Authentication

**Date:** 2026-02-16
**Context:** Phase 12 adopts Clerk instead of custom JWT. This document assesses how each Phase 9 plan is affected.

## Summary

Phase 9 has 6 plans. With Clerk adoption:
- **1 plan superseded** (09-01 custom JWT infrastructure)
- **4 plans remain valid** (09-02 through 09-05, with minor adjustments)
- **1 plan needs update** (09-06 secrets documentation)

## Detailed Impact

### 09-01: JWT Auth Infrastructure — SUPERSEDED

**Current scope:** Install golang-jwt/jwt v5, create AuthService, auth middleware, GraphQL directives, wire to server.

**Impact:** **Fully replaced by Phase 12 Plan 01.** Clerk's `clerk-sdk-go/v2` provides:
- JWT verification middleware (`WithHeaderAuthorization`) replacing custom AuthService
- Session claims extraction replacing manual JWT parsing
- JWKS caching replacing manual key management

**Action required:** Mark 09-01 as superseded. Reference Phase 12 Plan 01 instead. The @auth directive and ForContext pattern from 09-01 are preserved in 12-04 with Clerk context.

**What Phase 12 Plan 01 covers that 09-01 would have:**
- [x] JWT verification (via Clerk SDK, not custom)
- [x] Auth middleware with context injection
- [x] Secret key loading (CLERK_SECRET_KEY instead of JWT_SECRET)
- [x] Server wiring

**What Phase 12 Plan 01 does NOT cover from 09-01:**
- [ ] GraphQL directives — moved to Phase 12 Plan 04
- [ ] @auth on mutations — moved to Phase 12 Plan 04

---

### 09-02: Authorization (Email Visibility, Ownership) — KEEP, ADJUST

**Current scope:** Email visibility check, @owner directive with ownership checks, wire services to directives.

**Impact:** **Remains valid.** Ownership checks are independent of the auth provider. The only change is the source of the authenticated user:
- Before: `middleware.ForContext(ctx)` from custom JWT middleware
- After: `auth.ForContext(ctx)` from Clerk middleware

**Action required:**
1. Update 09-02 to depend on Phase 12 Plan 01 instead of 09-01
2. Change import from custom auth middleware to `adapters/auth`
3. The ForContext pattern and return type are the same

**Note:** Phase 12 Plan 04 already implements the @auth directive and basic ownership checks. Plan 09-02's @owner directive adds a more sophisticated approach. Evaluate if both are needed or if 12-04's inline ownership checks are sufficient.

---

### 09-03: API Protection (Rate Limiting, CORS, Complexity) — KEEP, MINOR UPDATE

**Current scope:** Rate limiting (httprate), query complexity, CORS restriction, introspection disable, Content-Type validation.

**Impact:** **Remains valid.** These protections are independent of the auth provider.

**Minor updates needed:**
1. **CORS:** Phase 12 Plan 01 already adds `Authorization` to allowed headers. Plan 09-03 should verify this is in place rather than re-adding it.
2. **Rate limiting dependency:** 09-03 depends on 09-01 only for the security config structure. With Clerk, the config structure changes (ClerkSecretKey instead of JWTSecret), but rate limiting config is unaffected.

**Action required:** Update 09-03's `depends_on` to reference Phase 12 Plan 01 instead of 09-01.

---

### 09-04: Security Headers (HSTS, CSP, Secure) — KEEP, NO CHANGES

**Current scope:** unrolled/secure middleware, enhanced CSP, HTTPS verification.

**Impact:** **No changes needed.** Security headers are completely independent of the auth provider.

---

### 09-05: Error Sanitization — KEEP, NO CHANGES

**Current scope:** YouTube API key removal from logs and GraphQL errors.

**Impact:** **No changes needed.** API key sanitization is independent of the auth provider. Additionally, Clerk's secret key should also be treated as sensitive and never logged.

---

### 09-06: Secrets Management Documentation — UPDATE

**Current scope:** Create SECURITY.md documenting JWT_SECRET generation, rotation, and Sevalla practices.

**Impact:** **Needs content updates** to document Clerk secrets instead of custom JWT secrets:

**Changes:**
| Original 09-06 Content | Updated for Clerk |
|------------------------|-------------------|
| JWT_SECRET generation (openssl) | CLERK_SECRET_KEY (from Clerk Dashboard) |
| JWT secret rotation procedure | Clerk key rotation (regenerate in dashboard) |
| ACCESS_TOKEN_MINUTES config | Not needed (Clerk manages token lifetime) |
| Argon2id password hashing docs | Not needed (Clerk manages passwords) |

**New content to add:**
- CLERK_SECRET_KEY management (Clerk Dashboard → API Keys)
- CLERK_WEBHOOK_SIGNING_SECRET management
- VITE_CLERK_PUBLISHABLE_KEY (public, not sensitive)
- Clerk instance rotation procedure (if compromised)

---

## Execution Order Recommendation

With Clerk replacing 09-01, the recommended execution order is:

1. **Phase 12 Plans 01-02 (Wave 1):** Backend Clerk middleware + Frontend svelte-clerk
2. **Phase 12 Plans 03-04 (Wave 2):** Webhooks + Authorization directives
3. **Phase 9 Plans 03-04 (Wave 2, parallel with Phase 12):** Rate limiting + Security headers
4. **Phase 12 Plan 05 (Wave 3):** Integration testing
5. **Phase 9 Plans 05-06 (Wave 3):** Error sanitization + Updated secrets docs

Phase 9 Plan 02 can be deferred or merged with Phase 12 Plan 04, since Plan 04 already implements basic ownership checks.

## ROADMAP.md Updates Needed

The Phase 9 section in ROADMAP.md should be updated to reflect:

```markdown
### Phase 9: Security Hardening
**Plans**: 6 plans in 3 waves → 5 plans (09-01 superseded by Phase 12)

Plans:
- [ ] ~~09-01-PLAN.md — JWT auth infrastructure~~ → **SUPERSEDED by Phase 12 Plan 01**
- [ ] 09-02-PLAN.md — Authorization (depends on Phase 12 Plan 01 instead of 09-01)
- [ ] 09-03-PLAN.md — API protection (depends on Phase 12 Plan 01 instead of 09-01)
- [ ] 09-04-PLAN.md — Security headers (unchanged)
- [ ] 09-05-PLAN.md — Error sanitization (unchanged)
- [ ] 09-06-PLAN.md — Secrets management (updated for Clerk)
```

The Phase 12 section should be added:

```markdown
### Phase 12: Authentication (Clerk)
**Goal**: Replace user dropdown with Clerk authentication, protect all mutations, sync users via webhooks
**Depends on**: Phase 8.1
**Plans**: 5 plans in 3 waves

Plans:
- [ ] 12-01-PLAN.md — Backend: Clerk SDK, auth middleware, clerk_user_id migration (Wave 1)
- [ ] 12-02-PLAN.md — Frontend: svelte-clerk, SPA mode, Bearer token forwarding (Wave 1)
- [ ] 12-03-PLAN.md — Backend: Clerk webhooks, user sync, on-demand creation (Wave 2)
- [ ] 12-04-PLAN.md — Backend: @auth directives, ownership checks, email visibility (Wave 2)
- [ ] 12-05-PLAN.md — Integration: E2E verification, user migration, polish (Wave 3)
```
