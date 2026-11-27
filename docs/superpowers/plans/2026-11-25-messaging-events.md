# Messaging typed events and one cache entry point Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make messaging event kinds typed on the backend, fix the wasted message load on edits, and route every frontend cache update (streams and mutation results) through one module with a row-counting unread rule.

**Architecture:** Backend: `domain.EventKind` is a struct with unexported name so only declared kinds can be written as values; JSON stays a plain string (wire unchanged). The hub switches on the declared kinds and a test pins that every declared kind has a route. Frontend: a new `lib/messaging/messagingCache.ts` exposes plain functions over a `QueryClient` that apply thread events, mutation results, and inbox summaries; mutation hooks and both streams call only it. Unread counts follow the server's row rule: +1 for each newly seen message from someone else, deduplicated by message id, with the inbox stream's server count overwriting the list and thread summary.

**Tech Stack:** Go 1.27 (gqlgen, GORM, pgx, encoding/json), SvelteKit 2 + Svelte 5 runes, TanStack Query, Vitest.

**Spec:** none separate; the brief for P6 and the messaging glossary (`docs/glossary/messaging/GLOSSARY.md`) are the spec.

## Global Constraints

- Wire format is byte-identical: `EventEnvelope` JSON field names and omitempty rules do not change (clients are deployed).
- No migrations. If one seems needed, stop and report.
- Comments describe the code as it stands; no ticket numbers or history.
- New files under 500 lines; `frontend/src/lib/messaging/threadCache.ts` and `hub.go` may not grow past their current size without a reason.
- No `&&` in shell commands; one command per Bash call.
- Never run `make migrate-up` / `migrate ... up/down`.

## Review Focus

1. Another user's message delivered after my own later message (out of order): unread must still count it. Test: `messagingCache` scenario "out-of-order own then other".
2. The same MESSAGE_POSTED delivered twice (resubscribe / replay): unread must not double count. Test: "duplicate delivery".
3. Seq gap after retention pruning: unread counts rows, not seq distance. Test: "unread with seq gap".
4. Own read from another device advancing the read pointer: unread must not stay high. Test: "own receipt partial read".
5. Unknown inbound kind from the DB trigger (or a future kind): hub must log and drop, not panic or fan out. Test: existing `default` branch test, plus "unknown kind decodes".

## File Structure

Backend:
- Modify `backend/internal/core/domain/realtime.go`: `EventKind` type and constants, `AllEventKinds`, `Known`, `ParticipantChange`, typed envelope fields.
- Modify `backend/internal/core/services/messaging_service.go` (lines 101, 124, 180, 200, 252, 283): emit typed kinds.
- Modify `backend/internal/adapters/realtime/presence_session.go` (line 99): typed kind.
- Modify `backend/internal/adapters/realtime/hub.go` (`PublishEnvelope` ~l.313-399, `PublishEphemeral` ~l.410): typed switch, edit guard, reject unknown on publish.
- Modify `backend/internal/adapters/graphql/resolvers/helpers.go` (~l.610): ParticipantChange mapping if needed.
- Create `backend/test/domain/event_kind_test.go`: golden bytes, Known, trigger literal.
- Create `backend/test/realtime/hub_routes_test.go`: every kind routed; edit does no GetByID without thread subscribers.
- Modify existing test literals to constants in `backend/test/realtime/*.go`, `backend/internal/adapters/realtime/hub_bench_test.go`, `backend/test/services/messaging_service_test.go` where they fail to compile.

Frontend:
- Modify `frontend/src/lib/messaging/threadCache.ts`: MessagePosted rule (`alreadySeen` param), remove stale TODO, exhaustive switch.
- Create `frontend/src/lib/messaging/messagingCache.ts`: the single entry point.
- Modify `frontend/src/lib/messaging/useThreadStream.svelte.ts` and `useInboxStream.svelte.ts`: call the module.
- Modify `frontend/src/lib/queries/messaging/useSendMessage.ts`, `useEditMessage.ts`, `useDeleteMessage.ts`, `useMarkThreadRead.ts`, `useMuteThread.ts`: call the module.
- Create `frontend/tests/unit/messaging-cache-scenarios.test.ts`: real QueryClient scenarios.

## Interfaces (shared)

Backend, in `domain`:
```go
type EventKind struct{ name string }
var (
    KindMessagePosted    = EventKind{"MESSAGE_POSTED"}
    KindMessageEdited    = EventKind{"MESSAGE_EDITED"}
    KindMessageDeleted   = EventKind{"MESSAGE_DELETED"}
    KindReadReceiptChanged = EventKind{"READ_RECEIPT_CHANGED"}
    KindTypingChanged    = EventKind{"TYPING_CHANGED"}
    KindParticipantChanged = EventKind{"PARTICIPANT_CHANGED"}
    KindPresenceChanged  = EventKind{"PRESENCE_CHANGED"}
    KindStreamReset      = EventKind{"STREAM_RESET"}
)
func AllEventKinds() []EventKind
func (k EventKind) String() string
func (k EventKind) Known() bool
func (k EventKind) MarshalText() ([]byte, error)   // value receiver
func (k *EventKind) UnmarshalText(b []byte) error  // keeps unknown names
type ParticipantChange string // "ADDED" | "REMOVED" constants ParticipantAdded, ParticipantRemoved
type EventEnvelope struct { Type EventKind; ...; Change ParticipantChange; State PresenceState }
```

Frontend, in `lib/messaging/messagingCache.ts`:
```ts
applyThreadEvent(qc: QueryClient, threadId: string, me: string, event: ThreadEvent): void
applyMessageResult(qc: QueryClient, op: { kind: 'sent'; message: Message; clientNonce: string } | { kind: 'edited' | 'deleted'; message: Message }, me: string): void
applyThreadResult(qc: QueryClient, thread: MessageThread): void   // detail set + list patch
applyInboxEvent(qc: QueryClient, event: InboxEvent): void          // list + detail summary
```
Threading `alreadySeen` in `threadCache.ts`:
```ts
applyThreadEventToThread(thread, event, myUserId, known?: boolean): MessageThread
// known: the message id is already in the loaded messages cache. Defaults to seq <= latestSeq.
```

---

### Task 1: Golden wire bytes (before any type change)

**Files:**
- Create: `backend/test/domain/event_kind_test.go`

**Interfaces:**
- Consumes: current `domain.EventEnvelope` (string `Type`, string `Change`, string `State`).
- Produces: a golden test that pins JSON for every kind; later tasks must keep it green unchanged.

- [ ] **Step 1: Write the golden test** (run against current code; it must pass now)

```go
func TestEventEnvelopeWireBytesAreStable(t *testing.T) {
    cases := []struct{ name string; env domain.EventEnvelope; want string }{
        {"posted", domain.EventEnvelope{Type: "MESSAGE_POSTED", ThreadID: 1, Seq: 2, MessageID: 3},
            `{"type":"MESSAGE_POSTED","thread_id":1,"seq":2,"message_id":3}`},
        {"edited", domain.EventEnvelope{Type: "MESSAGE_EDITED", ThreadID: 1, Seq: 2, MessageID: 3},
            `{"type":"MESSAGE_EDITED","thread_id":1,"seq":2,"message_id":3}`},
        {"deleted", domain.EventEnvelope{Type: "MESSAGE_DELETED", ThreadID: 1, Seq: 2, MessageID: 3},
            `{"type":"MESSAGE_DELETED","thread_id":1,"seq":2,"message_id":3}`},
        {"read", domain.EventEnvelope{Type: "READ_RECEIPT_CHANGED", ThreadID: 1, UserID: 4, LastReadSeq: 5},
            `{"type":"READ_RECEIPT_CHANGED","thread_id":1,"seq":0,"message_id":0,"user_id":4,"last_read_seq":5}`},
        {"typing", domain.EventEnvelope{Type: "TYPING_CHANGED", ThreadID: 1, UserID: 4, Typing: true},
            `{"type":"TYPING_CHANGED","thread_id":1,"seq":0,"message_id":0,"user_id":4,"typing":true}`},
        {"participant", domain.EventEnvelope{Type: "PARTICIPANT_CHANGED", ThreadID: 1, UserID: 4, Change: "ADDED"},
            `{"type":"PARTICIPANT_CHANGED","thread_id":1,"seq":0,"message_id":0,"user_id":4,"change":"ADDED"}`},
        {"presence", domain.EventEnvelope{Type: "PRESENCE_CHANGED", ThreadID: 1, UserID: 4, State: "ONLINE"},
            `{"type":"PRESENCE_CHANGED","thread_id":1,"seq":0,"message_id":0,"user_id":4,"state":"ONLINE"}`},
        {"reset", domain.EventEnvelope{Type: "STREAM_RESET", ThreadID: 1},
            `{"type":"STREAM_RESET","thread_id":1,"seq":0,"message_id":0}`},
    }
    for _, tc := range cases {
        t.Run(tc.name, func(t *testing.T) {
            got, err := json.Marshal(tc.env)
            require.NoError(t, err)
            assert.JSONEq(t, tc.want, string(got))
            assert.Equal(t, tc.want, string(got)) // byte-identical, key order included
        })
    }
}
```
Note: `seq`, `message_id` have no omitempty, so they always appear. Confirm each `want` against the real output in Step 2 and fix the expectation only if the current code differs from this reading of the tags (the wire is the authority).

- [ ] **Step 2: Run it; it must pass on current code**

Run: `go test ./test/domain/ -run TestEventEnvelopeWireBytesAreStable -v` in `backend/`
Expected: PASS for all 8 subtests.

- [ ] **Step 3: Commit**

```bash
git add backend/test/domain/event_kind_test.go
git commit -m "test(backend): pin messaging envelope wire bytes"
```

---

### Task 2: Typed EventKind in domain, with trigger-literal test

**Files:**
- Modify: `backend/internal/core/domain/realtime.go` (lines 14-26)
- Test: `backend/test/domain/event_kind_test.go` (append)

**Interfaces:**
- Consumes: Task 1 golden test.
- Produces: the `EventKind` interface listed in the shared Interfaces section; `ParticipantChange`; `EventEnvelope.Type EventKind`, `Change ParticipantChange`, `State PresenceState`.

- [ ] **Step 1: Write failing tests**

```go
func TestKnownKindsAreExactlyTheDeclaredSet(t *testing.T) {
    kinds := domain.AllEventKinds()
    assert.Len(t, kinds, 8)
    for _, k := range kinds { assert.True(t, k.Known(), k.String()) }
    var zero domain.EventKind
    assert.False(t, zero.Known())
}

func TestUnknownInboundKindDecodesAndIsNotKnown(t *testing.T) {
    var env domain.EventEnvelope
    require.NoError(t, json.Unmarshal([]byte(`{"type":"MESSAGE_POSTDE","thread_id":1}`), &env))
    assert.Equal(t, "MESSAGE_POSTDE", env.Type.String())
    assert.False(t, env.Type.Known())
}

func TestMessagePostedLiteralMatchesTrigger(t *testing.T) {
    // The trigger in 000021 is the live definition of MESSAGE_POSTED (DB, not Go).
    b, err := os.ReadFile("../../migrations/000021_messaging_retention_unbounded.up.sql")
    require.NoError(t, err)
    assert.Contains(t, string(b), "'type',       'MESSAGE_POSTED'")
    assert.Equal(t, "MESSAGE_POSTED", domain.KindMessagePosted.String())
}
```

- [ ] **Step 2: Run; expect compile failure** (`domain.KindMessagePosted`, `AllEventKinds`, `Known` undefined).

Run: `go test ./test/domain/ -v` in `backend/`

- [ ] **Step 3: Implement in `realtime.go`**

- `EventKind struct{ name string }` with the eight package vars (names as in Interfaces).
- `AllEventKinds()` returns the eight; `Known()` checks membership against that list (a small `map` built once).
- `String()` returns `name`. `MarshalText` (value receiver) returns the name bytes. `UnmarshalText` (pointer receiver) stores the raw name and returns nil, so unknown inbound kinds still decode.
- `type ParticipantChange string` with `ParticipantAdded = "ADDED"`, `ParticipantRemoved = "REMOVED"`; `ParticipantChangedEvent.Change` uses it.
- `EventEnvelope.Type` becomes `EventKind`, `Change` becomes `ParticipantChange`, `State` becomes `PresenceState` (JSON tags unchanged).

- [ ] **Step 4: Run the domain tests and the golden test** — expect PASS for `test/domain`. The rest of the module will not compile until Task 3; that is expected.

Run: `go test ./test/domain/ -v` in `backend/`

- [ ] **Step 5: Commit**

```bash
git add backend/internal/core/domain/realtime.go backend/test/domain/event_kind_test.go
git commit -m "refactor(backend): type messaging event kinds in domain"
```

---

### Task 3: Producers use typed kinds

**Files:**
- Modify: `backend/internal/core/services/messaging_service.go` (`Type:` literals at l.102, 125, 181, 201, 253, 284; `Change: "ADDED"` at l.256, `"REMOVED"` at l.287)
- Modify: `backend/internal/adapters/realtime/presence_session.go` (l.99-102; `State: string(state)` becomes `State: state`)
- Modify: `backend/internal/adapters/realtime/hub.go` (`PublishEnvelope` `Type`, `domain.PresenceState(env.State)` and `Change` conversions)
- Modify: `backend/internal/adapters/graphql/resolvers/helpers.go` (~l.610) only if it compiles to a conversion that changes
- Modify: test files whose `Type:` literals no longer compile (`test/realtime/*.go`, `test/services/messaging_service_test.go`, `internal/adapters/realtime/hub_bench_test.go`). Change `Type: "X"` to `Type: domain.KindX`, and `Change: "ADDED"` to `domain.ParticipantAdded`.

**Interfaces:**
- Consumes: Task 2 types.
- Produces: nothing new.

- [ ] **Step 1: Change the literals to constants in producers** (each `Type: "MESSAGE_EDITED"` becomes `Type: domain.KindMessageEdited`, and so on).

- [ ] **Step 2: Build**

Run: `go build ./...` in `backend/` — expect zero errors. Then `go vet ./...` to catch test-only compile errors.

- [ ] **Step 3: Migrate the test literals** that fail `go vet`. Repeat until `go vet ./...` is clean.

- [ ] **Step 4: Run the realtime and messaging unit tests**

Run: `go test ./test/realtime/ ./test/services/ ./test/domain/ ./internal/adapters/realtime/ -count=1` in `backend/`
Expected: all `ok` (DB-backed tests skip without `DATABASE_URL`; say so).

- [ ] **Step 5: Commit**

```bash
git add backend/internal backend/test
git commit -m "refactor(backend): emit messaging events with typed kinds"
```

---

### Task 4: Hub routes every kind; edit no longer loads the message for inbox-only processes

**Files:**
- Modify: `backend/internal/adapters/realtime/hub.go` (`PublishEnvelope` l.313-399; `PublishEphemeral` l.410)
- Test: `backend/test/realtime/hub_routes_test.go` (create)

**Interfaces:**
- Consumes: `domain.AllEventKinds()`, `Hub`, fake repositories used by `test/realtime/hub_test.go` (reuse their helpers; read them first).
- Produces: `PublishEphemeral` returns an error for an unknown kind before fan-out.

- [ ] **Step 1: Read the pinning tests first**: `test/realtime/hub_subscriptions_test.go` around l.76 and `test/realtime/hub_test.go` around l.409. Confirm whether either asserts that an edit loads the message when only an inbox subscriber exists. If one does, update it to the new contract and say so in the report.

- [ ] **Step 2: Write the failing tests**

```go
func TestEveryDeclaredKindHasARoute(t *testing.T) {
    // A kind missing from the hub's switch would hit the unknown-kind warning.
    var warned []string
    prev := slog.Default()
    slog.SetDefault(slog.New(captureHandler(&warned)))
    t.Cleanup(func() { slog.SetDefault(prev) })
    hub := newTestHub(t) // reuse the helper from hub_test.go
    _, unsub := hub.Subscribe(1, 2)
    defer unsub()
    _, unsubIn := hub.SubscribeInbox(2)
    defer unsubIn()
    for _, k := range domain.AllEventKinds() {
        hub.PublishEnvelope(context.Background(), domain.EventEnvelope{Type: k, ThreadID: 1, UserID: 2, MessageID: 1})
    }
    assert.Empty(t, warned)
}

func TestEditWithInboxSubscriberOnlyDoesNotLoadMessage(t *testing.T) {
    msgs := &countingMsgRepo{} // GetByID counter; reuse or add to test helpers
    hub := realtime.NewHub(msgs, nil, nil)
    _, unsubIn := hub.SubscribeInbox(9)
    defer unsubIn()
    hub.PublishEnvelope(context.Background(), domain.EventEnvelope{Type: domain.KindMessageEdited, ThreadID: 1, MessageID: 5})
    assert.Equal(t, 0, msgs.getByIDCalls)
}

func TestPublishEphemeralRejectsUnknownKind(t *testing.T) {
    hub := newTestHub(t)
    err := hub.PublishEphemeral(context.Background(), domain.EventEnvelope{Type: domain.EventKind{}, ThreadID: 1})
    require.Error(t, err)
}
```
The `captureHandler` and `countingMsgRepo` helpers are new in this file. Note `EventKind{}` is the zero value; it is unexported-field-constructible only inside `domain`, so use `var zero domain.EventKind` and assign that. Also add a test in which an edit with a thread subscriber does call `GetByID` once (this keeps the fix honest).

- [ ] **Step 3: Run; expect the edit test and reject test to fail.**

Run: `go test ./test/realtime/ -run 'Route|InboxSubscriberOnly|Rejects' -v` in `backend/`

- [ ] **Step 4: Implement**

- In `PublishEnvelope`, the `MESSAGE_EDITED` guard checks `threadSubs == 0` only (the inbox term goes). Keep the same wording in the comment, minus the old reasoning.
- Replace string case labels with `domain.KindX` labels. The `default` branch logs `env.Type.String()`.
- `PresenceState` cases pass `env.State` directly.
- In `PublishEphemeral`, before any fan-out or notify: `for _, env := range envs { if !env.Type.Known() { return fmt.Errorf("publish unknown event kind %q", env.Type.String()) } }`.

- [ ] **Step 5: Run the realtime tests**

Run: `go test ./test/realtime/ ./internal/adapters/realtime/ -count=1 -v` in `backend/`
Expected: PASS. Then `go test -run '^$' -bench . ./internal/adapters/realtime/` to confirm the bench still compiles.

- [ ] **Step 6: Fix the bench's bogus kinds.** In `internal/adapters/realtime/hub_bench_test.go` lines 20-21, replace `"TYPING"` and `"READ"` with `domain.KindTypingChanged` and `domain.KindReadReceiptChanged`, so the bench exercises real routes. Record this as a real finding (it benchmarked the unknown-kind warn path).

- [ ] **Step 7: Commit**

```bash
git add backend/internal/adapters/realtime backend/test/realtime
git commit -m "fix(backend): skip message load for edits with no thread subscriber"
```

---

### Task 5: Backend verification

- [ ] `go build ./...` in `backend/`: zero errors.
- [ ] `gofmt -l .` in `backend/`: empty.
- [ ] `go test ./... -count=1` in `backend/`: all `ok`; record counts and which messaging DB tests skipped.
- [ ] `go test ./test/messaging/ -count=1 -v` in `backend/`: if it skips for lack of `DATABASE_URL`, say so in the report.

---

### Task 6: Pure reducer: unread follows the row rule

**Files:**
- Modify: `frontend/src/lib/messaging/threadCache.ts` (`applyThreadEventToThread`, l.98-151)
- Test: `frontend/tests/unit/messaging-threadCache.test.ts` (append; keep the existing cases unchanged)

**Interfaces:**
- Produces: `applyThreadEventToThread(thread, event, myUserId, known?: boolean)`.

- [ ] **Step 1: Write failing tests** (append to the thread summary describe block)

```ts
it('counts a message from someone else once even when its seq is below latestSeq (out of order)', () => {
  // own seq 7 already applied; other seq 6 arrives late
  let t = applyThreadEventToThread(thread(), { __typename: 'MessagePosted', message: msg(7, { sender: { id: 'u1', username: 'me' } }) }, 'u1');
  t = applyThreadEventToThread(t, { __typename: 'MessagePosted', message: msg(6) }, 'u1');
  expect(t.unreadCount).toBe(1);
  expect(t.latestSeq).toBe(7);
});

it('does not double count a duplicate delivery when the caller says it is known', () => {
  const once = applyThreadEventToThread(thread(), { __typename: 'MessagePosted', message: msg(6) }, 'u1', false);
  const twice = applyThreadEventToThread(once, { __typename: 'MessagePosted', message: msg(6) }, 'u1', true);
  expect(twice.unreadCount).toBe(1);
});

it('counts rows, not seq distance, across a pruned gap', () => {
  // lastRead 5, rows 6..8 pruned, rows 9 and 10 from others
  let t = thread({ latestSeq: 5, myLastReadSeq: 5, unreadCount: 0 });
  t = applyThreadEventToThread(t, { __typename: 'MessagePosted', message: msg(9) }, 'u1');
  t = applyThreadEventToThread(t, { __typename: 'MessagePosted', message: msg(10) }, 'u1');
  expect(t.unreadCount).toBe(2); // seq arithmetic would say 5
});

it('own partial read lowers unread to the rows still newer than my pointer', () => {
  const t = applyThreadEventToThread(
    thread({ latestSeq: 10, myLastReadSeq: 5, unreadCount: 5 }),
    { __typename: 'ReadReceiptChanged', threadId: 't1', userId: 'u1', lastReadSeq: 9 },
    'u1',
  );
  expect(t.unreadCount).toBe(1); // min(5, 10 - 9)
});

it('a delete changes neither latestSeq nor unread (tombstones keep their row and seq)', () => {
  const before = thread({ latestSeq: 10, unreadCount: 2 });
  const after = applyThreadEventToThread(before, { __typename: 'MessageDeleted', threadId: 't1', messageId: 'm10', seq: 10 }, 'u1');
  expect(after).toBe(before);
});
```

- [ ] **Step 2: Run; expect failures** on the out-of-order, duplicate, and gap cases.

Run: `pnpm exec vitest run tests/unit/messaging-threadCache.test.ts` in `frontend/`

- [ ] **Step 3: Implement**

`MessagePosted`:
- `seen = known ?? m.seq <= thread.latestSeq`.
- `latestSeq = Math.max(thread.latestSeq, m.seq)`.
- If `seen` and `latestSeq` is unchanged: return `thread`.
- `lastMessageAt` = `m.createdAt` when `latestSeq` increased; otherwise keep.
- `fromMe`: keep the existing advance `myLastReadSeq = m.seq` only when `!seen`. Unread unchanged.
- Not `fromMe` and `!seen`: `unreadCount + 1`. Otherwise unread unchanged.

`ReadReceiptChanged` for me: `unreadCount = Math.min(thread.unreadCount, Math.max(0, thread.latestSeq - myLastReadSeq))`. This is the upper bound. The server value overwrites it on the next markRead result.

Replace the `MessageDeleted` branch with a plain `return thread` and a one-line comment: tombstones keep row and seq, so latestSeq and unread are unchanged. Remove the TODO. Replace `MessageEdited` the same way.

Add `assertNever(event)` in the default branch so a new event kind fails type-check.

- [ ] **Step 4: Run and confirm the existing cases still pass.**

Run: `pnpm exec vitest run tests/unit/messaging-threadCache.test.ts` in `frontend/` — expect all green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/messaging/threadCache.ts frontend/tests/unit/messaging-threadCache.test.ts
git commit -m "fix(frontend): count unread by rows, deduplicated by message"
```

---

### Task 7: The single cache module

**Files:**
- Create: `frontend/src/lib/messaging/messagingCache.ts`
- Create: `frontend/tests/unit/messaging-cache-scenarios.test.ts`

**Interfaces:**
- Consumes: `applyThreadEventToThread`, `applyMessagePosted`, `applyMessageEdited`, `applyMessageDeleted`, `reconcileSentMessage` (`optimistic.ts`), `applyInboxEvent` and `patchThreadInList` (`inboxCache.ts`), `queryKeys` (`#lib/queries/keys.js`).
- Produces: the four functions in the shared Interfaces section.

Do not import `lib/queries/messaging/*` hooks into this module. Types only.

- [ ] **Step 1: Write the scenario tests first** (real `QueryClient`; seed the caches via `setQueryData`)

Cover, each as one `it`:
- `send → edit → delete → read`: `applyMessageResult` 'sent' reconciles the optimistic row and advances the thread summary; 'edited' replaces the body; 'deleted' tombstones and keeps latestSeq and unread; `applyThreadResult` with the server's markRead thread sets unread to the server value.
- `unread with seq gaps`: a thread with lastRead 5 and latest 5; events 9 and 10 from others arrive via `applyThreadEvent`; unread is 2.
- `out-of-order own then other`: own sent 7 via `applyMessageResult`, then other 6 via `applyThreadEvent` with the messages cache present; unread is 1 and the messages list contains seq 6 and 7.
- `duplicate delivery`: the same other-6 event twice with the messages cache present; unread is 1.
- `inbox server count overwrites`: `applyInboxEvent` with unread 4 sets list and detail unread to 4, latestSeq and lastMessageAt included.
- `no cache entries`: each function is a no-op and does not create entries.

For the `known` argument in `applyThreadEvent`: pass `known = cache?.items.some(m => m.id === message.id)` when a messages cache exists, else `undefined` (falls back to the seq rule).

- [ ] **Step 2: Run; expect failures (module missing).**

Run: `pnpm exec vitest run tests/unit/messaging-cache-scenarios.test.ts` in `frontend/`

- [ ] **Step 3: Implement `messagingCache.ts`**

- `applyThreadEvent(qc, threadId, me, event)`: handles `MessagePosted`, `MessageEdited`, `MessageDeleted`, `ReadReceiptChanged`, `ParticipantChanged`. For `MessagePosted` compute `known` as above, and apply it to the messages cache (`applyMessagePosted`) and the detail cache (`applyThreadEventToThread`). For `MessageEdited` and `MessageDeleted`, update the messages cache only. For `ReadReceiptChanged` and `ParticipantChanged`, update the detail cache only. If an own receipt advances past the latestSeq the thread knows, call `qc.invalidateQueries` on the detail key (rare cross-device case; the server count is then authoritative). Return nothing. `TypingChanged`, `PresenceChanged` and `StreamReset` are not handled here (ephemeral, stream-local).
- `applyMessageResult(qc, op, me)`: 'sent' calls `reconcileSentMessage` on the messages cache and `applyThreadEventToThread` on the detail cache with `known = true` (so the own send does not count as unread and the later stream event is deduped). 'edited' calls `applyMessageEdited`. 'deleted' calls `applyMessageDeleted` with the message id.
- `applyThreadResult(qc, thread)`: `setQueryData` on the detail key, then `patchThreadInList`.
- `applyInboxEvent(qc, event)`: patches the list via `applyInboxEvent` (inboxCache.ts) and the detail cache with `latestSeq`, `lastMessageAt`, `unreadCount` only when the detail is cached.

Keys come from `queryKeys.messaging.*` only.

- [ ] **Step 4: Run the scenario and existing tests for messaging**

Run: `pnpm exec vitest run tests/unit/messaging-cache-scenarios.test.ts tests/unit/messaging-threadCache.test.ts tests/unit/messaging-inboxCache.test.ts` in `frontend/`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/messaging/messagingCache.ts frontend/tests/unit/messaging-cache-scenarios.test.ts
git commit -m "feat(frontend): one module applies messaging events and results to caches"
```

---

### Task 8: Hooks and streams call the module

**Files:**
- Modify: `frontend/src/lib/queries/messaging/useSendMessage.ts`, `useEditMessage.ts`, `useDeleteMessage.ts`, `useMarkThreadRead.ts`, `useMuteThread.ts`
- Modify: `frontend/src/lib/messaging/useThreadStream.svelte.ts` (`handle`, l.42-79), `frontend/src/lib/messaging/useInboxStream.svelte.ts` (l.19-32)

**Interfaces:**
- Consumes: the Task 7 functions.

- [ ] **Step 1: Read the pinning tests before touching hooks**: `tests/unit/hooks-useSendMessage.test.ts`, `hooks-useEditMessage.test.ts`, `hooks-useDeleteMessage.test.ts`, `hooks-useMarkThreadRead.test.ts`, `messaging-useThreadStream.test.ts`, `messaging-inboxCache.test.ts`. Note which ones mock `setQueryData`. Where a test asserts on a mocked `setQueryData` call count, update it to assert on real cache contents via a real `QueryClient`, and say so.

- [ ] **Step 2: Rewire each hook's `onSuccess`/`onMutate` to the module.** Send: `onMutate` keeps the optimistic add (`addOptimistic`), `onSuccess` calls `applyMessageResult('sent')`, `onError` removes the optimistic row (keep as is). Edit: `onMutate` calls `applyMessageResult`? No: optimistic edit keeps the previous-body rollback via `applyMessageEdited`; `onSuccess` calls `applyMessageResult('edited')`. Delete: `onSuccess` calls `applyMessageResult('deleted')`. MarkRead and Mute: `onSuccess` calls `applyThreadResult`.

- [ ] **Step 3: Rewire the streams.** `useThreadStream.handle`: message, receipt and participant events go to `applyThreadEvent(qc, threadId, myUserId, event)`. Typing and presence stay local. `StreamReset` keeps its invalidate and restart. `useInboxStream`: `next` calls `applyInboxEvent(qc, event)`; keep the unknown-thread invalidate.

Keep `useSendMessage`'s nonce handling unchanged. Components must not gain `createQuery` or `useQueryClient` (PR 862 rule).

- [ ] **Step 4: Run messaging tests**

Run: `pnpm exec vitest run tests/unit/hooks-useSendMessage.test.ts tests/unit/hooks-useEditMessage.test.ts tests/unit/hooks-useDeleteMessage.test.ts tests/unit/hooks-useMarkThreadRead.test.ts tests/unit/messaging-useThreadStream.test.ts tests/unit/messaging-inboxCache.test.ts tests/unit/messaging-optimistic.test.ts tests/components/ThreadView.test.ts tests/components/MessageBubble.test.ts` in `frontend/`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/queries/messaging frontend/src/lib/messaging frontend/tests/unit
git commit -m "refactor(frontend): route messaging hooks and streams through one cache module"
```

---

### Task 9: Full verification

- [ ] `pnpm run check` in `frontend/`: report error count.
- [ ] `pnpm run test:run` in `frontend/`: report test and file counts.
- [ ] Targeted backend commands from Task 5.
- [ ] `grep` for the old literals across `backend/` and `frontend/src`: `Type: "MESSAGE_` and `unknown envelope` should appear only in `hub.go` and the trigger tests.

---

## Self-Review

1. **Spec coverage:** typed kinds (T2-T3), wire unchanged (T1), edit load fix and route test (T4), frontend module (T7-T8), unread consistency (T6), stale latestSeq (T6 documents that tombstones keep seq; no change needed), tests through the module (T7), verification (T5, T9). Demo and PR steps follow the run.
2. **Type consistency:** `EventKind` constants are named `KindX` everywhere; `known` parameter name is the same in T6 and T7; `applyMessageResult` op names `sent|edited|deleted` used consistently.
3. **Review Focus:** each of the five lines maps to a named test in T6 or T7 and T4.
4. **Proportion:** interfaces and test names, not transcripts.
