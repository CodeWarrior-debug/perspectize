# Phase 9: Security Hardening - Research

**Researched:** 2026-02-16
**Domain:** Application security, authentication, authorization, API protection
**Confidence:** HIGH

## Summary

Security hardening for a Go GraphQL API (gqlgen + chi) with SvelteKit frontend requires a multi-layered approach covering authentication, authorization, rate limiting, CSRF protection, security headers, and secret management. The research identifies JWT-based authentication with httpOnly cookies as the optimal approach for this stateless architecture, with gqlgen's built-in middleware and directive systems providing robust authorization capabilities.

The standard stack is well-established with mature, battle-tested Go libraries that integrate cleanly with the existing chi router and gqlgen setup. Most security controls can be implemented via middleware layers without requiring changes to business logic. Sevalla's automatic SSL/TLS handling simplifies HTTPS deployment, allowing focus on application-layer security.

**Primary recommendation:** Implement JWT authentication with refresh token rotation, combine middleware-based authentication with directive-based authorization, use httprate for rate limiting, enforce strict Content-Type validation for CSRF protection, and deploy security headers via unrolled/secure middleware.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| golang-jwt/jwt | v5.2+ | JWT generation and validation | Community-maintained successor to dgrijalva/jwt-go, production-ready with v5 improvements, supports all standard signing algorithms |
| go-chi/httprate | v0.14+ | Rate limiting middleware | Official chi ecosystem package, sliding window counter pattern, Redis-ready, minimal config |
| unrolled/secure | v1.15+ | Security headers middleware | Comprehensive header support (HSTS, CSP, X-Frame-Options, etc.), chi-compatible, widely used |
| gorilla/csrf | v1.7+ | CSRF protection | Signed double-submit cookie pattern, works with any http.Handler, template helpers included |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| golang.org/x/crypto/argon2 | latest | Password hashing | Required for user password storage (Argon2id is 2026 gold standard) |
| go-chi/cors | v1.2+ | CORS middleware | Replacing inline CORS handler, explicit origin whitelisting |
| gqlgen extensions | built-in | Query complexity limiting | Already available via extension.FixedComplexityLimit |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| golang-jwt/jwt | go-jose/go-jose | go-jose provides full JOSE standards (JWE encryption), but adds complexity not needed for simple JWT auth |
| httprate | golang.org/x/time/rate | stdlib rate is lower-level, requires manual integration; httprate provides chi middleware out-of-box |
| JWT auth | OAuth2 providers (Keycloak, Auth0) | OAuth2 adds federated identity and MFA but requires external service; overkill for single-tenant app with simple user model |
| Argon2 | bcrypt | bcrypt is simpler and still secure (cost 13-14), but Argon2id is OWASP-recommended for 2026 and resists GPU attacks better |

**Installation:**
```bash
cd backend
go get github.com/golang-jwt/jwt/v5
go get github.com/go-chi/httprate
go get github.com/unrolled/secure
go get github.com/gorilla/csrf
go get github.com/go-chi/cors
go get golang.org/x/crypto/argon2
```

## Architecture Patterns

### Recommended Project Structure
```
backend/internal/
├── adapters/
│   └── web/
│       └── middleware/
│           ├── auth.go           # JWT validation middleware
│           ├── ratelimit.go      # httprate configuration
│           ├── security.go       # unrolled/secure config
│           └── csrf.go           # CSRF protection (if needed)
├── core/
│   ├── domain/
│   │   └── auth.go              # User, Session domain models
│   ├── ports/
│   │   └── services/
│   │       └── auth_service.go  # Authentication port interface
│   └── services/
│       └── auth_service.go      # JWT generation, refresh logic
└── config/
    └── security.go              # Security config (JWT secret, rate limits)
```

### Pattern 1: Middleware-Based Authentication (HTTP Layer)
**What:** JWT validation middleware extracts token from cookie, validates signature, and stores user context
**When to use:** For ALL GraphQL requests to establish authenticated user identity
**Example:**
```go
// Source: gqlgen official docs + golang-jwt/jwt docs
// internal/adapters/web/middleware/auth.go

type contextKey string
const userContextKey contextKey = "user"

func AuthMiddleware(secret []byte) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            // Extract token from httpOnly cookie
            cookie, err := r.Cookie("auth_token")
            if err != nil {
                // No token = unauthenticated request (allowed, auth checks happen in resolvers)
                next.ServeHTTP(w, r)
                return
            }

            // Parse and validate JWT
            token, err := jwt.ParseWithClaims(cookie.Value, &Claims{}, func(token *jwt.Token) (interface{}, error) {
                // Validate signing method
                if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
                    return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
                }
                return secret, nil
            })

            if err != nil || !token.Valid {
                // Invalid token = treat as unauthenticated
                next.ServeHTTP(w, r)
                return
            }

            claims, ok := token.Claims.(*Claims)
            if !ok {
                next.ServeHTTP(w, r)
                return
            }

            // Store user ID in context
            ctx := context.WithValue(r.Context(), userContextKey, claims.UserID)
            next.ServeHTTP(w, r.WithContext(ctx))
        })
    }
}

// Helper to extract user from context in resolvers
func ForContext(ctx context.Context) (int, bool) {
    userID, ok := ctx.Value(userContextKey).(int)
    return userID, ok
}
```

### Pattern 2: Directive-Based Authorization (GraphQL Layer)
**What:** GraphQL schema directives enforce role/ownership checks on fields and mutations
**When to use:** For fine-grained authorization visible in the schema
**Example:**
```graphql
# Source: gqlgen directives documentation

directive @auth on FIELD_DEFINITION
directive @owner(idField: String!) on FIELD_DEFINITION

type Mutation {
    createPerspective(input: CreatePerspectiveInput!): Perspective! @auth
    updatePerspective(id: IntID!, input: UpdatePerspectiveInput!): Perspective! @owner(idField: "id")
    deletePerspective(id: IntID!): Boolean! @owner(idField: "id")
    deleteUser(id: IntID!): Boolean! @auth  # Admin-only, check in resolver
}

type Query {
    users: [User!]! @auth
    user(id: IntID!): User
}
```

```go
// Source: gqlgen directives implementation pattern
// internal/adapters/graphql/directives/auth.go

func (d *DirectiveRoot) Auth(ctx context.Context, obj interface{}, next graphql.Resolver) (interface{}, error) {
    userID, authenticated := middleware.ForContext(ctx)
    if !authenticated {
        return nil, fmt.Errorf("access denied: authentication required")
    }
    return next(ctx)
}

func (d *DirectiveRoot) Owner(ctx context.Context, obj interface{}, next graphql.Resolver, idField string) (interface{}, error) {
    userID, authenticated := middleware.ForContext(ctx)
    if !authenticated {
        return nil, fmt.Errorf("access denied: authentication required")
    }

    // Extract resource owner ID from input arguments
    fieldContext := graphql.GetFieldContext(ctx)
    args := fieldContext.Args
    resourceIDArg, ok := args[idField]
    if !ok {
        return nil, fmt.Errorf("missing %s argument for ownership check", idField)
    }

    resourceID, ok := resourceIDArg.(int)
    if !ok {
        return nil, fmt.Errorf("invalid %s type for ownership check", idField)
    }

    // Look up resource owner (example: perspective)
    perspective, err := getPerspective(ctx, resourceID)  // from service
    if err != nil {
        return nil, err
    }

    if perspective.UserID != userID {
        return nil, fmt.Errorf("access denied: you can only modify your own resources")
    }

    return next(ctx)
}
```

### Pattern 3: Rate Limiting by IP and Endpoint
**What:** httprate sliding window counter limits requests per IP per time window
**When to use:** On all public endpoints to prevent DoS attacks
**Example:**
```go
// Source: https://github.com/go-chi/httprate
// cmd/server/main.go middleware stack

import "github.com/go-chi/httprate"

r := chi.NewRouter()

// Global rate limit: 100 req/min per IP
r.Use(httprate.LimitByIP(100, time.Minute))

// Stricter limit on auth endpoints
r.Group(func(r chi.Router) {
    r.Use(httprate.Limit(
        10, 10*time.Second,
        httprate.WithKeyFuncs(httprate.KeyByIP),
        httprate.WithLimitHandler(func(w http.ResponseWriter, r *http.Request) {
            http.Error(w, `{"error":"rate limit exceeded"}`, http.StatusTooManyRequests)
        }),
    ))
    r.Post("/auth/login", loginHandler)
    r.Post("/auth/register", registerHandler)
})
```

### Pattern 4: Security Headers Middleware
**What:** unrolled/secure sets HSTS, X-Content-Type-Options, X-Frame-Options, CSP headers
**When to use:** Applied globally to all responses
**Example:**
```go
// Source: https://github.com/unrolled/secure
import "github.com/unrolled/secure"

secureMiddleware := secure.New(secure.Options{
    // HSTS: enforce HTTPS for 1 year, include subdomains
    STSSeconds:           31536000,
    STSIncludeSubdomains: true,
    STSPreload:           true,

    // Prevent MIME sniffing
    ContentTypeNosniff: true,

    // Prevent clickjacking
    FrameDeny: true,

    // XSS protection (legacy browsers)
    BrowserXssFilter: true,

    // Content Security Policy
    ContentSecurityPolicy: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';",

    // Only enforce in production
    IsDevelopment: os.Getenv("APP_ENV") != "production",
})

r.Use(secureMiddleware.Handler)
```

### Pattern 5: Query Complexity Limiting
**What:** gqlgen extension calculates query complexity and rejects expensive queries
**When to use:** To prevent DoS via nested/expensive GraphQL queries
**Example:**
```go
// Source: https://gqlgen.com/reference/complexity/
import "github.com/99designs/gqlgen/graphql/handler/extension"

srv := handler.NewDefaultServer(generated.NewExecutableSchema(config))

// Fixed complexity limit
srv.Use(extension.FixedComplexityLimit(500))

// Custom complexity for expensive fields
config.Complexity.Content.Perspectives = func(childComplexity, first, after int) int {
    // Cost scales with pagination size
    return first * childComplexity
}
```

### Pattern 6: Refresh Token Rotation
**What:** Each refresh token use generates new access + refresh tokens, old refresh token invalidated
**When to use:** To limit damage from stolen refresh tokens
**Example:**
```go
// Source: Go JWT authentication best practices 2026
type RefreshTokenStore interface {
    IsRevoked(tokenID string) bool
    Revoke(tokenID string) error
}

func RefreshAccessToken(refreshToken string, store RefreshTokenStore) (newAccess, newRefresh string, err error) {
    // Validate refresh token
    claims, err := ValidateJWT(refreshToken, refreshSecret)
    if err != nil {
        return "", "", err
    }

    // Check if already used (revoked)
    if store.IsRevoked(claims.ID) {
        return "", "", errors.New("refresh token already used")
    }

    // Revoke old refresh token
    if err := store.Revoke(claims.ID); err != nil {
        return "", "", err
    }

    // Generate new token pair
    newAccess, err = GenerateAccessToken(claims.UserID, 15*time.Minute)
    newRefresh, err = GenerateRefreshToken(claims.UserID, 7*24*time.Hour)
    return newAccess, newRefresh, err
}
```

### Anti-Patterns to Avoid
- **Directive-first authorization without middleware authentication:** Directives run AFTER resolvers start processing. Always authenticate in middleware first, authorize in directives/resolvers.
- **Storing JWT secret in config file:** Use environment variables or vault. Config files get committed to git.
- **Accepting refresh tokens in query params or headers:** Refresh tokens should only be in httpOnly cookies to prevent XSS theft.
- **Using wildcard CORS with cookie-based auth:** Allows any origin to make credentialed requests. Whitelist specific origins.
- **Disabling CSRF protection because "GraphQL uses POST":** GraphQL endpoints often accept application/x-www-form-urlencoded, making them CSRF-vulnerable.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT signing/validation | Custom crypto with HMAC | golang-jwt/jwt v5 | Algorithm agility, proper error handling, timing-attack resistance, claim validation built-in |
| Rate limiting | In-memory map of IPs + timestamps | go-chi/httprate | Sliding window counter (smoother than fixed window), Redis support, header customization, key functions |
| Password hashing | sha256 + salt | golang.org/x/crypto/argon2 | Memory-hard algorithm resists GPU/ASIC attacks, OWASP-recommended, proper salt handling |
| CSRF tokens | Random strings in hidden fields | gorilla/csrf | Signed double-submit cookies, automatic token rotation, timing-attack safe comparison |
| Security headers | Manual w.Header().Set() calls | unrolled/secure | Comprehensive header support, HSTS preload list compatibility, CSP nonce generation, development mode |
| CORS middleware | Custom preflight handling | go-chi/cors | Proper preflight, credential handling, origin validation, methods/headers whitelisting |
| Query complexity | Counting nested fields manually | gqlgen extension.ComplexityLimit | Field-specific weights, custom complexity functions, parameter-based scaling |
| Refresh token storage | In-memory map | Database table with TTL | Persistence across restarts, distributed systems support, audit trail |

**Key insight:** Security primitives have subtle edge cases (timing attacks, algorithm negotiation, token fixation). Battle-tested libraries have already solved these. Custom implementations almost always have flaws.

## Common Pitfalls

### Pitfall 1: Authentication After Resolver Execution
**What goes wrong:** Using only GraphQL directives for auth checks means resolvers start executing before auth runs, potentially leaking data or causing errors.
**Why it happens:** Misunderstanding that directives wrap resolvers but don't prevent resolver execution startup. Field resolution begins before directive code runs.
**How to avoid:** Always authenticate in HTTP middleware BEFORE GraphQL handler. Use directives only for fine-grained authorization (roles, ownership), not authentication.
**Warning signs:** Logs show database queries happening for unauthenticated requests. Error messages leak "user not found" instead of "authentication required".

### Pitfall 2: JWT Secret Too Short or Weak
**What goes wrong:** Secrets under 32 bytes or predictable values (like "secret") allow brute-force attacks on JWT signatures.
**Why it happens:** Development placeholders not replaced in production. Misunderstanding HMAC-SHA256 key requirements.
**How to avoid:** Generate 64+ byte random secrets via `openssl rand -base64 64`. Validate secret length at startup. Fail-fast if < 32 bytes.
**Warning signs:** Security scanners flag weak secrets. JWT libraries issue warnings about key length.

### Pitfall 3: CORS Allows Credentials with Wildcard Origin
**What goes wrong:** Setting `Access-Control-Allow-Origin: *` with `Access-Control-Allow-Credentials: true` is forbidden by browsers. Requests fail silently.
**Why it happens:** Not understanding CORS spec restrictions. Copying examples without reading warnings.
**How to avoid:** Never use wildcard with credentials. Whitelist exact origins: `AllowedOrigins: []string{"https://app.perspectize.com"}`. For development, use `AllowedOrigins: []string{"http://localhost:5173"}`.
**Warning signs:** Frontend GraphQL queries fail with CORS errors in browser console. Network tab shows OPTIONS preflight failing.

### Pitfall 4: GraphQL Accepts application/x-www-form-urlencoded Without CSRF Protection
**What goes wrong:** Accepting form-encoded POST requests makes GraphQL CSRF-vulnerable. Content-Type validation alone is insufficient.
**Why it happens:** Assuming "GraphQL uses JSON" means CSRF is impossible. Not testing with different Content-Types.
**How to avoid:** Either (1) reject non-application/json Content-Types explicitly, OR (2) implement CSRF tokens via gorilla/csrf. Approach 1 is simpler for pure API.
**Warning signs:** Security audits flag CSRF vulnerability. Attackers can trigger mutations from malicious sites.

### Pitfall 5: Introspection Disabled, Playground Enabled
**What goes wrong:** Disabling introspection while leaving Playground enabled doesn't hide schema. Playground re-enables introspection or uses cached schema.
**Why it happens:** Misunderstanding that Playground requires introspection to function. Env check applies to Playground but not introspection.
**How to avoid:** Disable BOTH in production: `if os.Getenv("APP_ENV") == "production" { srv.Use(extension.IntrospectionDisabled) }` AND gate Playground behind same check (already done in codebase per C-09 fix).
**Warning signs:** Schema visible in production despite introspection "disabled". GraphQL clients can still query `__schema`.

### Pitfall 6: Rate Limiting After Authentication
**What goes wrong:** Placing rate limiting after auth middleware allows attackers to DoS auth endpoints before rate limits apply.
**Why it happens:** Middleware order confusion. Assuming "auth should run first" applies to all cases.
**How to avoid:** Rate limiting MUST be first middleware (after RequestID/RealIP). Order: RequestID → RealIP → RateLimiting → Auth → Business Logic.
**Warning signs:** Auth endpoints overwhelmed during attacks despite rate limiting configured. Logs show rate limit middleware not triggering.

### Pitfall 7: Hardcoded Access Token Expiration in Code
**What goes wrong:** Changing token expiration requires code changes + redeployment. Can't respond quickly to security incidents.
**Why it happens:** Not planning for operational flexibility. "15 minutes is fine" becomes hardcoded constant.
**How to avoid:** Load token expiration from config/env: `AccessTokenTTL: time.Duration(cfg.Security.AccessTokenMinutes) * time.Minute`. Default to 15min if not set.
**Warning signs:** Production incident requires code change to extend/shorten token lifetime. Emergency redeploy needed for config change.

### Pitfall 8: Email Exposure in GraphQL Errors
**What goes wrong:** User lookup failures return "user john@example.com not found", leaking email addresses to attackers probing for accounts.
**Why it happens:** Using `%w` error wrapping that includes user input in messages. Not sanitizing errors before returning to GraphQL clients.
**How to avoid:** Never include user input in error messages. Use error codes: `ErrNotFound` → "resource not found". Log details server-side, return generic messages to clients.
**Warning signs:** GraphQL responses contain email addresses, usernames, or IDs in error messages. Attackers can enumerate valid accounts.

### Pitfall 9: YouTube API Key in Error Responses
**What goes wrong:** YouTube API errors include the API key in URL parameters. Wrapping these errors exposes keys to clients.
**Why it happens:** Passing HTTP client errors directly to GraphQL without sanitization. Not checking error message contents.
**How to avoid:** Parse YouTube API errors, extract relevant message, discard URL/headers. Never return raw HTTP errors: `return nil, fmt.Errorf("youtube API error: %s", sanitizedMessage)`.
**Warning signs:** API keys visible in GraphQL error responses. Logs contain full YouTube API URLs with keys.

### Pitfall 10: Missing Argon2 Parameters
**What goes wrong:** Using Argon2 with default parameters (too low memory/iterations) provides weak protection against brute-force.
**Why it happens:** Not reading OWASP recommendations. Copying examples without understanding parameter impact.
**How to avoid:** Use OWASP 2023 recommendations: Argon2id, 19 MiB memory, 2 iterations, 1 parallelism. Validate parameters at startup.
**Warning signs:** Password hashes generated in < 50ms (should be 250-500ms). Security audit flags weak Argon2 config.

## Code Examples

Verified patterns from official sources:

### JWT Generation with golang-jwt/jwt v5
```go
// Source: https://github.com/golang-jwt/jwt documentation
import (
    "time"
    "github.com/golang-jwt/jwt/v5"
)

type Claims struct {
    UserID int    `json:"user_id"`
    Email  string `json:"email"`
    jwt.RegisteredClaims
}

func GenerateAccessToken(userID int, email string, secret []byte) (string, error) {
    claims := Claims{
        UserID: userID,
        Email:  email,
        RegisteredClaims: jwt.RegisteredClaims{
            ExpiresAt: jwt.NewNumericDate(time.Now().Add(15 * time.Minute)),
            IssuedAt:  jwt.NewNumericDate(time.Now()),
            NotBefore: jwt.NewNumericDate(time.Now()),
            Issuer:    "perspectize",
            Subject:   fmt.Sprintf("%d", userID),
        },
    }

    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    return token.SignedString(secret)
}
```

### Argon2id Password Hashing
```go
// Source: https://guptadeepak.com/the-complete-guide-to-password-hashing-argon2-vs-bcrypt-vs-scrypt-vs-pbkdf2-2026/
// OWASP recommendations for Argon2id
import (
    "crypto/rand"
    "encoding/base64"
    "golang.org/x/crypto/argon2"
)

const (
    argon2Time      = 2      // iterations
    argon2Memory    = 19456  // 19 MiB in KiB
    argon2Threads   = 1      // parallelism
    argon2KeyLength = 32     // output length
    saltLength      = 16
)

func HashPassword(password string) (string, error) {
    salt := make([]byte, saltLength)
    if _, err := rand.Read(salt); err != nil {
        return "", err
    }

    hash := argon2.IDKey(
        []byte(password),
        salt,
        argon2Time,
        argon2Memory,
        argon2Threads,
        argon2KeyLength,
    )

    // Format: $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>
    encoded := fmt.Sprintf(
        "$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
        argon2.Version,
        argon2Memory,
        argon2Time,
        argon2Threads,
        base64.RawStdEncoding.EncodeToString(salt),
        base64.RawStdEncoding.EncodeToString(hash),
    )
    return encoded, nil
}
```

### CORS Middleware with Explicit Origins
```go
// Source: https://github.com/go-chi/cors
import "github.com/go-chi/cors"

corsMiddleware := cors.Handler(cors.Options{
    AllowedOrigins:   []string{"https://app.perspectize.com"},  // Production origin
    AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
    AllowedHeaders:   []string{"Content-Type", "Authorization"},
    AllowCredentials: true,
    MaxAge:           300, // Preflight cache duration
})

r.Use(corsMiddleware)
```

### Content-Type Validation for CSRF Prevention
```go
// Source: https://www.apollographql.com/docs/graphos/routing/security/csrf
// Reject non-JSON content types to prevent CSRF
func ContentTypeValidation(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if r.Method == http.MethodPost {
            ct := r.Header.Get("Content-Type")
            // Allow only application/json (with optional charset)
            if !strings.HasPrefix(ct, "application/json") {
                http.Error(w, "Content-Type must be application/json", http.StatusUnsupportedMediaType)
                return
            }
        }
        next.ServeHTTP(w, r)
    })
}

r.Use(ContentTypeValidation)
```

### httpOnly Cookie Setting
```go
// Source: SvelteKit + Go JWT authentication patterns
func SetAuthCookie(w http.ResponseWriter, token string, maxAge int) {
    http.SetCookie(w, &http.Cookie{
        Name:     "auth_token",
        Value:    token,
        Path:     "/",
        MaxAge:   maxAge,          // seconds
        HttpOnly: true,            // Prevent JavaScript access (XSS protection)
        Secure:   true,            // HTTPS only
        SameSite: http.SameSiteStrictMode,  // CSRF protection
    })
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| bcrypt for passwords | Argon2id | 2015 (PHC winner), OWASP updated 2023 | GPU/ASIC attack resistance; use Argon2id with 19 MiB memory, 2 iterations |
| JWT with single long-lived token | Access token (15min) + refresh token rotation | ~2018, standardized by 2020 | Limits stolen token window; refresh tokens invalidated on use |
| Wildcard CORS for simplicity | Explicit origin whitelisting | Always required for credentials; enforcement tightened 2020+ | Prevents cross-origin attacks; requires environment-specific config |
| Disabling introspection only | Disable introspection + playground in production | 2020+ GraphQL security hardening | Defense-in-depth; playground re-enables introspection if left on |
| OAuth2 Password Grant | Authorization Code Flow or custom username/password with JWT | OAuth2 deprecated password grant 2020 | Password grant has no MFA support; simpler to implement custom auth for single-tenant apps |
| Fixed window rate limiting | Sliding window counter | 2015+, httprate uses sliding window | Smoother traffic handling, prevents burst exploitation at window boundaries |
| Session-based auth for APIs | JWT-based stateless auth | 2015+ for APIs (sessions still valid for server-rendered apps) | Scales across instances without shared state; SvelteKit uses JWT in cookies for ergonomics |

**Deprecated/outdated:**
- **dgrijalva/jwt-go:** Unmaintained since 2020. Use golang-jwt/jwt (community fork, v5 recommended).
- **OAuth2 Password Grant:** Deprecated by OAuth 2.1 spec. No MFA support, credentials exposed to client. Use Authorization Code Flow or custom auth.
- **go-jose for simple JWT:** Overkill unless you need JWE (encryption). golang-jwt/jwt is simpler for JWT-only use cases.
- **Disabling CSRF because "SameSite=Strict is enough":** SameSite doesn't protect users on browsers that don't support it (IE 11) or in cross-site contexts. Defense-in-depth requires Content-Type validation OR CSRF tokens.

## Open Questions

Things that couldn't be fully resolved:

1. **Sevalla Reverse Proxy Configuration for HTTPS**
   - What we know: Sevalla automatically provides free SSL certificates via Cloudflare integration. All verified domains get TLS 1.2/1.3. Web server type is Nginx.
   - What's unclear: Whether Go app should use `http.ListenAndServe` and rely on Sevalla's reverse proxy for TLS termination, OR use `http.ListenAndServeTLS` with custom certificates. Documentation suggests reverse proxy approach is standard.
   - Recommendation: Use `http.ListenAndServe` (no TLS in app). Sevalla handles TLS termination. This is typical PaaS pattern and matches current codebase. Verify via Sevalla support if custom TLS config is needed.

2. **Refresh Token Storage Strategy**
   - What we know: Refresh tokens must be stored to track revocation. Options: (1) database table, (2) Redis, (3) in-memory (doesn't survive restarts).
   - What's unclear: Project doesn't currently use Redis. Adding Redis just for refresh tokens may be overkill for initial security phase. Database table works but adds query on every refresh.
   - Recommendation: Start with PostgreSQL table (`refresh_tokens` with `token_id`, `user_id`, `expires_at`, `revoked_at`). Add index on `token_id`. Migrate to Redis later if refresh traffic becomes bottleneck (unlikely for <10k users).

3. **CSRF Protection Necessity**
   - What we know: Strict Content-Type validation (reject non-application/json) provides CSRF protection for GraphQL. gorilla/csrf adds signed double-submit cookies but requires cookie handling.
   - What's unclear: Whether Content-Type validation alone is sufficient, or if defense-in-depth requires CSRF tokens despite GraphQL spec recommendations.
   - Recommendation: Implement Content-Type validation middleware first (simpler, sufficient per Apollo/GraphQL security docs). Add gorilla/csrf only if security audit requires it or if adding form-based endpoints later.

4. **User Registration Flow**
   - What we know: Current KNOWN_BUGS.md shows no auth exists. Research covers authentication, but user registration (email verification, password reset) not specified in phase requirements.
   - What's unclear: Whether Phase 9 includes registration/login mutations, or only the auth infrastructure. Requirements focus on protecting existing mutations, not creating auth mutations.
   - Recommendation: Phase 9 should implement auth infrastructure (JWT generation, validation middleware) and protect existing mutations. Defer user registration UI/mutations to Phase 10 or separate story. Allows testing auth with manually-created users.

5. **GraphQL Playground in Development**
   - What we know: C-09 was fixed (Playground gated behind `APP_ENV != "production"`). Playground requires introspection to function.
   - What's unclear: Whether authenticated requests can still use Playground in dev, or if it conflicts with httpOnly cookies (Playground UI can't set cookies).
   - Recommendation: For development, add `playground.WithHeaders(map[string]string{"Cookie": "auth_token=<dev-token>"})` option OR create separate `/graphql-dev` endpoint without auth middleware for Playground use. Production Playground already disabled.

## Sources

### Primary (HIGH confidence)
- [gqlgen Query Complexity Documentation](https://gqlgen.com/reference/complexity/) - Official docs, verified current
- [gqlgen Authentication Recipe](https://gqlgen.com/recipes/authentication/) - Official middleware pattern
- [gqlgen Schema Directives](https://gqlgen.com/reference/directives/) - Official authorization approach
- [go-chi/httprate GitHub](https://github.com/go-chi/httprate) - Official package docs and examples
- [unrolled/secure GitHub](https://github.com/unrolled/secure) - Official middleware configuration
- [golang-jwt/jwt GitHub](https://github.com/golang-jwt/jwt) - Community-maintained JWT library
- [Sevalla SSL Certificates Documentation](https://docs.sevalla.com/application-hosting/application-domains/application-ssl-certificates) - Official hosting platform docs

### Secondary (MEDIUM confidence)
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) - Industry standard, verified current
- [Apollo GraphQL CSRF Prevention](https://www.apollographql.com/docs/graphos/routing/security/csrf) - GraphQL-specific best practices
- [Password Hashing Guide 2025: Argon2 vs Bcrypt](https://guptadeepak.com/the-complete-guide-to-password-hashing-argon2-vs-bcrypt-vs-scrypt-vs-pbkdf2-2026/) - Current hashing recommendations
- [How to Handle JWT Authentication Securely in Go (2026)](https://oneuptime.com/blog/post/2026-01-07-go-jwt-authentication/view) - Recent best practices
- [SvelteKit Official Auth Documentation](https://svelte.dev/docs/kit/auth) - Framework-specific guidance
- [gorilla/csrf GitHub](https://github.com/gorilla/csrf) - Official CSRF middleware

### Tertiary (LOW confidence)
- Various Medium articles on gqlgen authentication patterns - useful examples but not authoritative
- Stack Overflow discussions on JWT vs sessions - community opinions, verify with official docs
- Blog posts on GraphQL security - helpful for pitfall discovery but require official source verification

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries are official/well-established with active maintenance and official documentation verified
- Architecture: HIGH - Patterns sourced from official gqlgen docs and verified against current Go/GraphQL best practices
- Pitfalls: MEDIUM - Based on documented security issues and community experience; some scenarios extrapolated from general patterns
- Sevalla HTTPS: MEDIUM - Official docs confirm automatic SSL but Go app TLS config inferred from typical PaaS patterns
- CSRF approach: MEDIUM - Content-Type validation widely recommended but debate exists on necessity of additional CSRF tokens for GraphQL

**Research date:** 2026-02-16
**Valid until:** 2026-04-16 (60 days - security best practices evolve slowly, but library versions update frequently)
