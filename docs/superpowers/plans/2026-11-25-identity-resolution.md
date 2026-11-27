# Identity Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One module turns a verified Clerk identity (or a Clerk webhook payload) into the local user: create on demand, link by email, refuse deactivated users, idempotent provisioning.

**Architecture:** A port `IdentityResolver` in `core/ports/services` is implemented by `core/services/identity_resolver.go` over `repositories.UserRepository` and a new external port `ClerkDirectory`. The Clerk SDK adapter lives in `adapters/auth`. The demo rule is a decorator on `ClerkDirectory` in `internal/demo`. The HTTP middleware, the WebSocket InitFunc and the webhook all call the resolver. Profile derivation (primary email, username fallback, 24-rune truncation) is a domain type. Constraint conflicts are detected by `ConstraintName` into sentinels wrapping `ErrAlreadyExists`.

**Tech Stack:** Go, GORM + pgx (`pgconn.PgError`), go-sqlmock, testify, clerk-sdk-go v2 (`clerktest`), svix webhooks.

**Spec:** This plan (no separate spec; the issue is #876, and the design was reviewed by the advisor in-session).

## Global Constraints

- No schema or migration changes.
- `domain` imports nothing from adapters; `core/services` imports only `domain`, `ports`, `pkg`; `adapters/auth` imports only `domain`, `ports` (plus the pre-existing `internal/demo` import, which is removed from `clerk_middleware.go`); `internal/demo` imports only `domain`, `ports`.
- Do not change the `UserRepository` method set (it would churn every mock and trip PR 861 rule B4).
- No `strings.Contains` / text matching on errors (PR 861 rule B8).
- New files under 500 lines; `clerk_middleware.go`, `webhook_handler.go`, `api.go` must not grow.
- Username column is `varchar(24)`.
- Clerk-derived usernames are truncated to 24 runes (behaviour change, recorded in PR).
- Comments describe the code as it stands; no ticket numbers in comments.

## Review Focus

1. Username collision (two Clerk users derive the same username, e.g. email prefix `james`) must not block the user from ever signing in. Test: `TestResolve_UsernameCollisionRetriesWithSuffix` (Task 4).
2. Email already linked to a different Clerk identity must NOT be re-pointed. Test: `TestResolve_EmailLinkRefusedWhenRowLinkedElsewhere` (Task 4).
3. Overlong Clerk username (> 24 runes) must not fail the insert. Test: `TestClerkProfile_LocalUsernameTruncatesTo24Runes` (Task 1).
4. A deactivated user must not authenticate on HTTP or WebSocket, and a webhook redelivery for a deactivated user must still return success. Tests: `TestResolve_InactiveUserRejected` (Task 4), `TestMiddleware_InactiveUserIsGuest` (Task 7), `TestWebSocketAuth_InactiveUserRejected` (Task 9), `TestWebhook_UserCreatedForInactiveRowReturnsOK` (Task 8).
5. Demo persona IDs must never be created on demand, even when the Clerk API would return a profile. Test: `TestDemoDirectory_NeverFetchesDemoIdentity` (Task 5).

---

### Task 1: Domain profile and identity sentinels

**Files:**
- Create: `backend/internal/core/domain/clerk_profile.go`
- Modify: `backend/internal/core/domain/errors.go` (add sentinels)
- Test: `backend/test/domain/clerk_profile_test.go`

**Interfaces:**
- Produces:
  - `type ClerkEmail struct { ID, Address string }`
  - `type ClerkProfile struct { ClerkID, Username, PrimaryEmailID string; Emails []ClerkEmail }`
  - `func (p ClerkProfile) PrimaryEmail() string` — address whose ID is `PrimaryEmailID`; else first address; else `""`.
  - `func (p ClerkProfile) LocalUsername() string` — `Username` if non-empty, else part of the primary email before `@`, else `ClerkID`; truncated to 24 runes.
  - `func (p ClerkProfile) DisambiguatedUsername() string` — `LocalUsername()` first 17 runes + `"-"` + last 6 runes of `ClerkID` (total ≤ 24).
  - `ErrUsernameTaken`, `ErrEmailTaken`, `ErrClerkIDTaken` (each `fmt.Errorf("...: %w", ErrAlreadyExists)`), `ErrUserInactive` (`errors.New("user is deactivated")`).

- [ ] **Step 1: Write the failing tests** (`test/domain/clerk_profile_test.go`, package `domain_test`)

```go
func TestClerkProfile_PrimaryEmailPrefersPrimaryID(t *testing.T) {
	p := domain.ClerkProfile{PrimaryEmailID: "e2", Emails: []domain.ClerkEmail{{ID: "e1", Address: "a@x.com"}, {ID: "e2", Address: "b@x.com"}}}
	assert.Equal(t, "b@x.com", p.PrimaryEmail())
}
func TestClerkProfile_PrimaryEmailFallsBackToFirst(t *testing.T) {
	p := domain.ClerkProfile{PrimaryEmailID: "missing", Emails: []domain.ClerkEmail{{ID: "e1", Address: "a@x.com"}}}
	assert.Equal(t, "a@x.com", p.PrimaryEmail())
	assert.Equal(t, "", domain.ClerkProfile{}.PrimaryEmail())
}
func TestClerkProfile_LocalUsernameOrder(t *testing.T) // username wins; else email prefix ("james" from james@x.com); else ClerkID ("user_abc" when no username and no '@')
func TestClerkProfile_LocalUsernameTruncatesTo24Runes(t *testing.T) // 30-char username -> first 24 runes; multi-byte input truncated by rune not byte
func TestClerkProfile_DisambiguatedUsernameFitsAndIsStable(t *testing.T) // ClerkID "user_2abcdefghijklmnop" -> len(runes) == 24, ends with "-klmnop"
```

- [ ] **Step 2: Run to verify failure**

Run: `go -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/3/backend test ./test/domain/ -run ClerkProfile -v`
Expected: FAIL (undefined `domain.ClerkProfile`).

- [ ] **Step 3: Implement** `clerk_profile.go` (plain Go, no imports beyond `strings`/`unicode/utf8` as needed) and the four sentinels in `errors.go`, wrapping `ErrAlreadyExists` with `%w` like `ErrContentNotFound`.

- [ ] **Step 4: Run to verify pass**

Run: same as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/3 add backend/internal/core/domain/clerk_profile.go backend/internal/core/domain/errors.go backend/test/domain/clerk_profile_test.go
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/3 commit -m "feat(domain): add Clerk profile and identity conflict sentinels"
```

---

### Task 2: Repository maps constraints by name

**Files:**
- Modify: `backend/internal/adapters/repositories/postgres/gorm_user_repository.go` (`CreateFromClerk`, `Update`; replace the existing message-only errors with the sentinels)
- Test: `backend/test/repositories/gorm_user_identity_test.go`

**Interfaces:**
- Consumes: `domain.ErrUsernameTaken`, `ErrEmailTaken`, `ErrClerkIDTaken` (Task 1).
- Produces: `CreateFromClerk` and `Update` return those sentinels (via `errors.Is`) when the Postgres error is `23505` with `ConstraintName` `users_unique_username`, `users_unique_email`, or `users_clerk_user_id_key`. Other errors are returned unchanged.

- [ ] **Step 1: Write failing tests** (sqlmock; build the error as `&pgconn.PgError{Code: "23505", ConstraintName: "users_unique_email"}` returned from the `INSERT` expectation; reuse the existing mock-DB helper in `test/repositories/helpers_test.go`)
  - `TestCreateFromClerk_MapsUniqueConstraintToSentinel` — table over the three constraint names, each `errors.Is(err, want)` and `errors.Is(err, domain.ErrAlreadyExists)`.
  - `TestCreateFromClerk_UnknownErrorUnchanged` — a non-23505 error is returned as-is (`errors.Is(err, origErr)`, not a sentinel).
  - `TestCreateFromClerk_IsOneStatement` — `querycount.AssertExactly(t, 1)` on the success path.
  - `TestUpdate_ClerkIDConflictIsSentinel` — `Update` with `users_clerk_user_id_key` returns `ErrClerkIDTaken`.

- [ ] **Step 2: Run to verify failure.** `go -C <wt>/backend test ./test/repositories/ -run 'CreateFromClerk|Update_ClerkID' -v` → FAIL.

- [ ] **Step 3: Implement.** One private helper `uniqueConflict(err error) error` in `gorm_user_repository.go` that does `errors.As(err, &pgErr)` and switches on `ConstraintName`; used by `CreateFromClerk` and `Update`. Replace `Update`'s `fmt.Errorf("%w: username already taken", domain.ErrAlreadyExists)` lines with the helper.

- [ ] **Step 4: Run to verify pass.** Same command → PASS. Then `go -C <wt>/backend test ./test/repositories/ -v` (all pass; DB-gated tests SKIP is acceptable).

- [ ] **Step 5: Commit** `fix(repo): map user unique-constraint conflicts by constraint name`.

---

### Task 3: Ports

**Files:**
- Create: `backend/internal/core/ports/services/identity_resolver.go`
- Create: `backend/internal/core/ports/services/clerk_directory.go`

**Interfaces (produced):**
```go
// IdentityResolver maps a verified identity to a local user.
type IdentityResolver interface {
	// Resolve returns the local user for a verified Clerk ID, provisioning it from
	// the Clerk profile on first sight. Returns domain.ErrUserInactive for a deactivated user.
	Resolve(ctx context.Context, clerkID string) (*domain.User, error)
	// Provision ensures a local user exists for the profile (idempotent). It returns
	// the row whatever its Active flag, so webhook redelivery is never an error for a deactivated user.
	Provision(ctx context.Context, profile domain.ClerkProfile) (*domain.User, error)
}

// ClerkDirectory fetches a Clerk user's profile from the identity provider.
// Returns domain.ErrNotFound when no such identity exists.
type ClerkDirectory interface {
	Profile(ctx context.Context, clerkID string) (domain.ClerkProfile, error)
}
```

- [ ] **Step 1: No test** (interfaces only; compile-checked by Tasks 4–9). Verify with `go -C <wt>/backend build ./...`.
- [ ] **Step 2: Commit** `refactor(ports): add identity resolver and Clerk directory ports`.

---

### Task 4: Identity resolver service

**Files:**
- Create: `backend/internal/core/services/identity_resolver.go` (≤ 250 lines)
- Test: `backend/test/services/identity_resolver_test.go` (fake `UserRepository` implementing the full port by embedding `repositories.UserRepository` as nil and overriding `GetByClerkID`, `GetByEmail`, `CreateFromClerk`, `Update`; fake `ClerkDirectory` with call counter)

**Interfaces:**
- Consumes: Task 1 domain, Task 3 ports.
- Produces: `func NewIdentityResolver(users repositories.UserRepository, directory portservices.ClerkDirectory) *IdentityResolver` implementing `portservices.IdentityResolver`.

**Algorithm (signatures are fixed; the body follows this outline):**
- `Resolve`: `GetByClerkID`; hit → `requireActive`. Miss (`ErrNotFound`) → `directory.Profile` (error wrapped `%w`) → `create`. Other repo error → return.
- `Provision`: `GetByClerkID`; hit → return row (no active check); miss → `create`.
- `create(profile)`: loop up to 3 attempts, `users.CreateFromClerk(clerkID, username, email)`:
  - success → return row.
  - `ErrClerkIDTaken` → `GetByClerkID` and return that row (idempotent race/webhook case).
  - `ErrUsernameTaken` and not yet suffixed → `username = profile.DisambiguatedUsername()`, continue.
  - `ErrEmailTaken` and `email != ""` → `link`.
  - else return the error.
- `email == ""` → never take the email path (stored as NULL).
- `link`: `GetByEmail`; if `existing.ClerkUserID == profile.ClerkID` return it; if `existing.ClerkUserID != ""` or `existing.Role == domain.UserRoleSentinel` → return `fmt.Errorf("%w: email belongs to another account", domain.ErrEmailTaken)` and log; else set `ClerkUserID` and `users.Update`.
- `requireActive(u)`: `!u.Active` → `nil, domain.ErrUserInactive`.

- [ ] **Step 1: Write failing tests** (behaviour names are the contract):
  - `TestResolve_NewUserProvisionedFromProfile` — miss → directory called once → created with `LocalUsername()`, `PrimaryEmail()`.
  - `TestResolve_ExistingUserNoDirectoryCall` — hit → directory call count 0, no create.
  - `TestResolve_WebSocketFirstRequestCreatesUser` — same as above on a fresh fake, asserting the user is created (the WS path is the Resolve path).
  - `TestProvision_ExistingRowIsSuccess` — webhook after HTTP: `Provision` returns existing row, no error, no create, directory count 0.
  - `TestProvision_ConcurrentClerkIDConflictReReads` — `CreateFromClerk` returns `ErrClerkIDTaken`; `Provision` returns the row from `GetByClerkID`.
  - `TestResolve_EmailLinkSetsClerkID` — `CreateFromClerk` → `ErrEmailTaken`; `GetByEmail` returns unlinked row; `Update` called with `ClerkUserID` set; returned user is that row.
  - `TestResolve_EmailLinkRefusedWhenRowLinkedElsewhere` — existing row has `ClerkUserID="user_other"`; expect `errors.Is(err, domain.ErrEmailTaken)`, `Update` count 0.
  - `TestResolve_EmailLinkRefusedForSentinel` — existing row role sentinel → refused, `Update` count 0.
  - `TestResolve_UsernameCollisionRetriesWithSuffix` — first `CreateFromClerk` → `ErrUsernameTaken`; second call's username equals `profile.DisambiguatedUsername()`, succeeds.
  - `TestResolve_UsernameAndEmailBothTakenEndsInError` — three attempts exhausted → error `errors.Is(err, domain.ErrAlreadyExists)`; no infinite loop.
  - `TestResolve_NoEmailSkipsEmailPath` — profile without email, `ErrEmailTaken` returned → error (no `GetByEmail` call).
  - `TestResolve_InactiveUserRejected` — hit with `Active=false` → `errors.Is(err, domain.ErrUserInactive)`.
  - `TestResolve_InactiveRowLinkedByEmailRejected` — link path then inactive → `ErrUserInactive`.
  - `TestProvision_InactiveUserReturnedNotRejected` — `Provision` on inactive row returns it with nil error.
  - `TestResolve_DirectoryNotFoundPropagates` — directory returns `ErrNotFound` → `errors.Is(err, domain.ErrNotFound)`, no create.
  - Query budget (Task 4 also pins statement counts with the real GORM repo; see Task 5 test file `test/repositories/identity_query_budget_test.go`, written in this task): existing user via `cached.UserRepository` hit = 0 statements, miss = 1; new user = 2 (`GetByClerkID` + `INSERT`); email link = 4 (`GetByClerkID` + failing `INSERT` + `GetByEmail` + `UPDATE`). Assert each with `querycount.AssertExactly`, and assert the directory call count is 0 on the existing-user path.

- [ ] **Step 2: Run to verify failure.** `go -C <wt>/backend test ./test/services/ -run 'Resolve|Provision' -v` → FAIL (undefined `services.NewIdentityResolver`).
- [ ] **Step 3: Implement** `core/services/identity_resolver.go` per the algorithm above. Logging via `slog` for the refused link and the suffix retry.
- [ ] **Step 4: Run to verify pass.** Same command → PASS; then `go -C <wt>/backend test ./test/repositories/ -run QueryBudget -v` (identity budget tests) → PASS.
- [ ] **Step 5: Commit** `feat(services): add identity resolver with create-on-demand and email linking`.

---

### Task 5: Demo directory decorator

**Files:**
- Create: `backend/internal/demo/identity_directory.go`
- Test: `backend/test/demo/identity_directory_test.go`

**Interfaces:**
- Consumes: `portservices.ClerkDirectory`, `demo.IsDemoClerkID`.
- Produces: `func NewDirectory(inner portservices.ClerkDirectory) portservices.ClerkDirectory`. `Profile` returns `domain.ErrNotFound` for demo IDs without calling `inner`.

- [ ] **Step 1: Failing test** `TestDemoDirectory_NeverFetchesDemoIdentity` (inner counts calls; `demo_alice`-style ID → `ErrNotFound`, count 0) and `TestDemoDirectory_PassesRealIdentityThrough` (`user_123` → inner called once, profile returned).
- [ ] **Step 2: Run → FAIL.** `go -C <wt>/backend test ./test/demo/ -run DemoDirectory -v`
- [ ] **Step 3: Implement** (≈ 25 lines).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(demo): never resolve demo personas through the Clerk directory`.

---

### Task 6: Clerk SDK directory adapter

**Files:**
- Create: `backend/internal/adapters/auth/clerk_directory.go`
- Test: `backend/internal/adapters/auth/clerk_directory_test.go` (reuse the `clerktest` server helper pattern from `clerk_middleware_test.go` `setClerkAPIResponse`; keep that helper in the test file that uses it)

**Interfaces:**
- Produces: `type ClerkDirectory struct{}`; `func NewClerkDirectory() *ClerkDirectory`; `func (ClerkDirectory) Profile(ctx, clerkID) (domain.ClerkProfile, error)` calling `clerkuser.Get`, mapping `Username`, `PrimaryEmailAddressID`, `EmailAddresses` (`ID`, `EmailAddress`) into `domain.ClerkProfile`. A Clerk API error is returned wrapped (`fmt.Errorf("clerk user %s: %w", ...)`).

- [ ] **Step 1: Failing test** `TestClerkDirectory_MapsProfile` (API returns username, two emails, primary id → profile has all fields, `PrimaryEmail()` is the primary) and `TestClerkDirectory_APIErrorPropagates` (404 → error non-nil).
- [ ] **Step 2: Run → FAIL.** `go -C <wt>/backend test ./internal/adapters/auth/ -run ClerkDirectory -v`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(auth): add Clerk SDK profile directory adapter`.

---

### Task 7: HTTP middleware uses the resolver

**Files:**
- Modify: `backend/internal/adapters/auth/clerk_middleware.go` (172 → ~70 lines; no `demo` import, no `strings` error matching, no Clerk SDK user fetch)
- Modify: `backend/internal/adapters/auth/clerk_middleware_test.go` (rewrite around a fake `IdentityResolver`; delete tests whose behaviour moved to Task 4: on-demand creation, duplicate-email link, the `setClerkAPIResponse` helper if unused)
- Modify: `backend/internal/adapters/auth/demo_token_verifier_test.go` (`runDemoMiddleware` uses the fake resolver)

**Interfaces:**
- Produces: `func Middleware(resolver portservices.IdentityResolver, verifier portservices.TokenVerifier) func(http.Handler) http.Handler`; `newAuthHandler(resolver, verifier, next)`.
- Behaviour: verify fails → pass through unauthenticated. `Resolve` error → pass through unauthenticated; `ErrNotFound` logged at Warn ("unknown identity"), `ErrUserInactive` logged at Info, other errors at Error. Success → `withUser` + `withUserRow` as today.

- [ ] **Step 1: Failing tests:** `TestMiddleware_ResolvedUserInjected`, `TestMiddleware_UnknownIdentityIsGuest` (resolver `ErrNotFound`), `TestMiddleware_InactiveUserIsGuest` (resolver `ErrUserInactive`; `ForContext` false), `TestMiddleware_ResolverErrorPassesThrough`, `TestMiddleware_NoClaimsPassThrough`, `TestMiddleware_DemoTokenResolvesSeededPersona` (kept, via fake resolver receiving `demo_<persona>` ID).
- [ ] **Step 2: Run → FAIL.** `go -C <wt>/backend test ./internal/adapters/auth/ -run 'Middleware|NewAuthHandler' -v`
- [ ] **Step 3: Implement** the smaller middleware.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `refactor(auth): HTTP middleware delegates identity resolution`.

---

### Task 8: Webhook uses the resolver and the domain profile

**Files:**
- Modify: `backend/internal/adapters/auth/webhook_handler.go` (156 → ~120 lines)
- Modify: `backend/internal/adapters/auth/webhook_handler_test.go` (`serveWebhook` builds the `WebhookHandler` with a resolver over the stub repo, via `services.NewIdentityResolver` + fake directory that fails the test if called)
- Modify: `backend/internal/adapters/auth/webhook_update_create_fallback_test.go`
- Move: `TestClerkUserData_PrimaryEmail`, `TestClerkUserData_Username` to `backend/test/domain/clerk_profile_test.go` (they now test `ClerkProfile`) — delete the originals.

**Interfaces:**
- Produces: `type WebhookHandler struct { WebhookSecret string; Resolver portservices.IdentityResolver; UserRepo repositories.UserRepository }`.
- Behaviour: `user.created` → `Resolver.Provision(profile)`. `user.updated` → `UserRepo.UpdateByClerkID`; `ErrNotFound` → `Provision`. `user.deleted` unchanged (`DeactivateByClerkID`).
- Status policy (decision, recorded in PR): success or existing row → 200. `ErrAlreadyExists` after the resolver's retries (a permanent username/email conflict that retry cannot fix) → log Error and return **200** so Svix stops retrying. Any other error → 500 (Svix retries).

- [ ] **Step 1: Failing tests:** `TestWebhook_UserCreatedForExistingRowReturnsOK` (the bug: today a 500), `TestWebhook_UserCreatedForInactiveRowReturnsOK`, `TestWebhook_UserCreatedPermanentConflictReturnsOK`, `TestWebhook_UserCreatedTransientErrorReturns500`, `TestWebhook_UserUpdatedNotFoundProvisions`.
- [ ] **Step 2: Run → FAIL.** `go -C <wt>/backend test ./internal/adapters/auth/ -run Webhook -v`
- [ ] **Step 3: Implement** (mapping JSON → `domain.ClerkProfile` in this file; primary email and username from the domain type).
- [ ] **Step 4: Run → PASS.** Also `go -C <wt>/backend test ./test/domain/ -run ClerkProfile -v`.
- [ ] **Step 5: Commit** `fix(auth): webhook user.created is idempotent and uses the shared resolver`.

---

### Task 9: WebSocket InitFunc uses the resolver

**Files:**
- Modify: `backend/internal/server/api.go` (`Deps.UserRepo` → `Deps.Identity portservices.IdentityResolver`; the InitFunc body moves into exported `AuthenticateWebSocket`; `Middleware(d)` passes `d.Identity`)
- Create: `backend/internal/server/websocket_auth.go` (≤ 80 lines)
- Test: `backend/test/server/websocket_auth_test.go`

**Interfaces:**
- Produces: `func AuthenticateWebSocket(ctx context.Context, token string, verifier portservices.TokenVerifier, resolver portservices.IdentityResolver) (*domain.AuthenticatedUser, error)`. Empty token → error; verify error → error; `Resolve` error (including `ErrNotFound`, `ErrUserInactive`) → error with message `unauthenticated websocket: unknown user` for not-found and `unauthenticated websocket: inactive user` for inactive.
- The InitFunc keeps the client-info, presence goroutine and `auth.WithAuthenticatedUser` steps; only the auth block is replaced.

- [ ] **Step 1: Failing tests:** `TestWebSocketAuth_FirstConnectionCreatesUser` (resolver fake creates via the real `services.NewIdentityResolver` over a fake repo + fake directory → user returned), `TestWebSocketAuth_InactiveUserRejected`, `TestWebSocketAuth_InvalidTokenRejected`, `TestWebSocketAuth_MissingTokenRejected`.
- [ ] **Step 2: Run → FAIL.** `go -C <wt>/backend test ./test/server/ -run WebSocketAuth -v`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `fix(server): WebSocket first connection provisions the user like HTTP`.

---

### Task 10: Composition root and harnesses

**Files:**
- Modify: `backend/cmd/server/main.go` (build `services.NewIdentityResolver(userRepo, clerkDir)`, where `clerkDir = auth.NewClerkDirectory()`, wrapped with `demo.NewDirectory` when `demoCfg.Enabled`; pass `Identity:` into `server.Deps` and `auth.WebhookHandler{Resolver:, UserRepo:}`)
- Modify: `backend/test/roundtrips/harness_test.go` (`Identity: services.NewIdentityResolver(userRepo, <fake directory that fails on call>)` replacing `UserRepo` in `Deps`; keep `UserRepo` for other uses)
- Check and modify if needed: `backend/cmd/server/graphql_tracing_integration_test.go`, any `perf`-tagged harness (`grep -rn "server.Deps\|auth.Middleware\|WebhookHandler" <wt>/backend` using the grep tool, not a shell glob).

- [ ] **Step 1:** `go -C <wt>/backend build ./...` → FAIL until wiring is updated (this is the failing test for the wiring).
- [ ] **Step 2:** Update call sites.
- [ ] **Step 3:** `go -C <wt>/backend build ./...` → no output (success). `go -C <wt>/backend vet -tags perf ./internal/perf/...` → clean.
- [ ] **Step 4: Commit** `refactor(server): wire identity resolver into server, webhook and harnesses`.

---

### Task 11: Verification and PR

- [ ] `go -C <wt>/backend build ./...` → no output.
- [ ] `gofmt -l <wt>/backend` → empty.
- [ ] `go -C <wt>/backend test ./...` → all `ok`; record the DB-gated SKIP count with `-v | grep -c SKIP` (run as separate commands).
- [ ] `wc -l` on new files: all < 500; `wc -l` on `clerk_middleware.go`, `webhook_handler.go`, `api.go` does not exceed the pre-change counts (172, 156, 260).
- [ ] Push branch `chore/identity-resolution`; open PR with `gh api` (base `main`, repo `CodeWarrior-debug/perspectize`), body from `.github/` PR template, `Closes #876`, Demo one line ("No visible UI change"), Session Learnings section.
- [ ] `bash .claude/scripts/release-slot.sh 3` from `/Users/jamesjordan/GitHub/perspectize`.
