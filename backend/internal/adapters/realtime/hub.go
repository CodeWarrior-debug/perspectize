// Package realtime provides an in-process fan-out hub for messaging thread
// events. Subscribers register per thread; events are broadcast to every
// subscriber of that thread with a non-blocking send. A subscriber whose
// buffer is full is dropped (its channel closed) rather than blocking the hub.
package realtime

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// subBufferSize is the per-subscriber channel buffer. A consumer that falls
// this far behind is dropped.
const subBufferSize = 64

// Notifier publishes a serialized EventEnvelope onto the cross-process
// thread_events channel. PgNotifier is the production implementation; a nil
// Notifier makes the Hub fall back to purely in-process delivery.
type Notifier interface {
	Notify(ctx context.Context, payload string) error
}

// threadSub is one registered thread subscriber: its delivery channel plus the
// user it belongs to, so the hub can drop every stream owned by a user who has
// left the thread.
type threadSub struct {
	ch     chan domain.ThreadEvent
	userID int
}

// Hub is the in-memory realtime fan-out core. It is safe for concurrent use.
type Hub struct {
	mu       sync.RWMutex
	subs     map[int]map[int]*threadSub             // threadID -> subID -> subscriber
	inbox    map[int]map[int]chan domain.InboxEvent // userID -> subID -> channel
	nextID   int
	nextInID int

	msgRepo    repositories.MessageRepository
	threadRepo repositories.ThreadRepository // used by the inbox fan-out to resolve participants
	notifier   Notifier                      // optional; nil means in-process-only ephemerals
}

// NewHub constructs a Hub. threadRepo is used by the MESSAGE_POSTED inbox
// fan-out to resolve a thread's participants. notifier, when non-nil, is used
// by PublishEphemeral to emit events over Postgres NOTIFY so every instance
// (including this one, via its own Listener) receives them; pass nil for
// in-process-only delivery.
func NewHub(msgRepo repositories.MessageRepository, threadRepo repositories.ThreadRepository, notifier Notifier) *Hub {
	return &Hub{
		subs:       make(map[int]map[int]*threadSub),
		inbox:      make(map[int]map[int]chan domain.InboxEvent),
		msgRepo:    msgRepo,
		threadRepo: threadRepo,
		notifier:   notifier,
	}
}

var _ portservices.EventPublisher = (*Hub)(nil)

// Subscribe registers a new subscriber for threadID on behalf of userID. It
// returns a receive-only channel of events and an unsubscribe function. The
// unsubscribe function is idempotent: it removes the subscriber and closes the
// channel exactly once. userID is recorded so DropSubscriber can end the stream
// when that user leaves or is removed from the thread.
func (h *Hub) Subscribe(threadID, userID int) (<-chan domain.ThreadEvent, func()) {
	h.mu.Lock()
	h.nextID++
	id := h.nextID
	ch := make(chan domain.ThreadEvent, subBufferSize)
	if h.subs[threadID] == nil {
		h.subs[threadID] = make(map[int]*threadSub)
	}
	h.subs[threadID][id] = &threadSub{ch: ch, userID: userID}
	h.mu.Unlock()

	var once sync.Once
	unsub := func() {
		once.Do(func() { h.remove(threadID, id) })
	}
	return ch, unsub
}

// remove deletes a subscriber and closes its channel. It is a no-op if the
// subscriber is already gone, so it is safe to call from both the unsubscribe
// closure and the drop path.
func (h *Hub) remove(threadID, id int) {
	h.mu.Lock()
	defer h.mu.Unlock()
	m := h.subs[threadID]
	if m == nil {
		return
	}
	sub, ok := m[id]
	if !ok {
		return
	}
	delete(m, id)
	if len(m) == 0 {
		delete(h.subs, threadID)
	}
	close(sub.ch)
}

// DropSubscriber closes and removes every subscription userID holds on
// threadID. It is idempotent and closes channels under the write lock, exactly
// like remove, so it can never race a Broadcast mid-send. Used when a
// participant leaves or is removed so their live stream ends instead of
// continuing to receive the thread's events.
func (h *Hub) DropSubscriber(threadID, userID int) {
	h.mu.Lock()
	defer h.mu.Unlock()
	m := h.subs[threadID]
	if m == nil {
		return
	}
	for id, sub := range m {
		if sub.userID != userID {
			continue
		}
		delete(m, id)
		close(sub.ch)
	}
	if len(m) == 0 {
		delete(h.subs, threadID)
	}
}

// SubscribeInbox registers a new per-user inbox subscriber. It returns a
// receive-only channel of InboxEvents and an idempotent unsubscribe function.
// Inbox events are emitted for every thread the user participates in whenever a
// message is posted there.
func (h *Hub) SubscribeInbox(userID int) (<-chan domain.InboxEvent, func()) {
	h.mu.Lock()
	h.nextInID++
	id := h.nextInID
	ch := make(chan domain.InboxEvent, subBufferSize)
	if h.inbox[userID] == nil {
		h.inbox[userID] = make(map[int]chan domain.InboxEvent)
	}
	h.inbox[userID][id] = ch
	h.mu.Unlock()

	var once sync.Once
	unsub := func() {
		once.Do(func() { h.removeInbox(userID, id) })
	}
	return ch, unsub
}

// removeInbox deletes an inbox subscriber and closes its channel. It is a no-op
// if the subscriber is already gone.
func (h *Hub) removeInbox(userID, id int) {
	h.mu.Lock()
	defer h.mu.Unlock()
	m := h.inbox[userID]
	if m == nil {
		return
	}
	ch, ok := m[id]
	if !ok {
		return
	}
	delete(m, id)
	if len(m) == 0 {
		delete(h.inbox, userID)
	}
	close(ch)
}

// broadcastInbox delivers evt to every inbox subscriber of userID. It mirrors
// Broadcast's locking discipline: non-blocking sends under the read lock, slow
// subscribers dropped afterwards, so no send can race a channel close.
func (h *Hub) broadcastInbox(userID int, evt domain.InboxEvent) {
	var slow []int

	h.mu.RLock()
	for id, ch := range h.inbox[userID] {
		select {
		case ch <- evt:
		default:
			slow = append(slow, id)
		}
	}
	h.mu.RUnlock()

	for _, id := range slow {
		h.removeInbox(userID, id)
	}
}

// fanOutInbox resolves the thread's active participants and pushes one
// InboxEvent per participant. Failures are logged and skipped — the per-thread
// ThreadEvent fan-out has already happened and must not be undone by this.
func (h *Hub) fanOutInbox(ctx context.Context, threadID int, seq int64, at time.Time) {
	if h.threadRepo == nil {
		return
	}
	// No local inbox subscribers: nothing this process could deliver, so skip
	// the participant lookup entirely.
	h.mu.RLock()
	inboxSubs := len(h.inbox)
	h.mu.RUnlock()
	if inboxSubs == 0 {
		return
	}
	thread, err := h.threadRepo.GetThread(ctx, threadID)
	if err != nil || thread == nil {
		slog.Warn("realtime hub: inbox fan-out could not load thread",
			"thread_id", threadID, "err", err)
		return
	}
	lastMessageAt := thread.LastMessageAt
	if lastMessageAt.IsZero() {
		lastMessageAt = at
	}
	for _, p := range thread.Participants {
		if p.LeftAt != nil {
			continue
		}
		unread := seq - p.LastReadSeq
		if unread < 0 {
			unread = 0
		}
		h.broadcastInbox(p.UserID, domain.InboxEvent{
			ThreadID:      threadID,
			LastMessageAt: lastMessageAt,
			LatestSeq:     seq,
			UnreadCount:   int(unread),
		})
	}
}

// Broadcast performs the low-level fan-out to all subscribers of threadID.
//
// The non-blocking sends happen while holding the read lock. Channel closes
// (in remove) require the write lock, so no channel can be closed while any
// Broadcast is mid-send — this is what makes the "send on a closed channel"
// panic impossible even under concurrent broadcasters. Subscribers whose
// buffer is full are collected and dropped after the read lock is released, so
// a slow consumer never blocks the hub.
func (h *Hub) Broadcast(threadID int, evt domain.ThreadEvent) {
	var slow []int

	h.mu.RLock()
	for id, sub := range h.subs[threadID] {
		select {
		case sub.ch <- evt:
		default:
			slow = append(slow, id)
		}
	}
	h.mu.RUnlock()

	for _, id := range slow {
		h.remove(threadID, id)
	}
}

// PublishEnvelope decodes an EventEnvelope into a domain ThreadEvent and fans it
// out to subscribers of env.ThreadID.
func (h *Hub) PublishEnvelope(ctx context.Context, env domain.EventEnvelope) {
	switch env.Type {
	case "MESSAGE_POSTED":
		// Every instance receives every NOTIFY; drop the ones this process has
		// no local consumer for before spending any query on them.
		h.mu.RLock()
		threadSubs, inboxSubs := len(h.subs[env.ThreadID]), len(h.inbox)
		h.mu.RUnlock()
		if threadSubs == 0 && inboxSubs == 0 {
			return
		}

		m, err := h.msgRepo.GetByID(ctx, env.MessageID)
		if err != nil {
			slog.Error("realtime hub: load message for MESSAGE_POSTED failed",
				"message_id", env.MessageID, "thread_id", env.ThreadID, "err", err)
			return
		}
		h.Broadcast(env.ThreadID, domain.MessagePostedEvent{Message: *m})
		h.fanOutInbox(ctx, env.ThreadID, m.Seq, m.CreatedAt)
	case "MESSAGE_EDITED":
		// Same early-drop guard as MESSAGE_POSTED. An edit changes no inbox
		// summary, so there is no fanOutInbox call below.
		h.mu.RLock()
		threadSubs, inboxSubs := len(h.subs[env.ThreadID]), len(h.inbox)
		h.mu.RUnlock()
		if threadSubs == 0 && inboxSubs == 0 {
			return
		}

		m, err := h.msgRepo.GetByID(ctx, env.MessageID)
		if err != nil {
			slog.Error("realtime hub: load message for MESSAGE_EDITED failed",
				"message_id", env.MessageID, "thread_id", env.ThreadID, "err", err)
			return
		}
		h.Broadcast(env.ThreadID, domain.MessageEditedEvent{Message: *m})
	case "MESSAGE_DELETED":
		// A tombstone carries everything the client needs (thread, message, seq),
		// so there is no message load and the guard only cares about thread subs.
		h.mu.RLock()
		threadSubs := len(h.subs[env.ThreadID])
		h.mu.RUnlock()
		if threadSubs == 0 {
			return
		}
		h.Broadcast(env.ThreadID, domain.MessageDeletedEvent{
			ThreadID:  env.ThreadID,
			MessageID: env.MessageID,
			Seq:       env.Seq,
		})
	case "READ_RECEIPT_CHANGED":
		h.Broadcast(env.ThreadID, domain.ReadReceiptChangedEvent{
			ThreadID:    env.ThreadID,
			UserID:      env.UserID,
			LastReadSeq: env.LastReadSeq,
		})
	case "TYPING_CHANGED":
		h.Broadcast(env.ThreadID, domain.TypingChangedEvent{
			ThreadID: env.ThreadID,
			UserID:   env.UserID,
			Typing:   env.Typing,
		})
	case "PARTICIPANT_CHANGED":
		h.Broadcast(env.ThreadID, domain.ParticipantChangedEvent{
			ThreadID: env.ThreadID,
			UserID:   env.UserID,
			Change:   env.Change,
		})
		if env.Change == "REMOVED" {
			// Broadcast first so the departing client still sees its own
			// REMOVED notice; the close then ends its stream. Buffered events
			// stay readable after the close, so nothing already sent is lost.
			h.DropSubscriber(env.ThreadID, env.UserID)
		}
	case "PRESENCE_CHANGED":
		h.Broadcast(env.ThreadID, domain.PresenceChangedEvent{
			ThreadID: env.ThreadID,
			UserID:   env.UserID,
			State:    domain.PresenceState(env.State),
		})
	case "STREAM_RESET":
		h.Broadcast(env.ThreadID, domain.StreamResetEvent{ThreadID: env.ThreadID})
	default:
		slog.Warn("realtime hub: unknown envelope type", "type", env.Type, "thread_id", env.ThreadID)
	}
}

// PublishEphemeral satisfies portservices.EventPublisher.
//
// With a Notifier configured the envelope is sent over Postgres NOTIFY, so
// every instance — including this one, whose Listener consumes the same
// notification — delivers it. PublishEnvelope is deliberately NOT also called
// here: that would double-deliver locally.
//
// Without a Notifier (unit tests, or any process with no Listener) it falls
// back to in-process fan-out.
func (h *Hub) PublishEphemeral(ctx context.Context, env domain.EventEnvelope) error {
	if h.notifier == nil {
		h.PublishEnvelope(ctx, env)
		return nil
	}
	payload, err := json.Marshal(env)
	if err != nil {
		return fmt.Errorf("marshal %s envelope: %w", env.Type, err)
	}
	return h.notifier.Notify(ctx, string(payload))
}

// ResetAll sends a StreamResetEvent to every subscriber of every thread. Used
// after the DB listener reconnects and subscribers must re-sync.
func (h *Hub) ResetAll() {
	h.mu.RLock()
	threadIDs := make([]int, 0, len(h.subs))
	for threadID := range h.subs {
		threadIDs = append(threadIDs, threadID)
	}
	h.mu.RUnlock()

	for _, threadID := range threadIDs {
		h.Broadcast(threadID, domain.StreamResetEvent{ThreadID: threadID})
	}
}
