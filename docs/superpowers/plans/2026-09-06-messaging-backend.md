# Messaging Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend for real-time, persistent user-to-user messaging — group threads, read receipts, typing indicators, presence, reconnect replay, and a hard 1,000-message-per-thread retention cap — exposed as GraphQL subscriptions over WebSocket.

**Architecture:** Messages persist in PostgreSQL with a per-thread monotonic `seq` allocated by a `BEFORE INSERT` trigger. An `AFTER INSERT` trigger fires `pg_notify('thread_events', …)` with a compact `{type, thread_id, seq, message_id}` envelope and prunes rows beyond the newest 1,000. Each Go process runs one dedicated `LISTEN thread_events` connection feeding an in-memory `Hub` that fans events out to GraphQL subscription channels; ephemeral signals (typing, presence) ride the same NOTIFY channel without a row. Clerk auth is refactored behind a `TokenVerifier` port so the WebSocket `InitFunc` and the HTTP middleware share one verification path — and tests can inject fake identities.

**Tech Stack:** Go 1.25 (toolchain 1.26), gqlgen v0.17.91 (schema-first), GORM + `jackc/pgx/v5`, PostgreSQL 17, `golang-migrate`, chi v5, Clerk SDK v2, testify, `log/slog`.

**Spec:** `docs/superpowers/specs/2026-09-06-messaging-architecture-design.md` — read it alongside this plan.

## Global Constraints

- Module path: `github.com/CodeWarrior-debug/perspectize/backend`. All imports use this prefix.
- Hexagonal layering: `internal/core/domain` is pure Go (no GORM, no gqlgen, no pgx imports). Ports in `internal/core/ports/`. Services in `internal/core/services/`. Infrastructure in `internal/adapters/`. Dependencies point inward only.
- GORM "separate model" pattern: domain structs never carry `gorm:` tags. GORM structs live in `internal/adapters/repositories/postgres/gorm_models.go` with a `TableName()` method; bidirectional mappers live beside them.
- Every repository/service port implementation has a compile-time interface check: `var _ ports.X = (*Impl)(nil)`.
- Enums: UPPERCASE string constants in `internal/core/domain`, bound in `gqlgen.yml` under `models:`. Never write switch statements for enum conversion.
- DB-dependent tests skip (not fail) when no database is reachable: `if err != nil { t.Skip("Skipping - PostgreSQL not available") }`. Follow the pattern in `test/database/postgres_test.go`.
- Timestamps are exposed in GraphQL as `String!` (RFC3339), matching every existing type in `schema.graphql`.
- Migration files: `golang-migrate`, sequential numeric prefix. Highest existing is `000016`; new files start at `000017`. **Before creating them, run `ls backend/migrations/ | tail -5` to confirm nothing landed in between.**
- No chained shell commands with `&&` — run each as a separate command.
- After any `schema.graphql` change, run `make graphql-gen` from `backend/` and commit the regenerated `internal/adapters/graphql/generated/generated.go` and `internal/adapters/graphql/model/models_gen.go`.
- Commit message footer for every commit in this plan:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01AMzMYxN9wh1wmKVQorbcyb
  ```
- Body size cap for a message: **8 KB** (`len([]byte(body)) > 8192` → reject). Send rate limit: **10 messages per 10 seconds per user**. Retention: newest **1000** messages per thread; prune check runs when `seq % 50 == 0`. Presence offline grace: **15 s**. Presence heartbeat: **20 s**; presence entry expiry: **45 s**. Subscriber channel buffer: **64**.
- All work happens in the existing worktree at `.claude/worktrees/feature+messaging-architecture-research`. Run commands from its `backend/` directory.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `backend/migrations/000017_add_messaging.up.sql` / `.down.sql` | Tables `message_threads`, `thread_participants`, `messages`, `thread_sequences`; the three trigger functions + triggers. |
| `backend/internal/core/domain/messaging.go` | Domain structs (`MessageThread`, `ThreadParticipant`, `Message`) and enums (`ThreadRole`, `PresenceState`). Pure Go. |
| `backend/internal/core/domain/realtime.go` | Transport-agnostic realtime event structs (`ThreadEvent` and its variants, `InboxEvent`, `EventEnvelope`) and the `Identity` struct. |
| `backend/internal/core/ports/services/token_verifier.go` | `TokenVerifier` interface. |
| `backend/internal/core/ports/repositories/thread_repository.go` | `ThreadRepository` interface. |
| `backend/internal/core/ports/repositories/message_repository.go` | `MessageRepository` interface. |
| `backend/internal/core/ports/services/messaging_service.go` | `MessagingService` interface + input structs + `EventPublisher` interface. |
| `backend/internal/core/services/messaging_service.go` | `MessagingServiceImpl` — business logic, authorization, rate limiting, idempotency. |
| `backend/internal/core/services/ratelimit.go` | Tiny in-memory per-key token bucket used by the service. |
| `backend/internal/adapters/auth/token_verifier.go` | `ClerkTokenVerifier` implementing `TokenVerifier` over the Clerk SDK. |
| `backend/internal/adapters/repositories/postgres/gorm_thread_repository.go` | `GormThreadRepository`. |
| `backend/internal/adapters/repositories/postgres/gorm_message_repository.go` | `GormMessageRepository`. |
| `backend/internal/adapters/realtime/hub.go` | `Hub` — subscriber registry, fan-out, backpressure, `EventPublisher` impl. |
| `backend/internal/adapters/realtime/listener.go` | `pgListener` — dedicated `pgx` `LISTEN thread_events` loop with reconnect. |
| `backend/internal/adapters/realtime/presence.go` | `presenceTracker` — connection counts, grace timer, heartbeat expiry, `clock` seam. |
| `backend/internal/adapters/graphql/resolvers/messaging.resolvers.go` | Query/Mutation/Subscription resolvers (created by `make graphql-gen`, then filled in). |
| `backend/test/services/messaging_service_test.go` | Service unit tests (mock repos + mock publisher). |
| `backend/test/realtime/hub_test.go` | Hub unit tests (in-memory, no DB). |
| `backend/test/realtime/presence_test.go` | Presence unit tests (fake clock). |
| `backend/test/repositories/gorm_thread_repository_test.go` | DB-gated thread repo tests. |
| `backend/test/repositories/gorm_message_repository_test.go` | DB-gated message repo tests (seq trigger, replay, retention). |
| `backend/test/messaging/e2e_test.go` | DB-gated end-to-end: two users chatting, reconnect replay, read receipts, cross-instance, idempotency. |

**Modified:**

| Path | Change |
|---|---|
| `backend/schema.graphql` | Add messaging types, inputs, `extend type Query/Mutation/Subscription`. |
| `backend/gqlgen.yml` | Bind `ThreadRole`, `PresenceState` to domain enums. |
| `backend/internal/adapters/auth/clerk_middleware.go` | Refactor to consume `TokenVerifier` (keep existing behaviour). |
| `backend/internal/adapters/graphql/resolvers/resolver.go` | Add `MessagingService` + `*realtime.Hub` fields + constructor params. |
| `backend/cmd/server/main.go` | Construct repos/service/hub/listener; add `transport.Websocket` with `InitFunc`; start + graceful-stop the listener. |
| `backend/go.mod` / `go.sum` | Add `github.com/jackc/pgx/v5/pgxpool` usage (pgx/v5 already required). |

---

## Task 1: Messaging database migration

**Files:**
- Create: `backend/migrations/000017_add_messaging.up.sql`
- Create: `backend/migrations/000017_add_messaging.down.sql`
- Test: manual apply/rollback/apply against the dev DB (migrations are SQL, run by the `migrate` CLI)

**Interfaces:**
- Consumes: nothing.
- Produces: tables `message_threads(id BIGSERIAL, title TEXT NULL, created_by BIGINT, last_message_at TIMESTAMPTZ, created_at TIMESTAMPTZ)`; `thread_participants(thread_id BIGINT, user_id BIGINT, role TEXT, last_read_seq BIGINT, muted BOOL, joined_at TIMESTAMPTZ, left_at TIMESTAMPTZ NULL, PK(thread_id,user_id))`; `messages(id BIGSERIAL PK, thread_id BIGINT, sender_id BIGINT, seq BIGINT, body TEXT, client_nonce TEXT, created_at TIMESTAMPTZ, edited_at TIMESTAMPTZ NULL, deleted_at TIMESTAMPTZ NULL)`; `thread_sequences(thread_id BIGINT PK, next_seq BIGINT)`. Postgres NOTIFY channel name: `thread_events`.

- [ ] **Step 1: Confirm the next migration number**

Run: `ls backend/migrations/ | tail -5`
Expected: highest prefix is `000016`. If something is `000017+`, use the next free number everywhere below.

- [ ] **Step 2: Write `000017_add_messaging.up.sql`**

```sql
-- Messaging: threads, participants, messages, per-thread sequence, triggers.

CREATE TABLE message_threads (
    id              BIGSERIAL PRIMARY KEY,
    title           TEXT,
    created_by      BIGINT NOT NULL REFERENCES users(id),
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE thread_participants (
    thread_id     BIGINT NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
    user_id       BIGINT NOT NULL REFERENCES users(id),
    role          TEXT   NOT NULL DEFAULT 'MEMBER',
    last_read_seq BIGINT NOT NULL DEFAULT 0,
    muted         BOOLEAN NOT NULL DEFAULT FALSE,
    joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at       TIMESTAMPTZ,
    PRIMARY KEY (thread_id, user_id)
);

CREATE INDEX idx_thread_participants_active_user
    ON thread_participants (user_id) WHERE left_at IS NULL;

CREATE TABLE thread_sequences (
    thread_id BIGINT PRIMARY KEY REFERENCES message_threads(id) ON DELETE CASCADE,
    next_seq  BIGINT NOT NULL DEFAULT 1
);

CREATE TABLE messages (
    id           BIGSERIAL PRIMARY KEY,
    thread_id    BIGINT NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
    sender_id    BIGINT NOT NULL REFERENCES users(id),
    seq          BIGINT NOT NULL,
    body         TEXT   NOT NULL,
    client_nonce TEXT   NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    edited_at    TIMESTAMPTZ,
    deleted_at   TIMESTAMPTZ,
    UNIQUE (thread_id, seq),
    UNIQUE (thread_id, sender_id, client_nonce)
);

CREATE INDEX idx_messages_thread_seq_desc ON messages (thread_id, seq DESC);

-- Create the per-thread sequence row when a thread is created.
CREATE FUNCTION init_thread_sequence() RETURNS trigger AS $$
BEGIN
    INSERT INTO thread_sequences (thread_id, next_seq) VALUES (NEW.id, 1);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_init_thread_sequence
    AFTER INSERT ON message_threads
    FOR EACH ROW EXECUTE FUNCTION init_thread_sequence();

-- Allocate the next per-thread seq atomically before insert.
CREATE FUNCTION assign_message_seq() RETURNS trigger AS $$
BEGIN
    UPDATE thread_sequences
       SET next_seq = next_seq + 1
     WHERE thread_id = NEW.thread_id
    RETURNING next_seq - 1 INTO NEW.seq;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'no thread_sequences row for thread %', NEW.thread_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assign_message_seq
    BEFORE INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION assign_message_seq();

-- After insert: publish a compact NOTIFY envelope and prune old rows.
CREATE FUNCTION publish_and_prune_message() RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('thread_events', json_build_object(
        'type',       'MESSAGE_POSTED',
        'thread_id',  NEW.thread_id,
        'seq',        NEW.seq,
        'message_id', NEW.id
    )::text);

    IF NEW.seq % 50 = 0 THEN
        DELETE FROM messages
         WHERE thread_id = NEW.thread_id
           AND seq <= NEW.seq - 1000;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_publish_and_prune_message
    AFTER INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION publish_and_prune_message();

-- Keep message_threads.last_message_at fresh for inbox sorting.
CREATE FUNCTION touch_thread_last_message() RETURNS trigger AS $$
BEGIN
    UPDATE message_threads SET last_message_at = NEW.created_at WHERE id = NEW.thread_id;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_touch_thread_last_message
    AFTER INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION touch_thread_last_message();
```

- [ ] **Step 3: Write `000017_add_messaging.down.sql`**

```sql
DROP TRIGGER IF EXISTS trg_touch_thread_last_message ON messages;
DROP TRIGGER IF EXISTS trg_publish_and_prune_message ON messages;
DROP TRIGGER IF EXISTS trg_assign_message_seq ON messages;
DROP TRIGGER IF EXISTS trg_init_thread_sequence ON message_threads;
DROP FUNCTION IF EXISTS touch_thread_last_message();
DROP FUNCTION IF EXISTS publish_and_prune_message();
DROP FUNCTION IF EXISTS assign_message_seq();
DROP FUNCTION IF EXISTS init_thread_sequence();
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS thread_sequences;
DROP TABLE IF EXISTS thread_participants;
DROP TABLE IF EXISTS message_threads;
```

- [ ] **Step 4: Apply, roll back, re-apply against the dev DB**

Run: `cd backend && make migrate-up`
Expected: `000017` applied, no error.

Run: `cd backend && make migrate-down`
Expected: rolls back `000017` cleanly.

Run: `cd backend && make migrate-up`
Expected: re-applies cleanly (proves down is complete).

- [ ] **Step 5: Smoke-test the seq + notify triggers with psql**

Run this against the dev DB (use `$DATABASE_URL`):

```sql
INSERT INTO users (username) VALUES ('mtest1') RETURNING id;  -- note id A
INSERT INTO users (username) VALUES ('mtest2') RETURNING id;  -- note id B
INSERT INTO message_threads (created_by) VALUES (:A) RETURNING id;  -- note id T
SELECT * FROM thread_sequences WHERE thread_id = :T;  -- expect next_seq = 1
INSERT INTO messages (thread_id, sender_id, body, client_nonce) VALUES (:T, :A, 'hi', 'n1') RETURNING seq;   -- expect 1
INSERT INTO messages (thread_id, sender_id, body, client_nonce) VALUES (:T, :B, 'yo', 'n2') RETURNING seq;   -- expect 2
```

Expected: seqs are `1` then `2`; `thread_sequences.next_seq` is now `3`. Then clean up (`DELETE FROM message_threads WHERE id = :T; DELETE FROM users WHERE id IN (:A,:B);`).

- [ ] **Step 6: Commit**

```bash
git add backend/migrations/000017_add_messaging.up.sql backend/migrations/000017_add_messaging.down.sql
git commit -m "feat(messaging): add threads/participants/messages schema and triggers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AMzMYxN9wh1wmKVQorbcyb"
```

---

## Task 2: Domain models and enums

**Files:**
- Create: `backend/internal/core/domain/messaging.go`
- Create: `backend/internal/core/domain/realtime.go`
- Test: `backend/test/domain/messaging_test.go`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `domain.ThreadRole` (`ThreadRoleOwner = "OWNER"`, `ThreadRoleMember = "MEMBER"`), `domain.PresenceState` (`PresenceOnline = "ONLINE"`, `PresenceOffline = "OFFLINE"`).
  - `domain.MessageThread{ID int; Title *string; CreatedBy int; LastMessageAt time.Time; CreatedAt time.Time; Participants []ThreadParticipant}`
  - `domain.ThreadParticipant{ThreadID int; UserID int; Role ThreadRole; LastReadSeq int64; Muted bool; JoinedAt time.Time; LeftAt *time.Time}`
  - `domain.Message{ID int64; ThreadID int; SenderID int; Seq int64; Body string; ClientNonce string; CreatedAt time.Time}`
  - `domain.Identity{UserID int; ClerkID string; Username string}`
  - `domain.EventEnvelope{Type string; ThreadID int; Seq int64; MessageID int64}` — decoded NOTIFY payload.
  - Realtime event structs: `domain.MessagePostedEvent{Message Message}`, `domain.ReadReceiptChangedEvent{ThreadID, UserID int; LastReadSeq int64}`, `domain.TypingChangedEvent{ThreadID, UserID int; Typing bool}`, `domain.ParticipantChangedEvent{ThreadID, UserID int; Change string /* "ADDED"|"REMOVED" */}`, `domain.PresenceChangedEvent{ThreadID, UserID int; State PresenceState}`, `domain.StreamResetEvent{ThreadID int}`.
  - `domain.ThreadEvent` interface with unexported marker method `isThreadEvent()`, implemented by all six event structs.
  - `domain.InboxEvent{ThreadID int; LastMessageAt time.Time; LatestSeq int64; UnreadCount int}`
  - Sentinel: `domain.ErrForbidden = errors.New("access denied")`, `domain.ErrRateLimited = errors.New("rate limit exceeded")` added to `domain/errors.go`.

- [ ] **Step 1: Write the failing test**

`backend/test/domain/messaging_test.go`:

```go
package domain_test

import (
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
)

func TestThreadRoleValues(t *testing.T) {
	assert.Equal(t, domain.ThreadRole("OWNER"), domain.ThreadRoleOwner)
	assert.Equal(t, domain.ThreadRole("MEMBER"), domain.ThreadRoleMember)
}

func TestPresenceStateValues(t *testing.T) {
	assert.Equal(t, domain.PresenceState("ONLINE"), domain.PresenceOnline)
	assert.Equal(t, domain.PresenceState("OFFLINE"), domain.PresenceOffline)
}

func TestThreadEventMarker(t *testing.T) {
	var evts []domain.ThreadEvent = []domain.ThreadEvent{
		domain.MessagePostedEvent{},
		domain.ReadReceiptChangedEvent{},
		domain.TypingChangedEvent{},
		domain.ParticipantChangedEvent{},
		domain.PresenceChangedEvent{},
		domain.StreamResetEvent{},
	}
	assert.Len(t, evts, 6)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./test/domain/ -run TestThreadRole -v`
Expected: FAIL — `undefined: domain.ThreadRoleOwner`.

- [ ] **Step 3: Write `domain/messaging.go`**

```go
package domain

import "time"

type ThreadRole string

const (
	ThreadRoleOwner  ThreadRole = "OWNER"
	ThreadRoleMember ThreadRole = "MEMBER"
)

type PresenceState string

const (
	PresenceOnline  PresenceState = "ONLINE"
	PresenceOffline PresenceState = "OFFLINE"
)

type MessageThread struct {
	ID            int
	Title         *string
	CreatedBy     int
	LastMessageAt time.Time
	CreatedAt     time.Time
	Participants  []ThreadParticipant
}

type ThreadParticipant struct {
	ThreadID    int
	UserID      int
	Role        ThreadRole
	LastReadSeq int64
	Muted       bool
	JoinedAt    time.Time
	LeftAt      *time.Time
}

func (t MessageThread) IsActiveParticipant(userID int) bool {
	for _, p := range t.Participants {
		if p.UserID == userID && p.LeftAt == nil {
			return true
		}
	}
	return false
}

type Message struct {
	ID          int64
	ThreadID    int
	SenderID    int
	Seq         int64
	Body        string
	ClientNonce string
	CreatedAt   time.Time
}
```

- [ ] **Step 4: Write `domain/realtime.go`**

```go
package domain

import "time"

// Identity is the authenticated principal, resolved from a Clerk token by a
// TokenVerifier. It is transport-agnostic (HTTP middleware and the WebSocket
// InitFunc both produce it).
type Identity struct {
	UserID   int
	ClerkID  string
	Username string
}

// EventEnvelope is the decoded pg_notify('thread_events', ...) payload.
type EventEnvelope struct {
	Type      string `json:"type"`
	ThreadID  int    `json:"thread_id"`
	Seq       int64  `json:"seq"`
	MessageID int64  `json:"message_id"`
	// Ephemeral-only fields (absent for MESSAGE_POSTED):
	UserID      int    `json:"user_id,omitempty"`
	Typing      bool   `json:"typing,omitempty"`
	LastReadSeq int64  `json:"last_read_seq,omitempty"`
	Change      string `json:"change,omitempty"`
	State       string `json:"state,omitempty"`
}

type ThreadEvent interface{ isThreadEvent() }

type MessagePostedEvent struct{ Message Message }
type ReadReceiptChangedEvent struct {
	ThreadID    int
	UserID      int
	LastReadSeq int64
}
type TypingChangedEvent struct {
	ThreadID int
	UserID   int
	Typing   bool
}
type ParticipantChangedEvent struct {
	ThreadID int
	UserID   int
	Change   string // "ADDED" | "REMOVED"
}
type PresenceChangedEvent struct {
	ThreadID int
	UserID   int
	State    PresenceState
}
type StreamResetEvent struct{ ThreadID int }

func (MessagePostedEvent) isThreadEvent()      {}
func (ReadReceiptChangedEvent) isThreadEvent() {}
func (TypingChangedEvent) isThreadEvent()      {}
func (ParticipantChangedEvent) isThreadEvent() {}
func (PresenceChangedEvent) isThreadEvent()    {}
func (StreamResetEvent) isThreadEvent()        {}

type InboxEvent struct {
	ThreadID      int
	LastMessageAt time.Time
	LatestSeq     int64
	UnreadCount   int
}
```

- [ ] **Step 5: Add sentinels to `domain/errors.go`**

Add to the `var (...)` block:

```go
	ErrForbidden   = errors.New("access denied")
	ErrRateLimited = errors.New("rate limit exceeded")
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && go test ./test/domain/ -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/internal/core/domain/messaging.go backend/internal/core/domain/realtime.go backend/internal/core/domain/errors.go backend/test/domain/messaging_test.go
git commit -m "feat(messaging): domain models, realtime events, error sentinels

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AMzMYxN9wh1wmKVQorbcyb"
```

---

## Task 3: TokenVerifier port + Clerk adapter + middleware refactor

**Files:**
- Create: `backend/internal/core/ports/services/token_verifier.go`
- Create: `backend/internal/adapters/auth/token_verifier.go`
- Modify: `backend/internal/adapters/auth/clerk_middleware.go`
- Test: `backend/internal/adapters/auth/token_verifier_test.go`

**Interfaces:**
- Consumes: `domain.Identity` (Task 2).
- Produces:
  - `portservices.TokenVerifier interface { Verify(ctx context.Context, token string) (domain.Identity, error) }`
  - `auth.ClerkTokenVerifier` implementing it (returns `domain.Identity{ClerkID: claims.Subject}` — the `UserID`/`Username` are `0`/`""` here; local-user resolution stays in the middleware/InitFunc which already has `userRepo`).
  - `auth.NewClerkTokenVerifier() *ClerkTokenVerifier`
  - Exported test helper `auth.WithIdentity(ctx, domain.Identity) context.Context` and `auth.IdentityForContext(ctx) (domain.Identity, bool)` — thin wrappers reusing the existing `authContextKey`/`AuthenticatedUser` path is NOT required; keep using `domain.AuthenticatedUser` for HTTP as today. `Identity` is only the verifier's return type.

- [ ] **Step 1: Write the failing test**

`backend/internal/adapters/auth/token_verifier_test.go`:

```go
package auth

import (
	"context"
	"testing"

	"github.com/clerk/clerk-sdk-go/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestClerkTokenVerifier_UsesSessionClaimsFromContext(t *testing.T) {
	// The verifier is a thin wrapper: given a context that already carries
	// Clerk session claims (as clerkhttp middleware would set), Verify returns
	// an Identity with the Clerk subject.
	v := NewClerkTokenVerifier()
	ctx := clerk.ContextWithSessionClaims(context.Background(), &clerk.SessionClaims{
		RegisteredClaims: clerk.RegisteredClaims{Subject: "user_abc123"},
	})

	id, err := v.Verify(ctx, "ignored-when-claims-present")
	require.NoError(t, err)
	assert.Equal(t, "user_abc123", id.ClerkID)
}

func TestClerkTokenVerifier_NoClaims_Errors(t *testing.T) {
	v := NewClerkTokenVerifier()
	_, err := v.Verify(context.Background(), "")
	assert.Error(t, err)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/adapters/auth/ -run TestClerkTokenVerifier -v`
Expected: FAIL — `undefined: NewClerkTokenVerifier`.

- [ ] **Step 3: Write the port**

`backend/internal/core/ports/services/token_verifier.go`:

```go
package services

import (
	"context"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// TokenVerifier turns a bearer token into a verified Identity.
// Implementations may also accept a context that already carries verified
// session claims (set by upstream middleware) and skip re-verification.
type TokenVerifier interface {
	Verify(ctx context.Context, token string) (domain.Identity, error)
}
```

- [ ] **Step 4: Write the Clerk adapter**

`backend/internal/adapters/auth/token_verifier.go`:

```go
package auth

import (
	"context"
	"errors"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/clerk/clerk-sdk-go/v2"
	clerkjwt "github.com/clerk/clerk-sdk-go/v2/jwt"
)

type ClerkTokenVerifier struct{}

var _ portservices.TokenVerifier = (*ClerkTokenVerifier)(nil)

func NewClerkTokenVerifier() *ClerkTokenVerifier { return &ClerkTokenVerifier{} }

// Verify prefers session claims already on the context (HTTP path, where
// clerkhttp.WithHeaderAuthorization has run). Falling back to verifying the
// raw token supports the WebSocket InitFunc, which has no HTTP middleware.
func (v *ClerkTokenVerifier) Verify(ctx context.Context, token string) (domain.Identity, error) {
	if claims, ok := clerk.SessionClaimsFromContext(ctx); ok && claims != nil {
		return domain.Identity{ClerkID: claims.Subject}, nil
	}
	if token == "" {
		return domain.Identity{}, errors.New("no session claims and no token")
	}
	claims, err := clerkjwt.Verify(ctx, &clerkjwt.VerifyParams{Token: token})
	if err != nil {
		return domain.Identity{}, err
	}
	return domain.Identity{ClerkID: claims.Subject}, nil
}
```

Note: if `clerkjwt.Verify`'s signature differs in `clerk-sdk-go/v2 v2.7.0`, adjust to the SDK — the contract is "raw token in, subject out". Check `go doc github.com/clerk/clerk-sdk-go/v2/jwt.Verify`.

- [ ] **Step 5: Refactor the middleware to consume the port**

In `clerk_middleware.go`, change `Middleware` to accept a verifier and use it for the subject lookup instead of reading `clerk.SessionClaimsFromContext` directly. Keep every existing branch (on-demand create, email link, permissive fallthrough) unchanged — only the "get the Clerk subject" line moves behind `verifier.Verify`:

```go
func Middleware(userRepo repositories.UserRepository, verifier portservices.TokenVerifier) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return clerkhttp.WithHeaderAuthorization()(newAuthHandler(userRepo, verifier, next))
	}
}
```

In `newAuthHandler`, replace:

```go
claims, ok := clerk.SessionClaimsFromContext(r.Context())
if !ok || claims == nil { next.ServeHTTP(w, r); return }
clerkUserID := claims.Subject
```

with:

```go
id, err := verifier.Verify(r.Context(), "")
if err != nil || id.ClerkID == "" {
	next.ServeHTTP(w, r)
	return
}
clerkUserID := id.ClerkID
```

Update `clerk_middleware_test.go` call sites to pass `NewClerkTokenVerifier()`.

- [ ] **Step 6: Update `main.go` call site**

`r.Use(auth.Middleware(userRepo))` → `r.Use(auth.Middleware(userRepo, auth.NewClerkTokenVerifier()))`.

- [ ] **Step 7: Run tests**

Run: `cd backend && go test ./internal/adapters/auth/ -v`
Expected: PASS (new + existing).

Run: `cd backend && go build ./...`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add backend/internal/core/ports/services/token_verifier.go backend/internal/adapters/auth/ backend/cmd/server/main.go
git commit -m "refactor(auth): introduce TokenVerifier port behind Clerk middleware

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AMzMYxN9wh1wmKVQorbcyb"
```

---

## Task 4: Repository ports + GORM models + mappers

**Files:**
- Create: `backend/internal/core/ports/repositories/thread_repository.go`
- Create: `backend/internal/core/ports/repositories/message_repository.go`
- Modify: `backend/internal/adapters/repositories/postgres/gorm_models.go`
- Create: `backend/internal/adapters/repositories/postgres/gorm_messaging_mappers.go`
- Test: `backend/internal/adapters/repositories/postgres/gorm_messaging_mappers_test.go`

**Interfaces:**
- Consumes: `domain.MessageThread`, `domain.ThreadParticipant`, `domain.Message` (Task 2).
- Produces:
  - `repositories.ThreadRepository`:
    ```go
    CreateThread(ctx, createdBy int, title *string, participantUserIDs []int) (*domain.MessageThread, error)
    GetThread(ctx, threadID int) (*domain.MessageThread, error)                       // includes Participants
    FindDirectThread(ctx, userA, userB int) (*domain.MessageThread, error)            // 2-participant thread, ErrNotFound if none
    ListThreadsForUser(ctx, userID int, limit int, beforeLastMessageAt *time.Time) ([]domain.MessageThread, error)  // desc by last_message_at
    AddParticipants(ctx, threadID int, userIDs []int) error
    SetLeft(ctx, threadID, userID int, at time.Time) error
    SetLastRead(ctx, threadID, userID int, seq int64) error                           // moves forward only
    ```
  - `repositories.MessageRepository`:
    ```go
    Insert(ctx, m *domain.Message) (*domain.Message, error)   // seq assigned by DB trigger; on unique (thread,sender,nonce) conflict returns the existing row
    GetByID(ctx, id int64) (*domain.Message, error)
    ListHistory(ctx, threadID int, limit int, beforeSeq *int64) ([]domain.Message, error)   // desc by seq, for backward paging
    ListSince(ctx, threadID int, sinceSeq int64) ([]domain.Message, error)                  // asc by seq, for replay
    MaxSeq(ctx, threadID int) (int64, error)                                                // 0 if empty
    ```
  - GORM models `MessageThreadModel` (`message_threads`), `ThreadParticipantModel` (`thread_participants`), `MessageModel` (`messages`), each with `TableName()`.
  - Mapper funcs: `messageThreadModelToDomain`, `threadParticipantModelToDomain`, `messageModelToDomain`, `messageDomainToModel`.

- [ ] **Step 1: Write the failing mapper test**

`gorm_messaging_mappers_test.go`:

```go
package postgres

import (
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
)

func TestMessageMapperRoundTrip(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Second)
	d := &domain.Message{
		ID: 7, ThreadID: 3, SenderID: 5, Seq: 42,
		Body: "hello", ClientNonce: "n-1", CreatedAt: now,
	}
	m := messageDomainToModel(d)
	assert.Equal(t, int64(7), m.ID)
	assert.Equal(t, "hello", m.Body)

	back := messageModelToDomain(m)
	assert.Equal(t, d.ThreadID, back.ThreadID)
	assert.Equal(t, d.Seq, back.Seq)
	assert.Equal(t, d.ClientNonce, back.ClientNonce)
	assert.Equal(t, now, back.CreatedAt.UTC())
}

func TestThreadParticipantMapper(t *testing.T) {
	left := time.Now().UTC()
	m := &ThreadParticipantModel{
		ThreadID: 1, UserID: 2, Role: "OWNER", LastReadSeq: 9, LeftAt: &left,
	}
	d := threadParticipantModelToDomain(m)
	assert.Equal(t, domain.ThreadRoleOwner, d.Role)
	assert.Equal(t, int64(9), d.LastReadSeq)
	assert.NotNil(t, d.LeftAt)
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && go test ./internal/adapters/repositories/postgres/ -run TestMessageMapper -v`
Expected: FAIL — undefined symbols.

- [ ] **Step 3: Add GORM models to `gorm_models.go`**

```go
// MessageThreadModel is the GORM model for message_threads.
type MessageThreadModel struct {
	ID            int64     `gorm:"primaryKey;autoIncrement"`
	Title         *string   `gorm:"column:title"`
	CreatedBy     int64     `gorm:"column:created_by;not null"`
	LastMessageAt time.Time `gorm:"column:last_message_at"`
	CreatedAt     time.Time `gorm:"column:created_at;autoCreateTime"`
}

func (MessageThreadModel) TableName() string { return "message_threads" }

// ThreadParticipantModel is the GORM model for thread_participants.
type ThreadParticipantModel struct {
	ThreadID    int64      `gorm:"column:thread_id;primaryKey"`
	UserID      int64      `gorm:"column:user_id;primaryKey"`
	Role        string     `gorm:"column:role;not null;default:MEMBER"`
	LastReadSeq int64      `gorm:"column:last_read_seq;not null;default:0"`
	Muted       bool       `gorm:"column:muted;not null;default:false"`
	JoinedAt    time.Time  `gorm:"column:joined_at;autoCreateTime"`
	LeftAt      *time.Time `gorm:"column:left_at"`
}

func (ThreadParticipantModel) TableName() string { return "thread_participants" }

// MessageModel is the GORM model for messages.
type MessageModel struct {
	ID          int64      `gorm:"primaryKey;autoIncrement"`
	ThreadID    int64      `gorm:"column:thread_id;not null"`
	SenderID    int64      `gorm:"column:sender_id;not null"`
	Seq         int64      `gorm:"column:seq"` // assigned by DB trigger; do not set on insert
	Body        string     `gorm:"column:body;not null"`
	ClientNonce string     `gorm:"column:client_nonce;not null"`
	CreatedAt   time.Time  `gorm:"column:created_at;autoCreateTime"`
	EditedAt    *time.Time `gorm:"column:edited_at"`
	DeletedAt   *time.Time `gorm:"column:deleted_at"`
}

func (MessageModel) TableName() string { return "messages" }
```

- [ ] **Step 4: Write `gorm_messaging_mappers.go`**

```go
package postgres

import "github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"

func messageModelToDomain(m *MessageModel) domain.Message {
	return domain.Message{
		ID: m.ID, ThreadID: int(m.ThreadID), SenderID: int(m.SenderID),
		Seq: m.Seq, Body: m.Body, ClientNonce: m.ClientNonce, CreatedAt: m.CreatedAt,
	}
}

func messageDomainToModel(d *domain.Message) *MessageModel {
	return &MessageModel{
		ID: d.ID, ThreadID: int64(d.ThreadID), SenderID: int64(d.SenderID),
		Body: d.Body, ClientNonce: d.ClientNonce,
	}
}

func threadParticipantModelToDomain(m *ThreadParticipantModel) domain.ThreadParticipant {
	return domain.ThreadParticipant{
		ThreadID: int(m.ThreadID), UserID: int(m.UserID),
		Role: domain.ThreadRole(m.Role), LastReadSeq: m.LastReadSeq,
		Muted: m.Muted, JoinedAt: m.JoinedAt, LeftAt: m.LeftAt,
	}
}

func messageThreadModelToDomain(m *MessageThreadModel, parts []ThreadParticipantModel) domain.MessageThread {
	t := domain.MessageThread{
		ID: int(m.ID), Title: m.Title, CreatedBy: int(m.CreatedBy),
		LastMessageAt: m.LastMessageAt, CreatedAt: m.CreatedAt,
	}
	for i := range parts {
		t.Participants = append(t.Participants, threadParticipantModelToDomain(&parts[i]))
	}
	return t
}
```

- [ ] **Step 5: Write the port files**

`thread_repository.go` and `message_repository.go` — the interface blocks from the **Interfaces** section above, each in `package repositories`, importing `context`, `time`, and `domain`.

- [ ] **Step 6: Run the mapper test**

Run: `cd backend && go test ./internal/adapters/repositories/postgres/ -run "TestMessageMapper|TestThreadParticipantMapper" -v`
Expected: PASS.

Run: `cd backend && go build ./...`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add backend/internal/core/ports/repositories/thread_repository.go backend/internal/core/ports/repositories/message_repository.go backend/internal/adapters/repositories/postgres/gorm_models.go backend/internal/adapters/repositories/postgres/gorm_messaging_mappers.go backend/internal/adapters/repositories/postgres/gorm_messaging_mappers_test.go
git commit -m "feat(messaging): repository ports, GORM models, mappers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AMzMYxN9wh1wmKVQorbcyb"
```

---

## Task 5: GormThreadRepository

**Files:**
- Create: `backend/internal/adapters/repositories/postgres/gorm_thread_repository.go`
- Test: `backend/test/repositories/gorm_thread_repository_test.go`

**Interfaces:**
- Consumes: `repositories.ThreadRepository` (Task 4), GORM models/mappers (Task 4).
- Produces: `postgres.NewGormThreadRepository(db *gorm.DB) *GormThreadRepository` with `var _ repositories.ThreadRepository = (*GormThreadRepository)(nil)`.

- [ ] **Step 1: Write the failing DB-gated test**

`backend/test/repositories/gorm_thread_repository_test.go` — establish a shared helper `openTestDB(t)` (copy the connect-or-skip pattern from `test/database/postgres_test.go`, reading `DATABASE_URL`; `t.Skip` if unreachable). Then:

```go
func TestGormThreadRepository_CreateAndGet(t *testing.T) {
	db := openTestDB(t)
	repo := postgres.NewGormThreadRepository(db)
	userRepo := postgres.NewGormUserRepository(db)
	ctx := context.Background()

	a := mustCreateUser(t, userRepo, "thr-a")
	b := mustCreateUser(t, userRepo, "thr-b")
	t.Cleanup(func() { cleanupUsers(t, db, a, b) })

	thread, err := repo.CreateThread(ctx, a, nil, []int{a, b})
	require.NoError(t, err)
	assert.NotZero(t, thread.ID)
	assert.Len(t, thread.Participants, 2)

	got, err := repo.GetThread(ctx, thread.ID)
	require.NoError(t, err)
	assert.True(t, got.IsActiveParticipant(a))
	assert.True(t, got.IsActiveParticipant(b))
}

func TestGormThreadRepository_FindDirectThread(t *testing.T) {
	// CreateThread(a, nil, {a,b}) then FindDirectThread(a,b) returns it;
	// FindDirectThread(a, c) returns domain.ErrNotFound.
}

func TestGormThreadRepository_SetLastRead_ForwardOnly(t *testing.T) {
	// SetLastRead(t, a, 5) then SetLastRead(t, a, 3) leaves last_read_seq at 5.
}

func TestGormThreadRepository_SetLeft_ExcludesFromActive(t *testing.T) {
	// After SetLeft(threadID, b, now), GetThread(threadID).IsActiveParticipant(b) == false.
}

func TestGormThreadRepository_ListThreadsForUser_DescByLastMessage(t *testing.T) {
	// Two threads; bump last_message_at on the second; ListThreadsForUser returns it first.
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && go test ./test/repositories/ -run TestGormThreadRepository -v`
Expected: FAIL (or SKIP if no DB — then set `DATABASE_URL` to the dev DB and re-run; it must actually run for this task).

- [ ] **Step 3: Implement `GormThreadRepository`**

Key points:
- `CreateThread`: run in a transaction — `Create(&MessageThreadModel{CreatedBy: createdBy, LastMessageAt: time.Now()})`, then bulk-insert `ThreadParticipantModel` rows (creator gets `Role: "OWNER"`, others `"MEMBER"`), then reload with participants. The `trg_init_thread_sequence` trigger creates the `thread_sequences` row automatically.
- `GetThread`: load the thread, then `Where("thread_id = ?", id).Find(&parts)`, map via `messageThreadModelToDomain`.
- `FindDirectThread(userA, userB)`: select `thread_id` from `thread_participants` grouped by `thread_id` having `count(*) FILTER (WHERE left_at IS NULL) = 2` and `bool_and(user_id IN (?,?))` — simplest correct form:
  ```sql
  SELECT tp.thread_id
  FROM thread_participants tp
  WHERE tp.left_at IS NULL
  GROUP BY tp.thread_id
  HAVING COUNT(*) = 2
     AND COUNT(*) FILTER (WHERE tp.user_id IN (?, ?)) = 2
  LIMIT 1
  ```
  No row → `domain.ErrNotFound`.
- `ListThreadsForUser`: join `thread_participants` (`user_id = ? AND left_at IS NULL`), order `message_threads.last_message_at DESC`, `LIMIT ?`; if `beforeLastMessageAt != nil` add `AND last_message_at < ?`. Load participants for the returned thread IDs in one `IN` query and attach.
- `AddParticipants`: bulk `clause.OnConflict{DoNothing: true}` insert of `ThreadParticipantModel{Role: "MEMBER"}`. If a row exists with `left_at` set, clear it: `Model(&ThreadParticipantModel{}).Where("thread_id = ? AND user_id IN ?", threadID, userIDs).Update("left_at", nil)`.
- `SetLeft`: `Update("left_at", at)` where `thread_id/user_id` match.
- `SetLastRead`: `Model(&ThreadParticipantModel{}).Where("thread_id = ? AND user_id = ? AND last_read_seq < ?", threadID, userID, seq).Update("last_read_seq", seq)` — forward-only via the `<` predicate.

Wrap all errors `fmt.Errorf("...: %w", err)`; map `gorm.ErrRecordNotFound` → `domain.ErrNotFound`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && DATABASE_URL="$DATABASE_URL" go test ./test/repositories/ -run TestGormThreadRepository -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/adapters/repositories/postgres/gorm_thread_repository.go backend/test/repositories/gorm_thread_repository_test.go
git commit -m "feat(messaging): GormThreadRepository with 1:1 dedup and read pointer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AMzMYxN9wh1wmKVQorbcyb"
```

---

## Task 6: GormMessageRepository

**Files:**
- Create: `backend/internal/adapters/repositories/postgres/gorm_message_repository.go`
- Test: `backend/test/repositories/gorm_message_repository_test.go`

**Interfaces:**
- Consumes: `repositories.MessageRepository` (Task 4).
- Produces: `postgres.NewGormMessageRepository(db *gorm.DB) *GormMessageRepository` with the compile-time check.

- [ ] **Step 1: Write the failing DB-gated tests**

```go
func TestGormMessageRepository_InsertAssignsSeq(t *testing.T) {
	// Create thread(a,{a,b}); Insert two messages; seqs are 1 then 2; CreatedAt non-zero.
}

func TestGormMessageRepository_Insert_IdempotentOnNonce(t *testing.T) {
	// Insert body="x" nonce="n1" -> seq 1. Insert body="x2" nonce="n1" (same thread+sender)
	// -> returns the FIRST row (seq 1, body "x"), no new row, no error.
}

func TestGormMessageRepository_ListSince_AscFromSeq(t *testing.T) {
	// Insert seqs 1..5. ListSince(thread, 2) -> messages seq 3,4,5 in ascending order.
}

func TestGormMessageRepository_ListHistory_DescBackwardPaging(t *testing.T) {
	// Insert seqs 1..5. ListHistory(thread, limit=2, beforeSeq=nil) -> [5,4].
	// ListHistory(thread, limit=2, beforeSeq=4) -> [3,2].
}

func TestGormMessageRepository_MaxSeq(t *testing.T) {
	// Empty thread -> 0. After inserting 3 -> 3.
}

func TestGormMessageRepository_RetentionPrunesBeyond1000(t *testing.T) {
	// Insert 1050 messages (loop). MaxSeq == 1050.
	// ListSince(thread, 0) length == 1000; smallest returned seq == 51.
	// (The prune trigger fires at seq % 50 == 0, so after seq 1050 the window is 51..1050.)
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && DATABASE_URL="$DATABASE_URL" go test ./test/repositories/ -run TestGormMessageRepository -v`
Expected: FAIL — undefined `NewGormMessageRepository`.

- [ ] **Step 3: Implement `GormMessageRepository`**

- `Insert`: build model via `messageDomainToModel` (do **not** set `Seq`). `Clauses(clause.OnConflict{Columns: []clause.Column{{Name:"thread_id"},{Name:"sender_id"},{Name:"client_nonce"}}, DoNothing: true}).Create(model)`. If `model.ID == 0` after create (conflict → nothing inserted), fetch the existing row: `Where("thread_id = ? AND sender_id = ? AND client_nonce = ?", ...).First(&existing)`. Otherwise reload by `model.ID` to pick up trigger-assigned `seq` and DB `created_at`. Return `messageModelToDomain`.
- `GetByID`: `First(&m, id)`; map not-found.
- `ListHistory`: `Where("thread_id = ?", threadID)`, if `beforeSeq != nil` `Where("seq < ?", *beforeSeq)`, `Order("seq DESC").Limit(limit).Find(&rows)`; map.
- `ListSince`: `Where("thread_id = ? AND seq > ?", threadID, sinceSeq).Order("seq ASC").Find(&rows)`; map.
- `MaxSeq`: `Model(&MessageModel{}).Where("thread_id = ?", threadID).Select("COALESCE(MAX(seq), 0)").Scan(&n)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && DATABASE_URL="$DATABASE_URL" go test ./test/repositories/ -run TestGormMessageRepository -v`
Expected: PASS (the retention test may take a few seconds for 1050 inserts — acceptable).

- [ ] **Step 5: Commit**

```bash
git add backend/internal/adapters/repositories/postgres/gorm_message_repository.go backend/test/repositories/gorm_message_repository_test.go
git commit -m "feat(messaging): GormMessageRepository with seq replay, history paging, retention

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AMzMYxN9wh1wmKVQorbcyb"
```

---

## Task 7: In-memory rate limiter

**Files:**
- Create: `backend/internal/core/services/ratelimit.go`
- Test: `backend/test/services/ratelimit_test.go`

**Interfaces:**
- Consumes: nothing.
- Produces: `services.NewSlidingWindowLimiter(max int, window time.Duration) *SlidingWindowLimiter` with `Allow(key string) bool` and an injectable `now func() time.Time` field (`nowFn`) for tests.

- [ ] **Step 1: Write the failing test**

```go
package services_test

import (
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
)

func TestSlidingWindowLimiter(t *testing.T) {
	now := time.Unix(0, 0)
	lim := services.NewSlidingWindowLimiter(3, time.Second)
	lim.NowFn = func() time.Time { return now }

	assert.True(t, lim.Allow("u1"))
	assert.True(t, lim.Allow("u1"))
	assert.True(t, lim.Allow("u1"))
	assert.False(t, lim.Allow("u1"), "4th in window rejected")
	assert.True(t, lim.Allow("u2"), "other key unaffected")

	now = now.Add(1100 * time.Millisecond)
	assert.True(t, lim.Allow("u1"), "window elapsed, allowed again")
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && go test ./test/services/ -run TestSlidingWindowLimiter -v`
Expected: FAIL — undefined.

- [ ] **Step 3: Implement**

```go
package services

import (
	"sync"
	"time"
)

type SlidingWindowLimiter struct {
	max    int
	window time.Duration
	NowFn  func() time.Time

	mu   sync.Mutex
	hits map[string][]time.Time
}

func NewSlidingWindowLimiter(max int, window time.Duration) *SlidingWindowLimiter {
	return &SlidingWindowLimiter{
		max: max, window: window, NowFn: time.Now,
		hits: make(map[string][]time.Time),
	}
}

func (l *SlidingWindowLimiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.NowFn()
	cutoff := now.Add(-l.window)
	kept := l.hits[key][:0]
	for _, ts := range l.hits[key] {
		if ts.After(cutoff) {
			kept = append(kept, ts)
		}
	}
	if len(kept) >= l.max {
		l.hits[key] = kept
		return false
	}
	l.hits[key] = append(kept, now)
	return true
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && go test ./test/services/ -run TestSlidingWindowLimiter -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/core/services/ratelimit.go backend/test/services/ratelimit_test.go
git commit -m "feat(messaging): sliding-window per-key rate limiter

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AMzMYxN9wh1wmKVQorbcyb"
```

---

## Task 8: MessagingService

**Files:**
- Create: `backend/internal/core/ports/services/messaging_service.go`
- Create: `backend/internal/core/services/messaging_service.go`
- Test: `backend/test/services/messaging_service_test.go`

**Interfaces:**
- Consumes: `repositories.ThreadRepository`, `repositories.MessageRepository` (Task 4), `services.SlidingWindowLimiter` (Task 7), `domain` types (Task 2).
- Produces:
  - `portservices.EventPublisher interface { PublishEphemeral(ctx context.Context, env domain.EventEnvelope) error }` — the service calls this for typing/read-receipt/participant events; the Hub (Task 9) implements it.
  - `portservices.MessagingService`:
    ```go
    CreateThread(ctx, actorUserID int, participantUserIDs []int, title *string) (*domain.MessageThread, error)
    SendMessage(ctx, actorUserID int, in SendMessageInput) (*domain.Message, error)
    MarkRead(ctx, actorUserID, threadID int, seq int64) (*domain.MessageThread, error)
    AddParticipants(ctx, actorUserID, threadID int, userIDs []int) (*domain.MessageThread, error)
    LeaveThread(ctx, actorUserID, threadID int) error
    ListThreads(ctx, actorUserID int, limit int, beforeLastMessageAt *time.Time) ([]domain.MessageThread, error)
    GetHistory(ctx, actorUserID, threadID int, limit int, beforeSeq *int64) ([]domain.Message, error)
    ListSince(ctx, actorUserID, threadID int, sinceSeq int64) ([]domain.Message, error)
    SetTyping(ctx, actorUserID, threadID int, typing bool) error
    AssertParticipant(ctx, actorUserID, threadID int) error
    ```
  - `portservices.SendMessageInput{ThreadID int; Body string; ClientNonce string}`
  - `services.NewMessagingService(threadRepo, msgRepo, publisher, limiter) *MessagingServiceImpl`

- [ ] **Step 1: Write the failing unit tests**

`messaging_service_test.go` — define `mockThreadRepo`, `mockMessageRepo`, `mockPublisher` (function-field style like `mockCategoryRepository` in `category_service_test.go`). Cases:

```go
func TestSendMessage_RejectsNonParticipant(t *testing.T) {
	// GetThread returns a thread whose Participants do not include actor 99.
	// SendMessage(actor=99) -> errors.Is(err, domain.ErrForbidden); msgRepo.Insert never called.
}

func TestSendMessage_RejectsOversizeBody(t *testing.T) {
	// Body = strings.Repeat("a", 8193) -> errors.Is(err, domain.ErrInvalidInput).
}

func TestSendMessage_RateLimited(t *testing.T) {
	// limiter with max=1 window=time.Minute. First send OK, second -> errors.Is(err, domain.ErrRateLimited).
}

func TestSendMessage_HappyPath_PersistsAndReturns(t *testing.T) {
	// participant actor; msgRepo.Insert returns Message{Seq:1}. Returns that message, nil error.
	// (No publish call here — MESSAGE_POSTED comes from the DB trigger, not the service.)
}

func TestMarkRead_MovesPointerAndPublishes(t *testing.T) {
	// participant actor; SetLastRead called with seq; publisher.PublishEphemeral called once
	// with env.Type == "READ_RECEIPT_CHANGED", env.UserID == actor, env.LastReadSeq == seq.
}

func TestSetTyping_PublishesEphemeralOnly(t *testing.T) {
	// participant actor; publisher.PublishEphemeral called with env.Type=="TYPING_CHANGED", env.Typing==true.
	// No repo writes.
}

func TestCreateThread_DedupesDirectThread(t *testing.T) {
	// participantUserIDs = {actor, b}, len 2. threadRepo.FindDirectThread returns an existing thread.
	// CreateThread returns it; threadRepo.CreateThread never called.
}

func TestCreateThread_GroupCreatesNew(t *testing.T) {
	// participantUserIDs = {actor, b, c}. FindDirectThread not consulted; CreateThread called with
	// actor as createdBy and the full participant set (actor included, deduped).
}

func TestLeaveThread_PublishesParticipantRemoved(t *testing.T) {
	// participant actor; threadRepo.SetLeft called; publisher env.Type=="PARTICIPANT_CHANGED",
	// env.Change=="REMOVED", env.UserID==actor.
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && go test ./test/services/ -run "TestSendMessage|TestMarkRead|TestSetTyping|TestCreateThread|TestLeaveThread" -v`
Expected: FAIL — undefined `services.NewMessagingService`.

- [ ] **Step 3: Write the port file**

`messaging_service.go` (port) — the `EventPublisher`, `MessagingService`, `SendMessageInput` definitions from **Interfaces**, `package services` under `internal/core/ports/services`.

- [ ] **Step 4: Implement `MessagingServiceImpl`**

```go
package services

import (
	"context"
	"fmt"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

const maxMessageBodyBytes = 8192

type MessagingServiceImpl struct {
	threadRepo repositories.ThreadRepository
	msgRepo    repositories.MessageRepository
	publisher  portservices.EventPublisher
	limiter    *SlidingWindowLimiter
}

var _ portservices.MessagingService = (*MessagingServiceImpl)(nil)

func NewMessagingService(
	threadRepo repositories.ThreadRepository,
	msgRepo repositories.MessageRepository,
	publisher portservices.EventPublisher,
	limiter *SlidingWindowLimiter,
) *MessagingServiceImpl {
	return &MessagingServiceImpl{threadRepo, msgRepo, publisher, limiter}
}

func (s *MessagingServiceImpl) AssertParticipant(ctx context.Context, actorUserID, threadID int) error {
	thread, err := s.threadRepo.GetThread(ctx, threadID)
	if err != nil {
		return err
	}
	if !thread.IsActiveParticipant(actorUserID) {
		return fmt.Errorf("%w: not a participant of thread %d", domain.ErrForbidden, threadID)
	}
	return nil
}

func (s *MessagingServiceImpl) SendMessage(ctx context.Context, actorUserID int, in portservices.SendMessageInput) (*domain.Message, error) {
	if len(in.Body) == 0 || len([]byte(in.Body)) > maxMessageBodyBytes {
		return nil, fmt.Errorf("%w: message body must be 1..%d bytes", domain.ErrInvalidInput, maxMessageBodyBytes)
	}
	if in.ClientNonce == "" {
		return nil, fmt.Errorf("%w: clientNonce required", domain.ErrInvalidInput)
	}
	if err := s.AssertParticipant(ctx, actorUserID, in.ThreadID); err != nil {
		return nil, err
	}
	if !s.limiter.Allow(fmt.Sprintf("send:%d", actorUserID)) {
		return nil, fmt.Errorf("%w: too many messages", domain.ErrRateLimited)
	}
	return s.msgRepo.Insert(ctx, &domain.Message{
		ThreadID: in.ThreadID, SenderID: actorUserID,
		Body: in.Body, ClientNonce: in.ClientNonce,
	})
}

func (s *MessagingServiceImpl) MarkRead(ctx context.Context, actorUserID, threadID int, seq int64) (*domain.MessageThread, error) {
	if err := s.AssertParticipant(ctx, actorUserID, threadID); err != nil {
		return nil, err
	}
	if err := s.threadRepo.SetLastRead(ctx, threadID, actorUserID, seq); err != nil {
		return nil, err
	}
	_ = s.publisher.PublishEphemeral(ctx, domain.EventEnvelope{
		Type: "READ_RECEIPT_CHANGED", ThreadID: threadID, UserID: actorUserID, LastReadSeq: seq,
	})
	return s.threadRepo.GetThread(ctx, threadID)
}

func (s *MessagingServiceImpl) SetTyping(ctx context.Context, actorUserID, threadID int, typing bool) error {
	if err := s.AssertParticipant(ctx, actorUserID, threadID); err != nil {
		return err
	}
	return s.publisher.PublishEphemeral(ctx, domain.EventEnvelope{
		Type: "TYPING_CHANGED", ThreadID: threadID, UserID: actorUserID, Typing: typing,
	})
}

func (s *MessagingServiceImpl) CreateThread(ctx context.Context, actorUserID int, participantUserIDs []int, title *string) (*domain.MessageThread, error) {
	set := map[int]struct{}{actorUserID: {}}
	for _, id := range participantUserIDs {
		set[id] = struct{}{}
	}
	ids := make([]int, 0, len(set))
	for id := range set {
		ids = append(ids, id)
	}
	if len(ids) < 2 {
		return nil, fmt.Errorf("%w: a thread needs at least two participants", domain.ErrInvalidInput)
	}
	if len(ids) == 2 && title == nil {
		other := ids[0]
		if other == actorUserID {
			other = ids[1]
		}
		if existing, err := s.threadRepo.FindDirectThread(ctx, actorUserID, other); err == nil {
			return existing, nil
		}
	}
	return s.threadRepo.CreateThread(ctx, actorUserID, title, ids)
}

func (s *MessagingServiceImpl) AddParticipants(ctx context.Context, actorUserID, threadID int, userIDs []int) (*domain.MessageThread, error) {
	if err := s.AssertParticipant(ctx, actorUserID, threadID); err != nil {
		return nil, err
	}
	if err := s.threadRepo.AddParticipants(ctx, threadID, userIDs); err != nil {
		return nil, err
	}
	for _, uid := range userIDs {
		_ = s.publisher.PublishEphemeral(ctx, domain.EventEnvelope{
			Type: "PARTICIPANT_CHANGED", ThreadID: threadID, UserID: uid, Change: "ADDED",
		})
	}
	return s.threadRepo.GetThread(ctx, threadID)
}

func (s *MessagingServiceImpl) LeaveThread(ctx context.Context, actorUserID, threadID int) error {
	if err := s.AssertParticipant(ctx, actorUserID, threadID); err != nil {
		return err
	}
	if err := s.threadRepo.SetLeft(ctx, threadID, actorUserID, time.Now()); err != nil {
		return err
	}
	return s.publisher.PublishEphemeral(ctx, domain.EventEnvelope{
		Type: "PARTICIPANT_CHANGED", ThreadID: threadID, UserID: actorUserID, Change: "REMOVED",
	})
}

func (s *MessagingServiceImpl) ListThreads(ctx context.Context, actorUserID, limit int, before *time.Time) ([]domain.MessageThread, error) {
	return s.threadRepo.ListThreadsForUser(ctx, actorUserID, limit, before)
}

func (s *MessagingServiceImpl) GetHistory(ctx context.Context, actorUserID, threadID, limit int, beforeSeq *int64) ([]domain.Message, error) {
	if err := s.AssertParticipant(ctx, actorUserID, threadID); err != nil {
		return nil, err
	}
	return s.msgRepo.ListHistory(ctx, threadID, limit, beforeSeq)
}

func (s *MessagingServiceImpl) ListSince(ctx context.Context, actorUserID, threadID int, sinceSeq int64) ([]domain.Message, error) {
	if err := s.AssertParticipant(ctx, actorUserID, threadID); err != nil {
		return nil, err
	}
	return s.msgRepo.ListSince(ctx, threadID, sinceSeq)
}
```

Fix the `ListThreads` signature mismatch (the interface has `limit int, beforeLastMessageAt *time.Time` after `actorUserID`) — match the port exactly.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && go test ./test/services/ -run "TestSendMessage|TestMarkRead|TestSetTyping|TestCreateThread|TestLeaveThread" -v`
Expected: PASS.

Run: `cd backend && go build ./...`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/core/ports/services/messaging_service.go backend/internal/core/services/messaging_service.go backend/test/services/messaging_service_test.go
git commit -m "feat(messaging): MessagingService with auth, rate limit, idempotency, ephemeral publish

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AMzMYxN9wh1wmKVQorbcyb"
```

---

## Task 9: Realtime Hub (in-memory core)

**Files:**
- Create: `backend/internal/adapters/realtime/hub.go`
- Test: `backend/test/realtime/hub_test.go`

**Interfaces:**
- Consumes: `domain.ThreadEvent` + variants, `domain.EventEnvelope` (Task 2); `portservices.EventPublisher` (Task 8); `repositories.MessageRepository` (Task 4, for loading a row on `MESSAGE_POSTED`).
- Produces:
  - `realtime.NewHub(msgRepo repositories.MessageRepository) *Hub`
  - `(*Hub).Subscribe(threadID int) (<-chan domain.ThreadEvent, func())` — the func unsubscribes and closes the channel.
  - `(*Hub).PublishEnvelope(ctx context.Context, env domain.EventEnvelope)` — decodes an envelope (from the DB listener or an ephemeral publish) into a `domain.ThreadEvent` and fans out to subscribers of `env.ThreadID`. For `MESSAGE_POSTED` it calls `msgRepo.GetByID(ctx, env.MessageID)`.
  - `(*Hub).PublishEphemeral(ctx context.Context, env domain.EventEnvelope) error` — satisfies `portservices.EventPublisher`; in-process it just calls `PublishEnvelope`. (Cross-process delivery of ephemerals is added in Task 10 via NOTIFY; keeping both paths is fine — the listener dedupes by not re-broadcasting its own.)  For this task, `PublishEphemeral` simply calls `PublishEnvelope` and returns nil.
  - `(*Hub).Broadcast(threadID int, evt domain.ThreadEvent)` — low-level fan-out used by `PublishEnvelope` and by the listener's reset path.
  - `(*Hub).ResetAll()` — sends `domain.StreamResetEvent{ThreadID: <each>}` to every subscriber (used after a listener reconnect).
  - Backpressure: each subscriber channel is buffered `64`; if a non-blocking send fails, the hub drops that subscriber, sends nothing more, and closes its channel (the consumer observes a close and re-syncs).

- [ ] **Step 1: Write the failing tests**

`backend/test/realtime/hub_test.go`:

```go
package realtime_test

import (
	"context"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/realtime"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type stubMsgRepo struct{ msg domain.Message }

func (s stubMsgRepo) Insert(ctx context.Context, m *domain.Message) (*domain.Message, error) { return m, nil }
func (s stubMsgRepo) GetByID(ctx context.Context, id int64) (*domain.Message, error)         { m := s.msg; return &m, nil }
func (s stubMsgRepo) ListHistory(ctx context.Context, t, l int, b *int64) ([]domain.Message, error) { return nil, nil }
func (s stubMsgRepo) ListSince(ctx context.Context, t int, s2 int64) ([]domain.Message, error)      { return nil, nil }
func (s stubMsgRepo) MaxSeq(ctx context.Context, t int) (int64, error)                              { return 0, nil }

func TestHub_FanOutMessagePosted(t *testing.T) {
	hub := realtime.NewHub(stubMsgRepo{msg: domain.Message{ID: 10, ThreadID: 1, Seq: 3, Body: "hi"}})
	ch, unsub := hub.Subscribe(1)
	defer unsub()

	hub.PublishEnvelope(context.Background(), domain.EventEnvelope{Type: "MESSAGE_POSTED", ThreadID: 1, Seq: 3, MessageID: 10})

	select {
	case evt := <-ch:
		mp, ok := evt.(domain.MessagePostedEvent)
		require.True(t, ok)
		assert.Equal(t, "hi", mp.Message.Body)
	case <-time.After(time.Second):
		t.Fatal("no event")
	}
}

func TestHub_TypingEnvelopeBecomesTypingEvent(t *testing.T) {
	hub := realtime.NewHub(stubMsgRepo{})
	ch, unsub := hub.Subscribe(2)
	defer unsub()
	hub.PublishEnvelope(context.Background(), domain.EventEnvelope{Type: "TYPING_CHANGED", ThreadID: 2, UserID: 7, Typing: true})
	evt := <-ch
	tc, ok := evt.(domain.TypingChangedEvent)
	require.True(t, ok)
	assert.Equal(t, 7, tc.UserID)
	assert.True(t, tc.Typing)
}

func TestHub_UnsubscribeStopsDelivery(t *testing.T) {
	hub := realtime.NewHub(stubMsgRepo{})
	ch, unsub := hub.Subscribe(3)
	unsub()
	_, open := <-ch
	assert.False(t, open, "channel closed on unsubscribe")
}

func TestHub_SlowConsumerDropped(t *testing.T) {
	hub := realtime.NewHub(stubMsgRepo{msg: domain.Message{ID: 1, ThreadID: 4}})
	ch, _ := hub.Subscribe(4)
	// Never drain ch. Publish 65 message events (buffer is 64) — the 65th forces a drop.
	for i := 0; i < 65; i++ {
		hub.PublishEnvelope(context.Background(), domain.EventEnvelope{Type: "MESSAGE_POSTED", ThreadID: 4, MessageID: 1})
	}
	// Drain what buffered, then expect a close.
	for range ch {
	}
	// Reaching here means the channel was closed (drop path). No assertion needed beyond not hanging.
}

func TestHub_ResetAllSendsStreamReset(t *testing.T) {
	hub := realtime.NewHub(stubMsgRepo{})
	ch, unsub := hub.Subscribe(5)
	defer unsub()
	hub.ResetAll()
	evt := <-ch
	_, ok := evt.(domain.StreamResetEvent)
	assert.True(t, ok)
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && go test ./test/realtime/ -run TestHub -v`
Expected: FAIL — `undefined: realtime.NewHub`.

- [ ] **Step 3: Implement `hub.go`**

- `Hub` holds `mu sync.RWMutex`, `subs map[int]map[int]chan domain.ThreadEvent` (threadID → subID → chan), `nextID int`, `msgRepo`.
- `Subscribe`: lock, allocate subID, make `chan domain.ThreadEvent` buffered 64, store, return receive-only chan + an `unsub` closure (idempotent via `sync.Once`) that locks, deletes, closes the chan.
- `Broadcast(threadID, evt)`: `RLock` to snapshot the subs for that thread into a slice; unlock; for each, `select { case c <- evt: default: go h.drop(threadID, subID) }`. `drop` locks, deletes, closes.
- `PublishEnvelope`: switch on `env.Type`:
  - `"MESSAGE_POSTED"` → `m, err := h.msgRepo.GetByID(ctx, env.MessageID)`; on err, log + return; else `Broadcast(env.ThreadID, domain.MessagePostedEvent{Message: *m})`.
  - `"READ_RECEIPT_CHANGED"` → `Broadcast(env.ThreadID, domain.ReadReceiptChangedEvent{ThreadID: env.ThreadID, UserID: env.UserID, LastReadSeq: env.LastReadSeq})`.
  - `"TYPING_CHANGED"` → `domain.TypingChangedEvent{...}`.
  - `"PARTICIPANT_CHANGED"` → `domain.ParticipantChangedEvent{ThreadID: env.ThreadID, UserID: env.UserID, Change: env.Change}`.
  - `"PRESENCE_CHANGED"` → `domain.PresenceChangedEvent{ThreadID: env.ThreadID, UserID: env.UserID, State: domain.PresenceState(env.State)}`.
  - `"STREAM_RESET"` → `domain.StreamResetEvent{ThreadID: env.ThreadID}`.
- `PublishEphemeral(ctx, env) error`: `h.PublishEnvelope(ctx, env); return nil`. Add `var _ portservices.EventPublisher = (*Hub)(nil)`.
- `ResetAll()`: `RLock` snapshot of all threadIDs; for each call `Broadcast(threadID, domain.StreamResetEvent{ThreadID: threadID})`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && go test ./test/realtime/ -run TestHub -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/adapters/realtime/hub.go backend/test/realtime/hub_test.go
git commit -m "feat(messaging): realtime Hub with fan-out, backpressure drop, stream reset

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AMzMYxN9wh1wmKVQorbcyb"
```

---

## Task 10: Postgres LISTEN listener + presence tracker

**Files:**
- Create: `backend/internal/adapters/realtime/listener.go`
- Create: `backend/internal/adapters/realtime/presence.go`
- Test: `backend/test/realtime/presence_test.go`
- Test: `backend/test/realtime/listener_test.go` (DB-gated)

**Interfaces:**
- Consumes: `*realtime.Hub` (Task 9); a `*pgxpool.Pool` or raw DSN string.
- Produces:
  - `realtime.NewListener(dsn string, hub *Hub) *Listener`
  - `(*Listener).Run(ctx context.Context)` — blocks: opens a dedicated `pgx` connection, `LISTEN thread_events`, loops `conn.WaitForNotification`, JSON-decodes each payload into `domain.EventEnvelope`, calls `hub.PublishEnvelope`. On any connection error: log, `hub.ResetAll()`, sleep with capped exponential backoff (start 250ms, cap 10s), reconnect. Returns when `ctx` is cancelled.
  - `realtime.NewPresenceTracker() *PresenceTracker` with injectable `NowFn func() time.Time`.
  - `(*PresenceTracker).Connect(userID int) (firstConnection bool)` / `(*PresenceTracker).Disconnect(userID int) (lastConnection bool)` — refcount per user.
  - `(*PresenceTracker).Touch(userID int)` — record a heartbeat at `NowFn()`.
  - `(*PresenceTracker).IsOnline(userID int) bool` — true if refcount > 0 or last touch within 45s.
  - `(*PresenceTracker).Expire()` — drop entries whose last touch is older than 45s and refcount 0.

- [ ] **Step 1: Write the failing presence test**

```go
func TestPresenceTracker_RefcountAndExpiry(t *testing.T) {
	now := time.Unix(1000, 0)
	p := realtime.NewPresenceTracker()
	p.NowFn = func() time.Time { return now }

	assert.True(t, p.Connect(1), "first connection")
	assert.False(t, p.Connect(1), "second connection not first")
	assert.True(t, p.IsOnline(1))

	assert.False(t, p.Disconnect(1), "one ref remains")
	assert.True(t, p.Disconnect(1), "last connection")
	assert.True(t, p.IsOnline(1), "still online within 45s of last activity")

	now = now.Add(46 * time.Second)
	assert.False(t, p.IsOnline(1), "expired after 45s")
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && go test ./test/realtime/ -run TestPresenceTracker -v`
Expected: FAIL — undefined.

- [ ] **Step 3: Implement `presence.go`**

Map `userID -> struct{ refs int; lastSeen time.Time }` under a mutex. `Connect` increments refs and sets `lastSeen`, returns `refs == 1`. `Disconnect` decrements, sets `lastSeen`, returns `refs == 0`. `Touch` sets `lastSeen`. `IsOnline` returns `refs > 0 || NowFn().Sub(lastSeen) <= 45*time.Second`. `Expire` deletes entries with `refs == 0 && NowFn().Sub(lastSeen) > 45s`.

- [ ] **Step 4: Implement `listener.go`**

Use `pgx.Connect(ctx, dsn)` for a dedicated connection (not the GORM pool). Core loop:

```go
func (l *Listener) Run(ctx context.Context) {
	backoff := 250 * time.Millisecond
	for ctx.Err() == nil {
		if err := l.listenOnce(ctx); err != nil && ctx.Err() == nil {
			slog.Warn("thread_events listener error; will reconnect", "error", err, "backoff", backoff)
			l.hub.ResetAll()
			select {
			case <-ctx.Done():
				return
			case <-time.After(backoff):
			}
			if backoff < 10*time.Second {
				backoff *= 2
			}
			continue
		}
		backoff = 250 * time.Millisecond
	}
}

func (l *Listener) listenOnce(ctx context.Context) error {
	conn, err := pgx.Connect(ctx, l.dsn)
	if err != nil {
		return err
	}
	defer conn.Close(context.Background())
	if _, err := conn.Exec(ctx, "LISTEN thread_events"); err != nil {
		return err
	}
	slog.Info("listening on thread_events")
	for {
		n, err := conn.WaitForNotification(ctx)
		if err != nil {
			return err
		}
		var env domain.EventEnvelope
		if err := json.Unmarshal([]byte(n.Payload), &env); err != nil {
			slog.Warn("bad thread_events payload", "payload", n.Payload, "error", err)
			continue
		}
		l.hub.PublishEnvelope(ctx, env)
	}
}
```

- [ ] **Step 5: Write the DB-gated listener test**

`listener_test.go`:

```go
func TestListener_DeliversNotifyToHub(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" { t.Skip("no DATABASE_URL") }
	// open GORM db, create users A,B + a thread + one message via repos.
	// hub := realtime.NewHub(msgRepo); start listener in a goroutine with a cancelable ctx.
	// subscribe to the thread; insert another message via msgRepo.Insert.
	// assert a MessagePostedEvent arrives on the subscription channel within 3s.
}
```

- [ ] **Step 6: Run tests**

Run: `cd backend && go test ./test/realtime/ -run "TestPresenceTracker" -v`
Expected: PASS.

Run: `cd backend && DATABASE_URL="$DATABASE_URL" go test ./test/realtime/ -run TestListener -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/internal/adapters/realtime/listener.go backend/internal/adapters/realtime/presence.go backend/test/realtime/presence_test.go backend/test/realtime/listener_test.go
git commit -m "feat(messaging): pg LISTEN listener with reconnect + presence tracker

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AMzMYxN9wh1wmKVQorbcyb"
```

---

## Task 11: GraphQL schema + codegen + resolvers + wiring

**Files:**
- Modify: `backend/schema.graphql`
- Modify: `backend/gqlgen.yml`
- Run: `make graphql-gen` (creates `internal/adapters/graphql/resolvers/messaging.resolvers.go`)
- Modify: `backend/internal/adapters/graphql/resolvers/resolver.go`
- Modify: `backend/cmd/server/main.go`
- Test: `backend/test/resolvers/messaging_resolver_test.go`

**Interfaces:**
- Consumes: `portservices.MessagingService` (Task 8), `*realtime.Hub` (Task 9), `*realtime.PresenceTracker` (Task 10), `auth.ForContext` (existing), `portservices.TokenVerifier` (Task 3).
- Produces: working `/graphql` WebSocket subscriptions; `Resolver` gains `Messaging portservices.MessagingService` and `Hub *realtime.Hub` and `Presence *realtime.PresenceTracker`.

- [ ] **Step 1: Add schema to `schema.graphql`**

```graphql
# ---- Messaging ----

enum ThreadRole { OWNER MEMBER }
enum PresenceState { ONLINE OFFLINE }
enum ParticipantChangeKind { ADDED REMOVED }

type MessageThread {
  id: ID!
  title: String
  participants: [ThreadParticipant!]!
  lastMessageAt: String!
  latestSeq: IntID!
  myLastReadSeq: IntID!
  unreadCount: Int!
  createdAt: String!
}

type ThreadParticipant {
  user: User!
  role: ThreadRole!
  lastReadSeq: IntID!
  joinedAt: String!
}

type Message {
  id: ID!
  threadId: ID!
  sender: User!
  seq: IntID!
  body: String!
  createdAt: String!
}

type MessageConnection {
  items: [Message!]!
  pageInfo: PageInfo!
}

type MessagePosted { message: Message! }
type ReadReceiptChanged { threadId: ID!  userId: ID!  lastReadSeq: IntID! }
type TypingChanged { threadId: ID!  userId: ID!  typing: Boolean! }
type ParticipantChanged { threadId: ID!  userId: ID!  change: ParticipantChangeKind! }
type PresenceChanged { threadId: ID!  userId: ID!  state: PresenceState! }
type StreamReset { threadId: ID! }

union ThreadEvent =
    MessagePosted
  | ReadReceiptChanged
  | TypingChanged
  | ParticipantChanged
  | PresenceChanged
  | StreamReset

type InboxEvent {
  threadId: ID!
  lastMessageAt: String!
  latestSeq: IntID!
  unreadCount: Int!
}

input CreateMessageThreadInput { participantUserIds: [ID!]!  title: String }
input SendMessageInput { threadId: ID!  body: String!  clientNonce: String! }

extend type Query {
  messageThreads(first: Int, before: String): [MessageThread!]! @auth
  messageThread(id: ID!): MessageThread @auth
  threadMessages(threadId: ID!, first: Int, before: IntID): MessageConnection! @auth
}

extend type Mutation {
  createMessageThread(input: CreateMessageThreadInput!): MessageThread! @auth
  sendMessage(input: SendMessageInput!): Message! @auth
  markThreadRead(threadId: ID!, seq: IntID!): MessageThread! @auth
  setTyping(threadId: ID!, typing: Boolean!): Boolean! @auth
  addThreadParticipants(threadId: ID!, userIds: [ID!]!): MessageThread! @auth
  leaveThread(threadId: ID!): Boolean! @auth
}

extend type Subscription {
  threadEvents(threadId: ID!, sinceSeq: IntID): ThreadEvent! @auth
  inboxEvents: InboxEvent! @auth
}
```

If `schema.graphql` has no `type Subscription` yet, add a stub `type Subscription { _empty: Boolean }` before the `extend`, OR just declare `type Subscription { ... }` directly instead of `extend`. Check the file first.

- [ ] **Step 2: Bind enums in `gqlgen.yml`**

Under `models:` add:

```yaml
  ThreadRole:
    model:
      - github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain.ThreadRole
  PresenceState:
    model:
      - github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain.PresenceState
```

- [ ] **Step 3: Regenerate**

Run: `cd backend && make graphql-gen`
Expected: creates `internal/adapters/graphql/resolvers/messaging.resolvers.go` with unimplemented stubs; `generated.go` and `models_gen.go` updated. `go build ./...` will fail until Step 6 — that's expected.

- [ ] **Step 4: Add dependencies to `Resolver`**

`resolver.go`: add fields and constructor params `Messaging portservices.MessagingService`, `Hub *realtime.Hub`, `Presence *realtime.PresenceTracker`. Update `NewResolver` signature and the `main.go` call.

- [ ] **Step 5: Write the failing resolver test**

`backend/test/resolvers/messaging_resolver_test.go` — drive resolvers directly (like `me_resolver_test.go`) with a context carrying an authenticated user via `auth.WithAuthenticatedUser`, and a fake `MessagingService`:

```go
func TestSendMessageResolver_MapsDomainToModel(t *testing.T) {
	fake := &fakeMessaging{sendFn: func(ctx context.Context, actor int, in portservices.SendMessageInput) (*domain.Message, error) {
		assert.Equal(t, 1, actor)
		assert.Equal(t, "hello", in.Body)
		return &domain.Message{ID: 9, ThreadID: 2, SenderID: 1, Seq: 4, Body: "hello", CreatedAt: time.Now()}, nil
	}}
	r := &resolvers.Resolver{Messaging: fake}
	ctx := auth.WithAuthenticatedUser(context.Background(), &domain.AuthenticatedUser{ID: 1})
	out, err := r.Mutation().SendMessage(ctx, model.SendMessageInput{ThreadID: "2", Body: "hello", ClientNonce: "n1"})
	require.NoError(t, err)
	assert.Equal(t, "9", out.ID)
	assert.Equal(t, "hello", out.Body)
}

func TestSendMessageResolver_ForbiddenMapsToGraphQLError(t *testing.T) {
	fake := &fakeMessaging{sendFn: func(context.Context, int, portservices.SendMessageInput) (*domain.Message, error) {
		return nil, fmt.Errorf("%w: nope", domain.ErrForbidden)
	}}
	r := &resolvers.Resolver{Messaging: fake}
	ctx := auth.WithAuthenticatedUser(context.Background(), &domain.AuthenticatedUser{ID: 1})
	_, err := r.Mutation().SendMessage(ctx, model.SendMessageInput{ThreadID: "2", Body: "x", ClientNonce: "n"})
	assert.ErrorContains(t, err, "access denied")
}
```

- [ ] **Step 6: Implement `messaging.resolvers.go`**

Patterns:
- Every resolver: `actor, ok := auth.ForContext(ctx)` → if `!ok` return `nil, domain.ErrForbidden` (the `@auth` directive already blocks unauth, this is belt-and-braces for direct tests).
- ID parsing: `strconv.Atoi(idString)` for `ID!` args; wrap parse errors as `domain.ErrInvalidInput`.
- Mutations delegate to `r.Messaging`, then map `*domain.X` → `*model.X` with small local `toModelMessage` / `toModelThread` helpers (put them in `helpers.go`). Timestamps: `.Format(time.RFC3339)`.
- `Message.sender` / `ThreadParticipant.user` / `MessageThread.participants` — field resolvers that call `r.UserService` for the `*model.User`. `threadId` is `strconv.Itoa`.
- `MessageThread.unreadCount` / `myLastReadSeq` / `latestSeq` — compute from the domain thread + a `r.Messaging` history/max-seq call; simplest: add `LatestSeq int64` and `MyLastReadSeq int64` onto a small resolver-local struct returned by the service, OR resolve them as fields using `msgRepo.MaxSeq` exposed through the service. Add `MaxSeq(ctx, actor, threadID int) (int64, error)` to `MessagingService` if needed (update Task 8 port + impl + mocks).
- **`threadEvents` subscription resolver:**
  ```go
  func (r *subscriptionResolver) ThreadEvents(ctx context.Context, threadID string, sinceSeq *int) (<-chan model.ThreadEvent, error) {
      actor, ok := auth.ForContext(ctx)
      if !ok { return nil, domain.ErrForbidden }
      tid, err := strconv.Atoi(threadID)
      if err != nil { return nil, fmt.Errorf("%w: threadId", domain.ErrInvalidInput) }
      if err := r.Messaging.AssertParticipant(ctx, actor.ID, tid); err != nil { return nil, err }

      out := make(chan model.ThreadEvent, 64)
      domainCh, unsub := r.Hub.Subscribe(tid)

      go func() {
          defer close(out)
          defer unsub()

          // Replay first if sinceSeq provided.
          if sinceSeq != nil {
              msgs, err := r.Messaging.ListSince(ctx, actor.ID, tid, int64(*sinceSeq))
              if err == nil {
                  for _, m := range msgs {
                      select {
                      case out <- toModelMessagePosted(m):
                      case <-ctx.Done():
                          return
                      }
                  }
              }
          }

          for {
              select {
              case <-ctx.Done():
                  return
              case evt, open := <-domainCh:
                  if !open {
                      // hub dropped us (backpressure/reset) — tell the client to re-sync.
                      select {
                      case out <- model.StreamReset{ThreadID: threadID}:
                      case <-ctx.Done():
                      }
                      return
                  }
                  select {
                  case out <- toModelThreadEvent(evt):
                  case <-ctx.Done():
                      return
                  }
              }
          }
      }()
      return out, nil
  }
  ```
- `toModelThreadEvent(domain.ThreadEvent) model.ThreadEvent` — type switch mapping each domain variant to its `model.*` struct (`model.MessagePosted{Message: toModelMessage(e.Message)}`, etc.). Put in `helpers.go`.
- `inboxEvents` — minimal viable: subscribe the actor to a per-user hub topic. Simplest implementation that satisfies the spec: reuse the Hub keyed by a negative pseudo-thread-id `-userID`, and have the service publish an `InboxEvent`-shaped envelope on message send... **Defer complexity:** for this task, implement `inboxEvents` to emit one event immediately (current unread summary per thread) then close, OR wire it to a `Hub.SubscribeInbox(userID)` topic that the listener also feeds from `MESSAGE_POSTED` by looking up thread participants. Pick `SubscribeInbox`; add `Hub.SubscribeInbox(userID int) (<-chan domain.InboxEvent, func())` and, in `PublishEnvelope` for `MESSAGE_POSTED`, after loading the message, load participant user IDs (`threadRepo.GetThread`) and push an `InboxEvent` to each participant's inbox channel. This means the Hub needs a `threadRepo repositories.ThreadRepository` dependency — add it to `NewHub` (update Task 9 signature and its tests to pass a stub).

- [ ] **Step 7: Wire `main.go`**

After the existing repo/service construction:

```go
threadRepo := postgres.NewGormThreadRepository(db)
messageRepo := postgres.NewGormMessageRepository(db)
hub := realtime.NewHub(messageRepo, threadRepo)
presence := realtime.NewPresenceTracker()
limiter := services.NewSlidingWindowLimiter(10, 10*time.Second)
messagingService := services.NewMessagingService(threadRepo, messageRepo, hub, limiter)

listener := realtime.NewListener(dsn, hub)
listenerCtx, stopListener := context.WithCancel(context.Background())
go listener.Run(listenerCtx)
defer stopListener()
```

Add to `resolvers.NewResolver(...)` call: `messagingService, hub, presence`.

Add the WebSocket transport with auth:

```go
srv.AddTransport(transport.Websocket{
	KeepAlivePingInterval: 10 * time.Second,
	InitFunc: func(ctx context.Context, initPayload transport.InitPayload) (context.Context, *transport.InitPayload, error) {
		token := initPayload.Authorization() // reads "Authorization" or "authorization"
		id, err := verifier.Verify(ctx, strings.TrimPrefix(token, "Bearer "))
		if err != nil || id.ClerkID == "" {
			return ctx, nil, fmt.Errorf("unauthenticated websocket")
		}
		user, err := userRepo.GetByClerkID(ctx, id.ClerkID)
		if err != nil {
			return ctx, nil, fmt.Errorf("unknown user")
		}
		authUser := &domain.AuthenticatedUser{ID: user.ID, ClerkID: id.ClerkID, Username: user.Username, Email: user.Email, Role: user.Role}
		return auth.WithAuthenticatedUser(ctx, authUser), &initPayload, nil
	},
})
```

`verifier` is a shared `auth.NewClerkTokenVerifier()` (construct once, reuse for `auth.Middleware` too). Add `transport.Websocket` **before** `transport.POST{}` is fine; order among GET/POST/Websocket is not sensitive here, but keep `transport.POST{}` last as the existing comment in gqlgen docs suggests. Also widen CORS `AllowedMethods` is not needed for WS (WS upgrade is a GET). Ensure the chi router does not block `Upgrade` — it does not by default.

- [ ] **Step 8: Build + run all tests**

Run: `cd backend && go build ./...`
Expected: no errors.

Run: `cd backend && go test ./... `
Expected: PASS (DB-gated tests SKIP if `DATABASE_URL` unset; run once with it set to confirm).

- [ ] **Step 9: Commit**

```bash
git add backend/schema.graphql backend/gqlgen.yml backend/internal/adapters/graphql/ backend/internal/adapters/realtime/ backend/internal/core/ backend/cmd/server/main.go backend/test/resolvers/messaging_resolver_test.go
git commit -m "feat(messaging): GraphQL schema, subscription resolvers, websocket transport, wiring

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AMzMYxN9wh1wmKVQorbcyb"
```

---

## Task 12: End-to-end integration tests (self-verification)

**Files:**
- Create: `backend/test/messaging/e2e_test.go`
- Create: `backend/test/messaging/harness_test.go` (shared setup)

**Interfaces:**
- Consumes: everything above.
- Produces: an executable proof that two users chat in real time over a real WebSocket + real Postgres, plus reconnect replay, read receipts, cross-instance fan-out, and idempotency.

- [ ] **Step 1: Build the harness**

`harness_test.go`:
- `newServer(t)` — connect GORM to `DATABASE_URL` (skip if unset), build `threadRepo/messageRepo/hub/presence/limiter/messagingService`, start a `realtime.Listener` on a `t.Cleanup`-cancelled context, build the gqlgen `handler.New(...)` with `transport.Websocket{}` whose `InitFunc` trusts a test header: if `initPayload["testUserId"]` is set, load that user directly (guard with `if os.Getenv("APP_ENV")=="test"` — set via `t.Setenv`). Wrap in `httptest.NewServer`. Return the base URL + repos.
- `wsClient(t, url, userID)` — open a `graphql-transport-ws` client. Use `github.com/hasura/go-graphql-client` if already vendored; otherwise implement a ~60-line raw client over `github.com/coder/websocket` (already an indirect dep): send `connection_init` with `{"testUserId": userID}`, wait `connection_ack`, then `subscribe` with the query, expose a `Next(ctx) (json.RawMessage, error)`.
- `mkUser(t, db, name)` / cleanup helpers.

- [ ] **Step 2: Write `TestE2E_TwoUsersChat`**

```go
func TestE2E_TwoUsersChat(t *testing.T) {
	srv := newServer(t)
	a := mkUser(t, srv.db, "e2e-a")
	b := mkUser(t, srv.db, "e2e-b")

	thread := mustCreateThread(t, srv, a, []int{a, b}) // via GraphQL mutation as user a

	subB := wsClient(t, srv.url, b)
	subB.Subscribe(t, `subscription($t:ID!){ threadEvents(threadId:$t){ ... on MessagePosted { message { seq body sender { id } } } } }`,
		map[string]any{"t": fmt.Sprint(thread)})

	mustSendMessage(t, srv, a, thread, "hello from a", "n-a-1")

	got := subB.NextMessagePosted(t, 3*time.Second)
	assert.Equal(t, "hello from a", got.Body)
	assert.EqualValues(t, 1, got.Seq)

	// reverse direction
	subA := wsClient(t, srv.url, a)
	subA.Subscribe(t, sameQuery, map[string]any{"t": fmt.Sprint(thread)})
	mustSendMessage(t, srv, b, thread, "hi back", "n-b-1")
	got2 := subA.NextMessagePosted(t, 3*time.Second)
	assert.Equal(t, "hi back", got2.Body)
	assert.EqualValues(t, 2, got2.Seq)
}
```

- [ ] **Step 3: Write `TestE2E_ReconnectReplaysMissed`**

```go
// subB subscribes, receives seq 1. Close subB. Send seq 2 and 3.
// Re-subscribe subB with sinceSeq: 1. Assert it replays exactly seq 2 then seq 3,
// then a live seq 4 sent afterwards arrives.
```

- [ ] **Step 4: Write `TestE2E_ReadReceiptPropagates`**

```go
// subA subscribes to threadEvents. User b calls markThreadRead(thread, seq:2) via mutation.
// subA receives a ReadReceiptChanged with userId == b and lastReadSeq == 2.
```

- [ ] **Step 5: Write `TestE2E_CrossInstanceFanout`**

```go
// newServer twice against the SAME DATABASE_URL -> srv1, srv2 (each with its own Listener + Hub).
// subA on srv1, subB on srv2, same thread. Send via srv1 as a.
// Assert subB (on srv2) receives the MessagePosted — proves LISTEN/NOTIFY crossed processes.
```

- [ ] **Step 6: Write `TestE2E_IdempotentSend`**

```go
// Send with clientNonce "dup" -> message seq 1. Send again same nonce, different body ->
// returns seq 1 (original body), and threadMessages shows exactly one message.
```

- [ ] **Step 7: Run the suite**

Run: `cd backend && DATABASE_URL="$DATABASE_URL" APP_ENV=test go test ./test/messaging/ -v`
Expected: all PASS. If any test flakes on timing, raise its wait to 5s (do not add `time.Sleep` before assertions — poll the channel).

- [ ] **Step 8: Commit**

```bash
git add backend/test/messaging/
git commit -m "test(messaging): end-to-end two-user chat, replay, receipts, cross-instance, idempotency

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AMzMYxN9wh1wmKVQorbcyb"
```

---

## Task 13: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Build**

Run: `cd backend && go build ./...`
Expected: zero errors.

- [ ] **Step 2: Vet + format**

Run: `cd backend && make fmt`
Run: `cd backend && make lint`
Expected: clean (or only pre-existing warnings unrelated to messaging files).

- [ ] **Step 3: Full backend test run (no DB)**

Run: `cd backend && go test ./...`
Expected: PASS; DB-gated suites SKIP.

- [ ] **Step 4: Full backend test run (with DB)**

Run: `cd backend && DATABASE_URL="$DATABASE_URL" APP_ENV=test go test ./...`
Expected: PASS including `test/repositories`, `test/realtime`, `test/messaging`.

- [ ] **Step 5: Confirm codegen is committed and clean**

Run: `cd backend && make graphql-gen`
Run: `git status --porcelain`
Expected: no unstaged changes to `generated.go` / `models_gen.go`.

- [ ] **Step 6: Manual smoke (optional but recommended)**

Run: `cd backend && make run`
In the GraphQL Playground (`http://localhost:8080/`), run `sendMessage` and a `threadEvents` subscription in two tabs with valid Clerk tokens; confirm the message appears live. Kill the server.

- [ ] **Step 7: Migration round-trip once more**

Run: `cd backend && make migrate-down`
Run: `cd backend && make migrate-up`
Expected: clean both ways.

- [ ] **Step 8: Commit any formatting-only changes**

```bash
git add -A
git commit -m "chore(messaging): gofmt + lint pass

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AMzMYxN9wh1wmKVQorbcyb"
```

---

## Self-Review

**1. Spec coverage**

| Spec element | Task |
|---|---|
| `message_threads` / `thread_participants` / `messages` / `thread_sequences` + triggers | 1 |
| Per-thread monotonic `seq` (BEFORE INSERT trigger) | 1, verified 6 |
| `pg_notify('thread_events', envelope)` on insert | 1, verified 10 |
| Retention: prune beyond newest 1000 at `seq % 50 == 0` | 1, verified 6 |
| `last_message_at` denormalization | 1 (touch trigger), used 5 |
| Read receipts via `last_read_seq` (forward-only) | 5 (`SetLastRead`), 8 (`MarkRead`), verified 12 |
| Domain models, enums, realtime events | 2 |
| `TokenVerifier` port + Clerk adapter + middleware refactor | 3 |
| Repository ports + GORM models + mappers | 4 |
| `ThreadRepository` (create, 1:1 dedup, list, add/leave, read pointer) | 5 |
| `MessageRepository` (insert via trigger, history paging, replay, MaxSeq) | 6 |
| Idempotent send via `client_nonce` unique constraint | 1 (constraint), 6 (repo), verified 12 |
| Rate limiting (10 / 10s / user) | 7, 8 |
| Body size cap 8 KB | 8 |
| `MessagingService` (all operations + authorization) | 8 |
| `EventPublisher` seam for ephemerals | 8, implemented 9 |
| Hub: fan-out, buffered 64, backpressure drop + StreamReset, ResetAll | 9 |
| Ephemeral typing/read/participant over same channel | 8 (publish), 9 (map), 10 (cross-process via NOTIFY — see note) | 
| Dedicated `LISTEN` connection with exponential-backoff reconnect + reset | 10 |
| Presence: refcount, 15s grace, 20s heartbeat, 45s expiry, online = any-node | 10 (tracker); wiring of grace-timer + heartbeat NOTIFY in 11 (see gap below) |
| GraphQL schema (Query/Mutation/Subscription, `ThreadEvent` union) | 11 |
| `threadEvents(sinceSeq)` single replay-then-live path | 11 |
| Participant removal closes the stream | 11 (`StreamReset` on unsub) + partial (see gap) |
| WebSocket transport + Clerk `InitFunc` | 11 |
| `inboxEvents` per-user stream | 11 (`SubscribeInbox`) |
| Two-user chat, reconnect replay, receipts, cross-instance, idempotency tests | 12 |
| Browser smoke, load script | out of scope for this plan — see gaps |

**2. Placeholder scan**

- Task 11 Step 6 leaves two implementation choices open (`inboxEvents` strategy, `unreadCount` field resolution). Resolved inline: use `Hub.SubscribeInbox` and add `MessagingService.MaxSeq`. These are concrete instructions, not TODOs — the executor must apply them and propagate the signature change back to Task 8/9 mocks.
- Task 12 Step 1 offers "use hasura client if vendored, else raw coder/websocket client" — this is a genuine either/or dictated by what's already in `go.mod`; both paths are specified.

**3. Type consistency**

- `Hub` signature changes from `NewHub(msgRepo)` (Task 9) to `NewHub(msgRepo, threadRepo)` (Task 11 Step 6). **Action for executor:** when doing Task 11, update `realtime.NewHub` and every call site + `hub_test.go` stub to the two-arg form. Flagged here so it is not a silent break.
- `MessagingService` gains `MaxSeq(ctx, actor, threadID int) (int64, error)` in Task 11. Update the port (Task 8 file), impl, and `fakeMessaging`/mock in tests.
- `EventEnvelope.Type` string constants used across trigger SQL (`"MESSAGE_POSTED"`), service (`"READ_RECEIPT_CHANGED"`, `"TYPING_CHANGED"`, `"PARTICIPANT_CHANGED"`), and Hub switch — keep this exact set; add `"PRESENCE_CHANGED"` and `"STREAM_RESET"` only in the Hub/listener, never from SQL.

**Known gaps (intentional, not blocking backend completion):**

1. **Presence grace-timer + heartbeat NOTIFY wiring.** Task 10 builds the `PresenceTracker`; the 15 s offline grace timer and the 20 s heartbeat `pg_notify('thread_events', {type:"PRESENCE_CHANGED",...})` need a small owner — wire them in the WebSocket `InitFunc`/connection-close path in Task 11 Step 7 (on connect: `presence.Connect`; if first, publish online; on `ctx.Done()`: `presence.Disconnect`; if last, `time.AfterFunc(15*time.Second, ...)` then publish offline if still zero). If the executor finds this expands Task 11 too far, split it into **Task 11b: presence lifecycle wiring** with its own test (`TestPresenceLifecycle_GraceTimer` using the fake clock + a stubbed publisher).
2. **Browser smoke test and load script** from the spec's testing section are frontend/ops deliverables — they belong to the separate frontend plan and a follow-up ops task, not this backend plan.
3. **Frontend integration** (`graphql-ws` client, TanStack cache wiring, Svelte components) is a separate plan: `docs/superpowers/plans/2026-09-XX-messaging-frontend.md`.

---

## Execution Handoff

Two execution options:

**1. Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration. Best given the 13 tasks and the cross-task signature changes flagged in Self-Review.

**2. Inline Execution** — execute tasks in this session with checkpoints for review.
