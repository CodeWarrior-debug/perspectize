# Authentication Architecture Research

**Project:** Perspectize v1.1
**Domain:** SvelteKit (static adapter) + Go GraphQL API
**Researched:** 2026-02-16
**Overall Confidence:** HIGH

---

## 1. Executive Summary

### Recommended Approach

**Hybrid authentication using JWT access tokens (short-lived, in-memory) + refresh tokens (long-lived, httpOnly cookies) with email/password and Google OAuth2.**

**Key Architecture:**
- **Backend (Go):** Chi middleware validates JWT → injects user into context → gqlgen resolvers check context
- **Frontend (SvelteKit static):** Client-side auth state (Svelte 5 runes) → httpOnly cookies for refresh tokens → memory for access tokens → TanStack Query cache scoped by user ID
- **Token Flow:** Login returns both tokens → access token in memory (expires in 15 min) → refresh token in httpOnly cookie (expires in 7 days) → token rotation on refresh
- **Security:** Argon2id password hashing, CSRF protection via custom headers, per-user cache invalidation on logout

**Why this approach:**
1. **Static adapter limitation:** SvelteKit static sites have no server-side hooks, requiring client-side auth with API backend
2. **Security best practice (2026):** HttpOnly cookies for refresh tokens prevent XSS attacks; in-memory access tokens prevent both XSS and CSRF
3. **GraphQL compatibility:** JWT in Authorization header is GraphQL-standard; middleware injects user into context for resolver-level checks
4. **Existing stack fit:** Chi middleware + gqlgen context pattern integrates seamlessly with current hexagonal architecture

---

## 2. Authentication Options Comparison

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **JWT (Access + Refresh)** | GraphQL standard, stateless, client-side friendly, supports static frontend | Requires token storage strategy, refresh token rotation complexity | ✅ **RECOMMENDED** |
| **Session Cookies (Server-Side Sessions)** | Most secure (server-controlled), simple client code, no token rotation | Requires session store (Redis/DB), not compatible with SvelteKit static adapter (needs server hooks), stateful | ❌ Not compatible with static deployment |
| **OAuth2 Only (Google/GitHub)** | No password management, social login UX, reduces attack surface | Requires OAuth provider, no local accounts, user dependency on third party | ⚠️ Supplement (not primary) |

### Token Storage Options

| Storage Method | Security | SvelteKit Static Compatible | Verdict |
|----------------|----------|----------------------------|---------|
| **httpOnly cookies (refresh)** | High (XSS-immune, CSRF with SameSite) | ✅ Yes | ✅ **Use for refresh tokens** |
| **Memory/Svelte state (access)** | Highest (no persistence, short-lived) | ✅ Yes | ✅ **Use for access tokens** |
| **localStorage/sessionStorage** | Low (XSS vulnerable) | ✅ Yes | ❌ Never use |

**Security Evidence (2026):**
- OWASP recommends cookies over localStorage for sensitive tokens
- httpOnly cookies with SameSite=Strict mitigate both XSS and CSRF
- Hybrid approach (memory + httpOnly) is 2026 best practice for SPAs

---

## 3. Recommended Implementation

### 3.1 Token Strategy

**Two-Token System:**

| Token Type | Purpose | Lifetime | Storage | Transmitted Via |
|------------|---------|----------|---------|-----------------|
| **Access Token** | Authenticate GraphQL requests | 15 minutes | Memory (Svelte $state) | Authorization header |
| **Refresh Token** | Issue new access tokens | 7 days | httpOnly cookie | Cookie (automatic) |

**Token Rotation:**
- On login: Issue both tokens
- On access token expiry: Frontend calls `/refresh` with httpOnly cookie → backend validates, revokes old refresh token, issues new pair
- On logout: Revoke refresh token (blacklist or DB flag), clear client state

**Why 15 min / 7 days:**
- 15 min access: Limits window for stolen token abuse
- 7 days refresh: Balances security (weekly re-auth) with UX (no daily logins)

### 3.2 User Model Extensions

**Current User model (from domain/user.go):**
```go
type User struct {
	ID        int
	Username  string
	Email     string       // Currently optional, make REQUIRED for auth
	Role      UserRole     // ADMIN, SENTINEL, DEFAULT
	Active    bool
	CreatedAt time.Time
	UpdatedAt time.Time
}
```

**Required additions:**

```go
type User struct {
	// ... existing fields ...
	PasswordHash  string     // Argon2id hash
	EmailVerified bool       // Track email verification
	LastLoginAt   *time.Time // Audit trail

	// OAuth fields (nullable for local accounts)
	GoogleID      *string    // Google OAuth sub claim
	OAuthProvider *string    // "google", "github", etc.
}
```

**New domain entity:**

```go
type RefreshToken struct {
	ID           int
	UserID       int
	TokenHash    string     // SHA-256 hash of token
	ExpiresAt    time.Time
	RevokedAt    *time.Time // NULL = active, set on logout/refresh
	LastUsedAt   time.Time
	UserAgent    string     // For device tracking
	CreatedAt    time.Time
}
```

### 3.3 Database Schema

**Migration: `000009_add_authentication.up.sql`**

```sql
-- Add auth fields to users table
ALTER TABLE users
  ADD COLUMN password_hash TEXT,
  ADD COLUMN email_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN last_login_at TIMESTAMPTZ,
  ADD COLUMN google_id TEXT UNIQUE,
  ADD COLUMN oauth_provider TEXT;

-- Make email NOT NULL (was optional)
UPDATE users SET email = username || '@example.com' WHERE email IS NULL;
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
CREATE UNIQUE INDEX idx_users_email ON users(email);

-- Create refresh_tokens table
CREATE TABLE refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at)
  WHERE revoked_at IS NULL;
```

**Down migration:** Drop columns, drop table.

---

## 4. Go Backend Patterns

### 4.1 Stack Additions

| Package | Version | Purpose | Confidence |
|---------|---------|---------|------------|
| `github.com/golang-jwt/jwt/v5` | v5.2.1+ | JWT generation/validation | HIGH (13,419 imports, Jan 2026) |
| `golang.org/x/crypto/argon2` | Latest | Password hashing (Argon2id) | HIGH (2,231 imports, Feb 2026) |
| `github.com/go-chi/jwtauth/v5` | v5.3.2+ | Chi JWT middleware | HIGH (official Chi middleware) |
| `github.com/google/uuid` | v1.6.0+ | Token IDs | HIGH |
| `golang.org/x/oauth2/google` | Latest | Google OAuth2 | HIGH (13,212 imports, Jan 2026) |

**Installation:**

```bash
cd backend
go get github.com/golang-jwt/jwt/v5
go get golang.org/x/crypto/argon2
go get github.com/go-chi/jwtauth/v5
go get github.com/google/uuid
go get golang.org/x/oauth2/google
```

### 4.2 Password Hashing (Argon2id)

**Why Argon2id over bcrypt:**
- **OWASP 2026 recommendation:** Argon2id is the current standard
- **Memory-hard:** Resists GPU/ASIC attacks better than bcrypt (128 MiB vs 4 KB)
- **Hybrid mode:** Argon2id combines data-dependent (GPU-resistant) and data-independent (side-channel resistant) passes
- **bcrypt still acceptable:** Work factor 13-14 is secure, but Argon2id is preferred for new projects

**Implementation (backend/pkg/crypto/password.go):**

```go
package crypto

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// Argon2id params (OWASP 2026 recommendations)
const (
	memory      = 128 * 1024  // 128 MiB
	iterations  = 3
	parallelism = 4
	saltLength  = 16
	keyLength   = 32
)

// HashPassword generates an Argon2id hash of the password
func HashPassword(password string) (string, error) {
	salt := make([]byte, saltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}

	hash := argon2.IDKey([]byte(password), salt, iterations, memory, parallelism, keyLength)

	// Encode as: $argon2id$v=19$m=128,t=3,p=4$<salt>$<hash>
	b64Salt := base64.RawStdEncoding.EncodeToString(salt)
	b64Hash := base64.RawStdEncoding.EncodeToString(hash)

	encodedHash := fmt.Sprintf("$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s",
		memory, iterations, parallelism, b64Salt, b64Hash)

	return encodedHash, nil
}

// VerifyPassword checks if password matches the hash
func VerifyPassword(password, encodedHash string) (bool, error) {
	// Parse encoded hash
	parts := strings.Split(encodedHash, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false, fmt.Errorf("invalid hash format")
	}

	var memory, iterations uint32
	var parallelism uint8
	_, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &iterations, &parallelism)
	if err != nil {
		return false, err
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, err
	}

	expectedHash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false, err
	}

	// Compute hash with same params
	hash := argon2.IDKey([]byte(password), salt, iterations, memory, parallelism, uint32(len(expectedHash)))

	// Constant-time comparison
	return subtle.ConstantTimeCompare(hash, expectedHash) == 1, nil
}
```

**Tests:** `backend/pkg/crypto/password_test.go` should verify hashing, verification, rejection of wrong passwords, and handling of invalid hashes.

### 4.3 JWT Generation and Validation

**Implementation (backend/pkg/auth/jwt.go):**

```go
package auth

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type Claims struct {
	UserID   int    `json:"user_id"`
	Email    string `json:"email"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

// Config should be loaded from env
var (
	JWTSecret         = []byte("your-secret-key")  // Load from env: JWT_SECRET
	AccessTokenExpiry = 15 * time.Minute
	RefreshTokenExpiry = 7 * 24 * time.Hour
)

// GenerateAccessToken creates a short-lived JWT
func GenerateAccessToken(userID int, email, role string) (string, error) {
	claims := &Claims{
		UserID: userID,
		Email:  email,
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(AccessTokenExpiry)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
			ID:        uuid.New().String(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(JWTSecret)
}

// GenerateRefreshToken creates a cryptographically random token
func GenerateRefreshToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// ValidateAccessToken parses and validates a JWT
func ValidateAccessToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return JWTSecret, nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}

	return nil, fmt.Errorf("invalid token")
}
```

### 4.4 Authentication Middleware

**Pattern:** Chi middleware → validate JWT → inject user into context → gqlgen resolvers access via `auth.ForContext(ctx)`

**Implementation (backend/pkg/middleware/auth.go):**

```go
package middleware

import (
	"context"
	"log/slog"
	"net/http"
	"strings"

	"github.com/CodeWarrior-debug/perspectize/backend/pkg/auth"
)

type contextKey struct {
	name string
}

var userCtxKey = &contextKey{"user"}

type ContextUser struct {
	ID    int
	Email string
	Role  string
}

// AuthMiddleware validates JWT and injects user into context
func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Extract token from Authorization header
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			// No token = unauthenticated request (still allowed, resolvers check)
			next.ServeHTTP(w, r)
			return
		}

		// Expect "Bearer <token>"
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			slog.Warn("invalid authorization header format")
			next.ServeHTTP(w, r)
			return
		}

		token := parts[1]

		// Validate JWT
		claims, err := auth.ValidateAccessToken(token)
		if err != nil {
			slog.Warn("invalid JWT", "error", err)
			next.ServeHTTP(w, r)
			return
		}

		// Inject user into context
		user := &ContextUser{
			ID:    claims.UserID,
			Email: claims.Email,
			Role:  claims.Role,
		}
		ctx := context.WithValue(r.Context(), userCtxKey, user)
		r = r.WithContext(ctx)

		next.ServeHTTP(w, r)
	})
}

// ForContext retrieves user from context (for use in resolvers)
func ForContext(ctx context.Context) *ContextUser {
	user, _ := ctx.Value(userCtxKey).(*ContextUser)
	return user
}
```

**Wire in cmd/server/main.go:**

```go
// Add to middleware stack (AFTER RequestTimer, BEFORE GraphQL handler)
r.Use(middleware.AuthMiddleware)
```

### 4.5 GraphQL Resolver Authorization

**Pattern:** Check context in resolvers → return error if unauthorized

**Example (internal/adapters/graphql/resolvers/user.resolver.go):**

```go
func (r *mutationResolver) UpdateUser(ctx context.Context, input model.UpdateUserInput) (*model.User, error) {
	// Get authenticated user
	authUser := middleware.ForContext(ctx)
	if authUser == nil {
		return nil, fmt.Errorf("unauthorized: must be logged in")
	}

	// Check authorization: only admins or the user themselves can update
	if authUser.Role != "ADMIN" && authUser.ID != int(input.ID) {
		return nil, fmt.Errorf("forbidden: cannot update other users")
	}

	// Proceed with update...
	return r.userService.Update(ctx, input)
}
```

### 4.6 GraphQL Schema Additions

**New mutations and queries:**

```graphql
# Auth types
type AuthResponse {
  accessToken: String!
  refreshToken: String!
  user: User!
}

# Mutations
type Mutation {
  # Email/password registration
  register(email: String!, username: String!, password: String!): AuthResponse!

  # Email/password login
  login(email: String!, password: String!): AuthResponse!

  # Logout (revoke refresh token)
  logout: Boolean!

  # Refresh access token (uses httpOnly cookie)
  refresh: AuthResponse!

  # Google OAuth2
  loginWithGoogle(code: String!): AuthResponse!
}

# Queries
type Query {
  # Get current user (from JWT context)
  me: User
}
```

**Resolver implementation:**

- `register`: Hash password → create user → generate tokens → return
- `login`: Verify password → generate tokens → return
- `logout`: Revoke refresh token in DB → return success
- `refresh`: Validate refresh token cookie → rotate token → return new pair
- `loginWithGoogle`: Exchange OAuth code → verify with Google → create/find user → return tokens
- `me`: Return `middleware.ForContext(ctx)` user

---

## 5. SvelteKit Frontend Patterns

### 5.1 Static Adapter Limitations

**Key constraint:** SvelteKit `adapter-static` has no server-side hooks (`+page.server.ts`, `hooks.server.ts`), requiring **client-side authentication only**.

**Implications:**
- No server-side session validation
- No SSR-protected pages
- All auth logic runs in browser
- Backend API handles all auth validation

**Sources:**
- [SvelteKit Static Adapter Docs](https://svelte.dev/docs/kit/adapter-static)
- [GitHub Discussion: Auth with adapter-static](https://github.com/supabase/supabase-js/issues/882)

### 5.2 Auth State Management (Svelte 5 Runes)

**Pattern:** Svelte 5 `$state` rune for reactive auth state + Svelte stores for cross-component reactivity

**Implementation (frontend/src/lib/auth/auth.svelte.ts):**

```typescript
import { browser } from '$app/environment';
import type { User } from '$lib/types';

// Svelte 5 rune-based auth state
let accessToken = $state<string | null>(null);
let currentUser = $state<User | null>(null);
let isLoading = $state(true);

// Initialize from backend on page load
if (browser) {
	initAuth();
}

async function initAuth() {
	try {
		// Try to get user from /me endpoint (uses httpOnly refresh cookie)
		const res = await fetch('/api/auth/me', { credentials: 'include' });
		if (res.ok) {
			const data = await res.json();
			accessToken = data.accessToken;
			currentUser = data.user;
		}
	} catch (err) {
		console.error('Auth init failed', err);
	} finally {
		isLoading = false;
	}
}

export function useAuth() {
	return {
		get accessToken() { return accessToken; },
		get currentUser() { return currentUser; },
		get isLoading() { return isLoading; },
		get isAuthenticated() { return currentUser !== null; },

		async login(email: string, password: string) {
			const res = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password }),
				credentials: 'include'  // Send httpOnly cookie
			});

			if (!res.ok) throw new Error('Login failed');

			const data = await res.json();
			accessToken = data.accessToken;
			currentUser = data.user;
		},

		async logout() {
			await fetch('/api/auth/logout', {
				method: 'POST',
				credentials: 'include'
			});

			accessToken = null;
			currentUser = null;

			// Clear TanStack Query cache to prevent data leakage
			queryClient.clear();
		},

		async refreshToken() {
			const res = await fetch('/api/auth/refresh', {
				method: 'POST',
				credentials: 'include'  // httpOnly cookie sent automatically
			});

			if (!res.ok) {
				// Refresh failed, logout
				this.logout();
				throw new Error('Token refresh failed');
			}

			const data = await res.json();
			accessToken = data.accessToken;
		}
	};
}
```

### 5.3 GraphQL Client Auth Integration

**Pattern:** Inject access token into Authorization header dynamically

**Updated (frontend/src/lib/queries/client.ts):**

```typescript
import { GraphQLClient } from 'graphql-request';
import { useAuth } from '$lib/auth/auth.svelte';

const GRAPHQL_ENDPOINT = import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:8080/graphql';

// Factory function to get client with current auth state
export function getGraphQLClient() {
	const auth = useAuth();

	return new GraphQLClient(GRAPHQL_ENDPOINT, {
		headers: {
			...(auth.accessToken ? { 'Authorization': `Bearer ${auth.accessToken}` } : {}),
			'X-CSRF-Protection': '1'  // CSRF mitigation (custom header)
		},
		credentials: 'include'  // Send cookies (for refresh token)
	});
}

// Legacy export for backward compatibility (use getGraphQLClient() for auth)
export const graphqlClient = new GraphQLClient(GRAPHQL_ENDPOINT, { headers: {} });
```

**Usage in queries:**

```typescript
// Before (unauthenticated)
const data = await graphqlClient.request(QUERY);

// After (authenticated)
const data = await getGraphQLClient().request(QUERY);
```

### 5.4 TanStack Query Cache Scoping

**Problem:** Without user ID in cache keys, User A's data could be served to User B after login.

**Solution:** Prefix all query keys with user ID

**Updated (frontend/src/lib/queries/content.ts):**

```typescript
import { createQuery } from '@tanstack/svelte-query';
import { getGraphQLClient } from './client';
import { useAuth } from '$lib/auth/auth.svelte';

export function useContentQuery() {
	const auth = useAuth();

	return createQuery(() => ({
		// Scope cache key by user ID
		queryKey: ['content', auth.currentUser?.id ?? 'anonymous'],
		queryFn: () => getGraphQLClient().request(LIST_CONTENT),
		enabled: auth.isAuthenticated  // Only fetch if logged in
	}));
}
```

**Cache invalidation on logout:**

```typescript
// In useAuth().logout()
queryClient.clear();  // Prevents data leakage
```

### 5.5 Token Refresh Interceptor

**Problem:** Access token expires after 15 min → GraphQL requests fail

**Solution:** Intercept 401 errors → refresh token → retry request

**Implementation (frontend/src/lib/queries/client.ts):**

```typescript
import { GraphQLClient, ClientError } from 'graphql-request';
import { useAuth } from '$lib/auth/auth.svelte';

export async function requestWithRetry(query: string, variables?: any) {
	const auth = useAuth();

	try {
		return await getGraphQLClient().request(query, variables);
	} catch (err) {
		// If 401 and we have a user, try refreshing token
		if (err instanceof ClientError && err.response.status === 401 && auth.isAuthenticated) {
			try {
				await auth.refreshToken();
				// Retry with new token
				return await getGraphQLClient().request(query, variables);
			} catch (refreshErr) {
				// Refresh failed, logout
				auth.logout();
				throw refreshErr;
			}
		}

		throw err;
	}
}
```

### 5.6 Route Protection

**Pattern:** Client-side navigation guards in `+layout.ts`

**Implementation (frontend/src/routes/(protected)/+layout.ts):**

```typescript
import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { useAuth } from '$lib/auth/auth.svelte';

export const load = async () => {
	if (browser) {
		const auth = useAuth();

		// Wait for auth to initialize
		while (auth.isLoading) {
			await new Promise(resolve => setTimeout(resolve, 50));
		}

		if (!auth.isAuthenticated) {
			throw redirect(302, '/login');
		}
	}

	return {};
};

// Required for static adapter
export const prerender = false;
```

**Routes:**
- `/login` — Public
- `/register` — Public
- `/` (Activity page) — Protected (requires auth)
- `/settings` — Protected

---

## 6. Security Considerations

### 6.1 CSRF Protection

**Threat:** Attacker tricks user's browser into sending authenticated request to Perspectize API

**Mitigation strategy:**

1. **Custom header requirement:** GraphQL requests must include `X-CSRF-Protection: 1` header
   - Browsers block cross-origin custom headers without CORS preflight
   - Attacker's HTML form cannot set custom headers

2. **Content-Type validation:** GraphQL endpoint only accepts `application/json`
   - Simple CSRF attacks use `application/x-www-form-urlencoded`
   - Apollo GraphQL default CSRF protection enforces this

3. **SameSite cookie attribute:** Refresh token cookie set with `SameSite=Strict`
   - Prevents cookie from being sent on cross-site requests

**Implementation (backend/cmd/server/main.go):**

```go
// CSRF protection middleware
r.Use(func(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// GraphQL mutations require custom header
		if r.Method == http.MethodPost && r.URL.Path == "/graphql" {
			if r.Header.Get("X-CSRF-Protection") == "" {
				http.Error(w, "missing CSRF header", http.StatusForbidden)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
})
```

**Sources:**
- [Apollo GraphQL CSRF Prevention](https://www.apollographql.com/docs/graphos/routing/security/csrf)
- [GraphQL CSRF Protection Guide](https://www.xenbel.com/blog/graphql-csrf-protection-guide/)

### 6.2 XSS Prevention

**Threat:** Attacker injects malicious JavaScript to steal tokens

**Mitigation:**

1. **No localStorage/sessionStorage:** Access tokens in memory only (Svelte $state rune)
2. **httpOnly cookies:** Refresh tokens inaccessible to JavaScript
3. **Content-Security-Policy header:** Restrict script sources (add in backend CORS)

**Cookie configuration (backend):**

```go
http.SetCookie(w, &http.Cookie{
	Name:     "refresh_token",
	Value:    refreshToken,
	HttpOnly: true,         // No JS access
	Secure:   true,         // HTTPS only (production)
	SameSite: http.SameSiteStrictMode,  // CSRF protection
	Path:     "/api/auth",
	MaxAge:   7 * 24 * 60 * 60,  // 7 days
})
```

### 6.3 Token Revocation

**Requirement:** Admin should be able to revoke all sessions for a user (e.g., after password change, account compromise)

**Implementation:**

1. **Refresh token blacklist:** Check `revoked_at IS NULL` when validating refresh token
2. **Revoke all user tokens mutation:**

```go
func (r *mutationResolver) RevokeAllSessions(ctx context.Context, userID int) (bool, error) {
	authUser := middleware.ForContext(ctx)
	if authUser == nil || (authUser.Role != "ADMIN" && authUser.ID != userID) {
		return false, fmt.Errorf("unauthorized")
	}

	// Revoke all refresh tokens for user
	err := r.refreshTokenRepo.RevokeAllForUser(ctx, userID)
	return err == nil, err
}
```

3. **Auto-revoke on password change:** When user changes password, revoke all existing tokens

### 6.4 Rate Limiting

**Threat:** Brute-force password guessing, token flooding

**Implementation:** Add rate limiting middleware (future milestone, not v1.1)

**Recommended library:** `golang.org/x/time/rate` or `github.com/ulule/limiter/v3`

**Endpoints to protect:**
- `/api/auth/login` — 5 attempts per IP per 15 min
- `/api/auth/register` — 3 attempts per IP per hour
- `/api/auth/refresh` — 10 attempts per IP per 15 min

### 6.5 Secrets Management

**Environment variables (backend/.env):**

```bash
JWT_SECRET=<generate-with-openssl-rand-base64-32>
DATABASE_URL=postgresql://...
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
```

**Production (Sevalla):**
- Set env vars in Sevalla dashboard (not committed to repo)
- Rotate JWT_SECRET periodically (invalidates all tokens)

**Sources:**
- [JWT Security Best Practices](https://oneuptime.com/blog/post/2026-01-07-go-jwt-authentication/view)

---

## 7. Migration Path (from user dropdown)

### Phase 1: Backend Auth Infrastructure (v1.1.1)

**Goal:** Add authentication without breaking existing functionality

**Changes:**
1. Add migration `000009_add_authentication.up.sql` (see section 3.3)
2. Implement password hashing (`pkg/crypto/password.go`)
3. Implement JWT generation (`pkg/auth/jwt.go`)
4. Add auth middleware (`pkg/middleware/auth.go`)
5. Add refresh token repository (`internal/adapters/repositories/postgres/refresh_token_repository.go`)
6. Add auth mutations to GraphQL schema (`register`, `login`, `logout`, `refresh`, `me`)
7. Wire middleware in `cmd/server/main.go`

**Backward compatibility:** Existing mutations still work with user dropdown (temporary)

**Tests:**
- Unit: Password hashing, JWT validation, token rotation
- Integration: Register → login → refresh → logout flow

### Phase 2: Frontend Auth UI (v1.1.2)

**Goal:** Add login/register pages, replace user dropdown with "logged in as X"

**Changes:**
1. Create `/login` and `/register` routes
2. Implement auth state management (`lib/auth/auth.svelte.ts`)
3. Update GraphQL client to inject auth header (`lib/queries/client.ts`)
4. Add user-scoped cache keys (`lib/queries/content.ts`, etc.)
5. Replace user dropdown in Header with user menu (avatar → dropdown → logout)

**Backward compatibility:** Non-authenticated requests still allowed (mutations fail with clear error)

**Tests:**
- E2E: Register flow, login flow, logout clears cache, token refresh on expiry

### Phase 3: Enforce Authentication (v1.1.3)

**Goal:** Require authentication for all mutations

**Changes:**
1. Add auth checks to all mutations (`createContent`, `createPerspective`, etc.)
2. Update frontend to show "Login to continue" for unauthenticated users
3. Remove user dropdown code
4. Add route guards for protected pages

**Tests:**
- Verify unauthenticated users cannot mutate
- Verify authenticated users can mutate

### Phase 4: Google OAuth2 (v1.1.4) — OPTIONAL

**Goal:** Add "Sign in with Google" option

**Changes:**
1. Set up Google Cloud Console OAuth2 credentials
2. Implement OAuth2 flow in backend (`internal/adapters/oauth/google.go`)
3. Add `loginWithGoogle` mutation
4. Add Google sign-in button to `/login` page

**Tests:**
- OAuth flow with test Google account

---

## 8. Sources

### Authentication Strategy
- [Choosing Between Local Storage and HttpOnly Cookies](https://medium.com/@cjun1775/choosing-between-local-storage-and-httponly-cookies-for-storing-jwt-tokens-47f4ecbca6ee)
- [JWT Storage Security Battle](https://cybersierra.co/blog/react-jwt-storage-guide/)
- [OWASP Token Storage Best Practices](https://www.pivotpointsecurity.com/local-storage-versus-cookies-which-to-use-to-securely-store-session-tokens/)
- [HttpOnly Cookies vs LocalStorage Comparison](https://medium.com/@developer.nijat/comparing-jwt-authentication-strategies-http-only-cookies-vs-localstorage-05254ed99722)

### SvelteKit Static Authentication
- [SvelteKit Static Adapter Docs](https://svelte.dev/docs/kit/adapter-static)
- [Authentication with Static Adapter Discussion](https://github.com/supabase/supabase-js/issues/882)
- [Understanding adapter-static Guide](https://khromov.se/the-missing-guide-to-understanding-adapter-static-in-sveltekit/)
- [Client-Side Auth with Firebase and SvelteKit](https://www.okupter.com/blog/client-side-authentication-firebase-sveltekit)
- [Firebase Svelte 5 Runes Authentication](https://gundogmuseray.medium.com/easy-way-to-stop-worry-about-client-side-auth-with-firebase-and-sveltekit-d17cdcccb663)

### Go Authentication Libraries
- [golang-jwt/jwt GitHub](https://github.com/golang-jwt/jwt)
- [golang-jwt/jwt v5 Documentation](https://pkg.go.dev/github.com/golang-jwt/jwt/v5)
- [go-chi/jwtauth GitHub](https://github.com/go-chi/jwtauth)
- [Chi JWT Auth Example](https://github.com/go-chi/jwtauth/blob/master/_example/main.go)
- [Integrating JWT with Chi Middleware](https://www.newline.co/@kchan/integrating-jwt-authentication-with-go-and-chi-jwtauth-middleware--ff9a6cec)

### Password Hashing
- [Password Hashing Guide 2025: Argon2 vs Bcrypt](https://guptadeepak.com/the-complete-guide-to-password-hashing-argon2-vs-bcrypt-vs-scrypt-vs-pbkdf2-2026/)
- [Best Password Hashing Algorithms 2025](https://bellatorcyber.com/blog/best-password-hashing-algorithms-of-2023/)
- [Argon2 Package Documentation](https://pkg.go.dev/golang.org/x/crypto/argon2)
- [How to Hash Passwords with Argon2 in Go](https://www.alexedwards.net/blog/how-to-hash-and-verify-passwords-with-argon2-in-go)
- [Bcrypt vs Argon2 in Golang](https://medium.com/@greyhands2/bcrypt-vs-argon2-in-golang-7103d1308d18)

### GraphQL Authentication
- [gqlgen Authentication Recipe](https://gqlgen.com/recipes/authentication/)
- [Building GraphQL Server with Go - Authentication](https://www.howtographql.com/graphql-go/6-authentication/)
- [Authenticate Go-GraphQL with JWT](https://medium.com/geekculture/authenticate-go-graphql-with-jwt-436c74340d)
- [gqlgen Authorization Directives](https://gqlgen.com/reference/directives/)
- [GraphQL Authorization Patterns](https://www.osohq.com/post/graphql-authorization)
- [How to Implement Authorization in GraphQL](https://oneuptime.com/blog/post/2026-02-02-graphql-authorization/view)

### CSRF Protection
- [Apollo GraphQL CSRF Prevention](https://www.apollographql.com/docs/graphos/routing/security/csrf)
- [GraphQL CSRF Protection Guide](https://www.xenbel.com/blog/graphql-csrf-protection-guide/)
- [Doyensec GraphQL CSRF Article](https://blog.doyensec.com/2021/05/20/graphql-csrf.html)
- [GraphQL Yoga CSRF Prevention](https://the-guild.dev/graphql/yoga-server/docs/features/csrf-prevention)

### TanStack Query
- [React Query User-Specific Cache Keys Discussion](https://github.com/TanStack/query/discussions/4345)
- [Handle Logout and User-Dependent Queries](https://github.com/TanStack/query/discussions/7839)
- [Query Keys Documentation](https://tanstack.com/query/v4/docs/react/guides/query-keys)

### OAuth2
- [Using OAuth 2.0 for Google APIs](https://developers.google.com/identity/protocols/oauth2)
- [golang.org/x/oauth2/google Package](https://pkg.go.dev/golang.org/x/oauth2/google)
- [How to Implement OAuth 2.0 in Go](https://permify.co/post/implement-oauth-2-golang-app/)

### Token Refresh
- [How to Handle JWT Authentication Securely in Go](https://oneuptime.com/blog/post/2026-01-07-go-jwt-authentication/view)
- [Building Auth System with Refresh Token Rotation](https://renrensan.medium.com/building-auth-system-demo-in-go-refresh-token-rotation-passwordless-login-05daf1ed7fbd)
- [Token Rotation Strategies](https://oneuptime.com/blog/post/2026-01-30-token-rotation-strategies/view)
- [Refresh Tokens Complete Guide](https://securityboulevard.com/2026/01/what-are-refresh-tokens-complete-implementation-guide-security-best-practices/)

---

## 9. Open Questions

1. **Email verification:** Should registration send verification email before allowing login? (Adds complexity, consider post-v1.1)
2. **Password reset flow:** How to implement "Forgot password?" (Requires email sending, consider post-v1.1)
3. **Multi-device sessions:** Should we show "Active sessions" in settings? (Nice-to-have, not MVP)
4. **Remember me:** Extend refresh token to 30 days if user checks "Remember me"? (Simple UX win)
5. **Admin user management:** Should admins be able to impersonate users for support? (Security vs. support tradeoff)

---

## 10. Next Steps

1. **Create GSD plan** for v1.1 authentication milestone using this research
2. **Prototype password hashing** to validate Argon2id performance on target hardware (Sevalla)
3. **Design database migration** carefully (email becomes NOT NULL — requires data backfill)
4. **Set up Google OAuth2 credentials** in Google Cloud Console (requires production domain)
5. **Review security checklist** before deploying to production

---

**Research complete. Ready for roadmap planning.**
