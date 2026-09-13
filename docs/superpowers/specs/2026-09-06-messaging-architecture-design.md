# Messaging Architecture Design

**Date:** 2026-09-06
**Status:** Draft — pending review
**Author:** James Jordan (with Claude)

## Summary

Add a real-time, persistent, user-to-user messaging feature to Perspectize.
Users can create threads (1:1 or group), exchange text messages in real time,
see message history (capped at 1,000 messages per thread), see read receipts,
typing indicators, and participant presence. Messages for offline users are
persisted and delivered on their next connection.

The transport is **GraphQL subscriptions over WebSocket** (gqlgen), and
cross-instance real-time fan-out is handled by **PostgreSQL `LISTEN/NOTIFY`**.
No new infrastructure services (no Redis, no message broker, no SaaS) are
introduced.

## Goals

- 1:1 and arbitrary-size group threads.
- Sub-second delivery to online participants.
- Durable history, retention-bounded to roughly the newest 1,000 messages per
  thread (bounded above — pruning runs periodically, not on every insert, so a
  thread may briefly hold a few dozen more).
- Read receipts (per-participant last-read pointer).
- Typing indicators (ephemeral).
- Presence: online/offline per user.
- Offline participants receive missed messages on reconnect (replay), with no
  gaps and correct ordering.
- Survives backend redeploys with no message loss — only a brief reconnect blip.
- Runs on a single backend instance now; the fan-out design is already
  multi-instance-ready with no code change.
- The two-users-chatting scenario has real, repeatable automated verification.

## Non-Goals (deferred)

- **Attachments / images / non-text payloads.** Deferred to a fast-follow.
  Requires provisioning object storage (none exists on the project today).
- **Web push / notification to a closed app or tab.** Deferred. v1 "offline
  delivery" means the message is persisted and replayed on next open; it does
  not proactively interrupt a user whose app is closed. Adding this later does
  not change the core architecture — the "user has no live connection" signal
  already exists in the hub.
- Message edit/delete UI, reactions, threaded replies, full-text search.
- Moderation / reporting tooling.
- The 1,000-connection load test — **both the load script and its run are
  deferred to a follow-up.** The backend implementation plan descoped delivery
  of the script; it is tracked as a separate perf task with no dependency on the
  messaging backend merge.

## Context

- Backend: Go, gqlgen (schema-first), GORM + pgx/v5, PostgreSQL 17, Clerk auth,
  hexagonal architecture. No GraphQL subscriptions exist today.
- Frontend: SvelteKit (Svelte 5 runes), TanStack Query, `graphql-request`.
- Hosting: Sevalla. Backend is a single always-on `h1` pod (300m CPU / 300 MB
  RAM). PostgreSQL is a managed `db1` instance (250m / 250 MB, 1 TB allocated,
  ~63 MB used), separate from the app container. No object storage provisioned.
- Frontend static site is served from Cloudflare edge, separate from the backend
  origin. The WebSocket connects directly to the backend app origin.

### Cost impact

- No new billable service. The messaging machinery adds no Redis / broker / SaaS.
- **Backend pod:** at the 1,000-concurrent-user design target, expect a one-tier
  bump (target ~1 CPU / ~2 GB RAM). 1,000 always-on WebSocket connections in Go
  cost roughly 50–100 MB (per-connection buffers, goroutine stacks, gqlgen
  per-subscription goroutines/channels) on top of the existing API surface, which
  does not fit comfortably in 300 MB. Still a single small pod. This is a scaling
  trigger, not a launch cost.
- **PostgreSQL:** marginal. Storage stays bounded by the 1,000/thread cap. One
  extra dedicated connection per process for `LISTEN`. `db1` is expected to hold
  well into the hundreds of concurrent users; revisit only if instances are added
  or CPU pressure appears.
- **HA** (2+ pods) is a separate, optional decision — it doubles compute and
  relies on the cross-instance fan-out this design already provides.

#### Current Sevalla spend (baseline)

| Service | Tier | Price |
|---|---|---|
| Backend app | Hobby H1 (0.3 CPU / 0.3 GB) | $5/mo |
| PostgreSQL | Database 1 (0.25 CPU / 0.25 GB / 1 GB storage) | $5/mo |
| **Total** | | **~$10/mo** |

Plus negligible egress ($0.10/GB) and build minutes ($0.02/min). The "1000 GB"
storage figure reported for the DB is a cap/display value, not billed capacity —
DB1 includes 1 GB and ~63 MB is in use.

#### Month-one projection: 10 users, 10 messages/day (~3,000 messages/month)

**Expected increase: ~$0/month.** No pod or DB bump is needed at this scale.

- **Compute:** ~10 concurrent WebSocket connections use kilobytes of RAM; H1's
  300 MB is untouched.
- **Egress:** ~3,000 messages/month at a generous 10 KB delivered each ≈ 30 MB ×
  $0.10/GB ≈ $0.003/mo.
- **DB storage:** ~1 MB/month of new rows, plateauing under the 1,000/thread cap.
  Decades of headroom within DB1's 1 GB.
- **Build minutes:** more frequent deploys during active development, perhaps
  +$1–3/mo while shipping, then near-zero.
- **New services:** none (no Redis; no object storage — attachments deferred).

Month-one total: **~$10–13/mo**, essentially unchanged from baseline.

#### Scaling cost reference

| Concurrent users | App pod | App cost | Increase vs baseline |
|---|---|---|---|
| ~10 (month 1) | H1 | $5/mo | +$0 |
| Low hundreds | S1 (0.5 CPU / 1 GB) | $10/mo | +$5/mo |
| ~1,000 (design target) | S2 (1 CPU / 2 GB), possibly S3 (2 CPU / 4 GB) for fan-out CPU headroom | $40–80/mo | +$35–75/mo |

`db1` likely holds into the hundreds of concurrent users; `db2` is $34/mo if
outgrown. Prices from sevalla.com/application-hosting/pricing and
sevalla.com/database-hosting/pricing as of 2026-09.

## Alternatives considered

**B — Hand-rolled `/ws` endpoint + Redis pub/sub.** Custom JSON protocol, own
reconnect logic, Redis for fan-out + presence + typing. More control and less
coupling to GraphQL, but a new auth path, a new client protocol, a new infra
dependency to run on Sevalla, and materially more bespoke code to test. Worth it
only if messaging diverges hard from GraphQL or needs extreme throughput.
Rejected for v1.

**C — SSE downstream + GraphQL mutations upstream.** Simplest transport,
proxy-friendly, `EventSource` auto-reconnects. But unidirectional: typing
indicators (in scope) become awkward, and many per-thread streams need HTTP/2.
Rejected because typing is in scope.

**gRPC internally.** No benefit at this scale. No internal network hop exists in
a single process (the hub is goroutines + channels). Cross-instance `NOTIFY`
latency is sub-millisecond and not the bottleneck; per-connection CPU (JSON
encoding, WS framing) is. gRPC becomes relevant only if messaging is later split
into its own deployable service, or if `LISTEN/NOTIFY` is outgrown for node-to-
node fan-out (well past 1,000 connections). Not adopted.

## Architecture

```
Browser (graphql-ws client)
        │  WebSocket (graphql-transport-ws), Clerk token in connectionParams
        ▼
gqlgen HTTP handler ── transport.Websocket ── InitFunc → TokenVerifier (Clerk)
        │
        ▼
GraphQL resolvers ──► MessagingService ──► ThreadRepository / MessageRepository (GORM)
        │                    │
        │                    ├─ INSERT message (BEFORE INSERT trigger allocates per-thread seq)
        │                    │  AFTER INSERT trigger → pg_notify('thread_events', {ids})
        │                    │
        ▼                    ▼
Realtime Hub ◄──────── dedicated LISTEN connection on 'thread_events'
  in-memory map[threadID] → set of subscriber channels
  loads full message row on NOTIFY, pushes to local subscribers
```

- **Single NOTIFY channel** (`thread_events`). Every process receives every
  event and drops those for which it has no local subscribers. Simpler than
  per-thread `LISTEN` ref-counting and well within notify volume at this scale.
- **NOTIFY payload is a compact envelope** — `{type, thread_id, seq, message_id}`
  — always far under the 8 KB `NOTIFY` limit. On receipt the hub loads the full
  message row once, then fans out in memory.
- **Ephemeral signals** (typing, presence) use the same channel via
  `pg_notify('thread_events', …)` called directly from resolver/hub code — no
  row written, crosses instances, harmlessly dropped when nobody is listening.

### Components

| Component | Location | Responsibility |
|---|---|---|
| `MessagingService` | `internal/core/services/messaging_service.go` | Business logic: create thread, send, mark read, add/remove participants, list threads, get history, typing. Authorization (caller is an active participant). Rate limiting. |
| `ThreadRepository` (port) | `internal/core/ports/repositories/` | Thread + participant persistence. |
| `MessageRepository` (port) | `internal/core/ports/repositories/` | Message persistence, history paging, retention. |
| GORM impls | `internal/adapters/repositories/postgres/` | Separate-model pattern (domain ↔ GORM mappers). Cursor pagination via existing helpers. |
| `Hub` | `internal/adapters/realtime/hub.go` | In-memory subscriber registry; dedicated `LISTEN` connection; NOTIFY → row load → local fan-out; backpressure handling; presence tracking. |
| `TokenVerifier` (port) | `internal/core/ports/` | `Verify(ctx, token) (Identity, error)`. |
| `ClerkVerifier` | `internal/adapters/auth/clerk_verifier.go` | Wraps Clerk SDK. Existing HTTP-middleware verification logic moves here. |
| Resolvers | `internal/adapters/graphql/resolvers/messaging_resolver.go` | Query/Mutation/Subscription resolvers → `MessagingService` + `Hub`. |
| Frontend messaging module | `frontend/src/lib/messaging/` + `frontend/src/lib/components/messaging/` | `graphql-ws` client, TanStack Query integration, thread UI. |

## Data model

New migrations, numbered from `000017` upward (confirm against
`ls backend/migrations/` at execution — highest existing is `000016`).

### `message_threads`

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial PK | Exposed via `IntID` scalar. |
| `title` | text NULL | Present for named group threads; NULL for 1:1 and untitled groups. |
| `created_by` | bigint FK → users | |
| `last_message_at` | timestamptz NOT NULL | Denormalized; updated on each send. Drives inbox sort. |
| `created_at` | timestamptz NOT NULL default now() | |

### `thread_participants`

| Column | Type | Notes |
|---|---|---|
| `thread_id` | bigint FK → message_threads | |
| `user_id` | bigint FK → users | |
| `role` | text NOT NULL | `OWNER` \| `MEMBER`. UPPERCASE, bound in `gqlgen.yml`. |
| `last_read_seq` | bigint NOT NULL default 0 | Per-user read pointer. Basis for read receipts. |
| `muted` | boolean NOT NULL default false | Reserved for future notification preferences. |
| `joined_at` | timestamptz NOT NULL default now() | |
| `left_at` | timestamptz NULL | Soft-leave. A row with `left_at` set is not an active participant. |

Primary key `(thread_id, user_id)`. Index `(user_id) WHERE left_at IS NULL` for
inbox queries.

### `messages`

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial PK | |
| `thread_id` | bigint FK → message_threads | |
| `sender_id` | bigint FK → users | |
| `seq` | bigint NOT NULL | Per-thread monotonic sequence. Allocated by trigger. |
| `body` | text NOT NULL | Max 8 KB enforced in the service layer. |
| `client_nonce` | text NOT NULL | Client-supplied idempotency key. |
| `created_at` | timestamptz NOT NULL default now() | |
| `edited_at` | timestamptz NULL | Reserved (no edit UI in v1). |
| `deleted_at` | timestamptz NULL | Reserved (no delete UI in v1). |

Constraints / indexes:
- `UNIQUE (thread_id, seq)`
- `UNIQUE (thread_id, sender_id, client_nonce)` — idempotent send.
- `INDEX (thread_id, seq DESC)` — history paging and latest-N reads.

### `thread_sequences`

| Column | Type | Notes |
|---|---|---|
| `thread_id` | bigint PK FK → message_threads | |
| `next_seq` | bigint NOT NULL default 1 | |

A row is created when a thread is created.

### Triggers

1. **`BEFORE INSERT` on `messages`** — atomically claim the next sequence:
   `UPDATE thread_sequences SET next_seq = next_seq + 1 WHERE thread_id = NEW.thread_id RETURNING next_seq - 1`
   and assign it to `NEW.seq`. Guarantees strictly increasing, monotonic
   per-thread ordering under concurrency. `seq` is not guaranteed gapless: an
   idempotent-send retry that hits the `client_nonce` conflict consumes a
   sequence value before `ON CONFLICT DO NOTHING` discards the row, so isolated
   values may be skipped. Replay and paging use `seq >`, never a count, so gaps
   are immaterial to ordering and completeness.

2. **`AFTER INSERT` on `messages`** — publish and enforce retention:
   - `pg_notify('thread_events', json_build_object('type','MESSAGE_POSTED','thread_id',NEW.thread_id,'seq',NEW.seq,'message_id',NEW.id)::text)`
   - When `NEW.seq % 50 = 0`: `DELETE FROM messages WHERE thread_id = NEW.thread_id AND seq <= NEW.seq - 1000`.
     Hard delete. Bounded storage, minimal write amplification, `seq` continuity
     preserved (replay uses `seq >`, never a count).

### Read receipts (derived, not stored)

"Read by" for a message = active participants whose `last_read_seq >= message.seq`.
Adequate within a 1,000-message window. `markThreadRead` moves the pointer
forward only (never backward) and emits a `READ_RECEIPT_CHANGED` event.

## GraphQL API

Schema additions to `backend/schema.graphql`, then `make graphql-gen`.

```graphql
type MessageThread {
  id: ID!
  title: String
  participants: [ThreadParticipant!]!
  lastMessageAt: String!
  latestSeq: IntID!            # max message seq in the thread (0 if empty)
  myLastReadSeq: IntID!        # caller's read pointer
  unreadCount: Int!            # messages with seq > myLastReadSeq
  createdAt: String!
}

type ThreadParticipant {
  user: User!
  role: ThreadRole!
  lastReadSeq: IntID!
  joinedAt: String!
}

enum ThreadRole { OWNER MEMBER }

type Message {
  id: ID!
  threadId: ID!
  sender: User!
  seq: IntID!
  body: String!
  createdAt: String!
}

# --- events ---

union ThreadEvent =
    MessagePosted
  | ReadReceiptChanged
  | TypingChanged
  | ParticipantChanged
  | StreamReset

type MessagePosted        { message: Message! }
type ReadReceiptChanged   { threadId: ID!  userId: ID!  lastReadSeq: IntID! }
type TypingChanged        { threadId: ID!  userId: ID!  typing: Boolean! }
type ParticipantChanged   { threadId: ID!  userId: ID!  change: ParticipantChangeKind! }
enum ParticipantChangeKind { ADDED  REMOVED }
# StreamReset tells the client to re-sync history from `sinceSeq`; emitted after
# a hub LISTEN reconnect or when a subscriber is dropped for backpressure.
type StreamReset          { threadId: ID! }

type InboxEvent {
  threadId: ID!
  lastMessageAt: String!
  latestSeq: IntID!
  unreadCount: Int!
}

# --- operations ---

extend type Query {
  messageThreads(first: Int, after: String): MessageThreadConnection!   # sorted by lastMessageAt desc
  messageThread(id: ID!): MessageThread
  threadMessages(threadId: ID!, first: Int, before: IntID): MessageConnection!  # backward history paging
}

extend type Mutation {
  createMessageThread(input: CreateMessageThreadInput!): MessageThread!
  sendMessage(input: SendMessageInput!): Message!
  markThreadRead(threadId: ID!, seq: IntID!): MessageThread!
  setTyping(threadId: ID!, typing: Boolean!): Boolean!
  addThreadParticipants(threadId: ID!, userIds: [ID!]!): MessageThread!
  leaveThread(threadId: ID!): Boolean!
}

input CreateMessageThreadInput { participantUserIds: [ID!]!  title: String }
input SendMessageInput { threadId: ID!  body: String!  clientNonce: String! }

extend type Subscription {
  threadEvents(threadId: ID!, sinceSeq: IntID): ThreadEvent!
  inboxEvents: InboxEvent!
}
```

### Behaviors

- **Authorization.** Every query/mutation resolver verifies the caller is an
  active participant (`left_at IS NULL`) of the target thread; otherwise
  `FORBIDDEN`. `createMessageThread` requires the caller to be among the
  participants. A 1:1 thread between the same two users is deduplicated (return
  the existing thread).
- **`threadEvents` reconnect/replay is a single path.** On (re)subscribe with
  `sinceSeq`, the resolver first drains `messages WHERE thread_id = ? AND seq >
  sinceSeq ORDER BY seq` into the channel as `MessagePosted` events, then
  attaches the subscriber to the hub for live events. A client that passes no
  `sinceSeq` gets only live events (it is expected to have loaded history via
  `threadMessages`).
- **Participant removal.** When the caller is removed from a thread, the server
  emits `ParticipantChanged(REMOVED)` and closes their `threadEvents` stream.
- **`inboxEvents`** is a per-user stream (keyed on the authenticated identity)
  that emits a summary whenever any thread the user is in receives a message or a
  read-state change. Used to update the thread list / unread badges without an
  open per-thread subscription.
- **`setTyping`** writes nothing; it emits `TypingChanged` via NOTIFY. The client
  is responsible for sending `typing: false` after 5 s of inactivity or on send.

## Auth seam

- New port: `TokenVerifier { Verify(ctx context.Context, token string) (Identity, error) }`
  in `internal/core/ports/`.
- `internal/adapters/auth/clerk_verifier.go` implements it, wrapping the Clerk
  SDK. The existing HTTP-middleware verification logic is refactored to call this
  interface so HTTP and WebSocket share one code path.
- gqlgen WebSocket transport `InitFunc`: read `connectionParams.authToken`, call
  `TokenVerifier.Verify`, put the resulting `Identity` into the connection
  context (same context key the HTTP path uses). Reject the connection on
  verification failure.
- Tests inject a `fakeVerifier` mapping opaque strings → identities, enabling
  multi-user tests without minting real Clerk JWTs.

## Realtime hub

- `Hub` holds `map[threadID]map[subID]chan ThreadEvent` under an `RWMutex`, plus
  a presence registry (below).
- **One dedicated `LISTEN thread_events` connection per process** (a
  `pgx.Conn`/`lib/pq` listener separate from the GORM pool). On payload:
  decode the envelope; if `type == MESSAGE_POSTED` load the message row once;
  fan out to local subscribers of `thread_id`.
- **Publish.** Message posts are published by the `AFTER INSERT` trigger (so it
  is transactional with the write). Ephemeral events (`TypingChanged`,
  `ReadReceiptChanged`, `ParticipantChanged`, presence) are published by the
  service/hub calling `pg_notify` directly.
- **Backpressure.** Each subscriber channel is buffered (capacity 64). If a send
  would block, the hub drops that subscriber and delivers a final `StreamReset`
  (the client re-syncs via `sinceSeq`). The hub itself never blocks on a slow
  consumer.
- **Listener resilience.** If the `LISTEN` connection drops, reconnect with
  exponential backoff; on recovery, emit `StreamReset` to every local subscriber
  so they replay any events missed during the gap.

### Presence

- Per process: `map[userID]int` connection counts, and `map[userID]time.Time`
  last-seen (fed by presence events from all processes + 20 s heartbeats).
- First connection for a user → `pg_notify` presence-online.
- Last connection closes → start a **15 s grace timer**; if no new connection
  arrives, `pg_notify` presence-offline. Absorbs redeploys and transient drops.
- A user is "online" if any process reports a live connection or a last-seen
  within 45 s.
- Presence is exposed as a field on `User` (e.g. `presence: PresenceState!` with
  `ONLINE`/`OFFLINE`) resolved from the hub, and presence transitions for
  participants of an open thread are delivered as part of the thread's event
  stream (modeled as a `ParticipantChanged`-adjacent event or a dedicated
  `PresenceChanged` member — finalize during planning).

## Frontend integration

- Add `graphql-ws`. One shared WebSocket client to `VITE_GRAPHQL_URL` (ws/wss),
  created lazily in the browser only. Clerk session token supplied via
  `connectionParams`, refreshed on each (re)connect.
- Queries/mutations continue through `graphql-request` + TanStack Query
  (function-wrapper pattern; `queryKey` mirrors every variable — per frontend
  `CLAUDE.md`).
- Subscription events are folded into the TanStack Query cache with
  `queryClient.setQueryData` (thread list, per-thread message pages). No parallel
  store.
- On `graphql-ws` `connected` after a drop: re-subscribe `threadEvents(threadId,
  sinceSeq: <highest seq known>)` for the open thread and `invalidateQueries` for
  the thread list.
- Components under `frontend/src/lib/components/messaging/`:
  `ThreadList.svelte`, `ThreadView.svelte` (virtualized message list),
  `MessageComposer.svelte`, `TypingIndicator.svelte`, `ReadReceiptAvatars.svelte`.
- Client sends `typing: true` on first keystroke, `typing: false` on send or
  after 5 s idle.
- Deployment note: the WebSocket connects to the backend origin directly, not
  through the Cloudflare-edge static site. No service worker is added in v1 (that
  belongs to the deferred web-push work and interacts with the frontend caching
  setup).

## Error handling

| Case | Behavior |
|---|---|
| Send to a thread the caller is not in / has left | GraphQL error, code `FORBIDDEN`. |
| Body exceeds 8 KB | GraphQL error, code `BAD_USER_INPUT`. |
| Send rate exceeded (token bucket, e.g. 10 per 10 s per user) | GraphQL error, code `RATE_LIMITED`. |
| Duplicate send (same `thread_id` + `sender_id` + `client_nonce`) | Return the existing message; no duplicate row (unique constraint). |
| Slow subscriber | Dropped after buffer (64) fills; final `StreamReset` sent; client re-syncs. |
| Hub `LISTEN` connection drops | Auto-reconnect with backoff; `StreamReset` to all local subscribers on recovery. |
| Backend redeploy | Old process drains, closing WebSockets; clients reconnect and replay via `sinceSeq`. No message loss; `seq` continuity preserved by `thread_sequences`. Presence flap absorbed by the 15 s grace timer. |
| Subscribe to a thread the caller cannot access | Subscription resolver returns an error before attaching; stream never opens. |

## Testing & self-verification

### Unit (no DB)

- Hub: subscribe / publish / unsubscribe; fan-out to multiple subscribers;
  backpressure drop + `StreamReset`; `StreamReset` broadcast on simulated
  listener reconnect.
- `MessagingService` with mocked repos: participant authorization; 1:1 dedup;
  read-pointer monotonicity; read-receipt derivation; retention boundary
  arithmetic; rate-limit bucket; idempotent send via `client_nonce`.

### Integration (DB-gated; existing `t.Skip()` when DB unavailable)

1. **Two users chatting** — real `httptest` server + real Postgres. Two
   `graphql-ws` subscription clients as two fake identities. User A `sendMessage`
   → assert B's `threadEvents` receives `MessagePosted` within a timeout; reverse
   direction. Assert both rows exist with correct `seq`.
2. **Reconnect replay** — B disconnects; A sends two messages; B re-subscribes
   with `sinceSeq` = last seen → assert exactly the two missed messages replay in
   order, then a third live message arrives.
3. **Read receipts** — B calls `markThreadRead` → assert A's stream sees
   `ReadReceiptChanged` with the right `lastReadSeq`.
4. **Cross-instance fan-out** — two in-process servers sharing one database; A on
   server 1, B on server 2 → assert delivery crosses via `LISTEN/NOTIFY`.
5. **Retention** — insert 1,050 messages; assert the oldest 50 are pruned, the
   newest 1,000 remain, and `seq` values are unchanged (no renumbering).
6. **Idempotent send** — same `client_nonce` twice → one row, same message
   returned both times.

### Browser smoke (Chrome DevTools MCP)

- Single authenticated user: send a message, see it render, reload the page, see
  it persisted.

### Load script (deferred — follow-up task)

- A Go harness that opens N WebSocket subscription clients across M threads,
  drives a message rate, and reports delivery success rate and p95 latency.
  Neither the script nor its run is part of this backend milestone; both are a
  separate perf task (see Non-Goals).

### Verification checklist (before PR)

- `go build ./...` — zero errors.
- `go test ./...` — all pass.
- `make graphql-gen` — no uncommitted diff afterward.
- `frontend/`: `pnpm run test:run` and `pnpm run check` — all pass.
- Grep for stale references if any files are renamed/moved.

## Rollout

- **v1:** everything in Goals. Single backend instance, bumped one pod tier.
  `LISTEN/NOTIFY` fan-out is multi-instance-ready but only one instance runs.
- **Fast-follow:** attachments (provision object storage, upload flow,
  `message_attachments` table, `Message.attachments` field).
- **Later:** web push (service worker, VAPID, `push_subscriptions`, send path for
  participants with no live connection); edit/delete; reactions; search; HA
  (2+ pods).

## Open items to finalize during planning

- Exact modeling of presence transitions in the `ThreadEvent` union
  (`PresenceChanged` member vs. folding into `ParticipantChanged`).
- Whether `inboxEvents` is one subscription per session or is merged into a
  single multiplexed user stream alongside per-thread `threadEvents`.
- Migration file numbers (confirm highest existing at execution time).
- Rate-limit constants and the exact body-size cap.
