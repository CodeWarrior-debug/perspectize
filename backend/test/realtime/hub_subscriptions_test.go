package realtime_test

import (
	"context"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/realtime"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Unsubscribing one of several subscribers on a thread must leave the others
// registered and receiving.
func TestHub_UnsubscribeOneKeepsOtherThreadSubscribers(t *testing.T) {
	hub := newHub(domain.Message{})
	chA, unsubA := hub.Subscribe(5, 1)
	chB, unsubB := hub.Subscribe(5, 2)
	defer unsubB()

	unsubA()
	_, open := <-chA
	assert.False(t, open, "unsubscribed channel is closed")

	hub.Broadcast(5, domain.StreamResetEvent{ThreadID: 5})

	select {
	case evt := <-chB:
		_, ok := evt.(domain.StreamResetEvent)
		assert.True(t, ok)
	default:
		t.Fatal("remaining subscriber did not receive the broadcast")
	}
}

// Unsubscribing one of several inbox subscribers of a user must leave the
// others registered and receiving.
func TestHub_UnsubscribeOneKeepsOtherInboxSubscribers(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Second)
	thread := &domain.MessageThread{
		ID:            1,
		LastMessageAt: now,
		Participants:  []domain.ThreadParticipant{{ThreadID: 1, UserID: 11}},
	}
	hub := realtime.NewHub(
		stubMsgRepo{msg: domain.Message{ID: 10, ThreadID: 1, Seq: 4, CreatedAt: now}},
		stubThreadRepo{thread: thread},
		nil,
	)

	chA, unsubA := hub.SubscribeInbox(11)
	chB, unsubB := hub.SubscribeInbox(11)
	defer unsubB()

	unsubA()
	_, open := <-chA
	assert.False(t, open, "unsubscribed inbox channel is closed")

	hub.PublishEnvelope(context.Background(), domain.EventEnvelope{
		Type: "MESSAGE_POSTED", ThreadID: 1, Seq: 4, MessageID: 10,
	})

	select {
	case e := <-chB:
		assert.Equal(t, 1, e.ThreadID)
		assert.Equal(t, 4, e.UnreadCount)
	default:
		t.Fatal("remaining inbox subscriber did not receive the event")
	}
}

// MESSAGE_EDITED must skip the message lookup only when there is no local
// consumer at all (neither a thread subscriber nor any inbox subscriber).
func TestHub_MessageEditedLookupGuard(t *testing.T) {
	edit := domain.EventEnvelope{Type: "MESSAGE_EDITED", ThreadID: 77, MessageID: 5}

	t.Run("no subscribers skips lookup", func(t *testing.T) {
		loads := 0
		hub := realtime.NewHub(countingMsgRepo{loads: &loads}, stubThreadRepo{}, nil)
		hub.PublishEnvelope(context.Background(), edit)
		assert.Equal(t, 0, loads)
	})

	t.Run("thread subscriber triggers lookup and delivery", func(t *testing.T) {
		loads := 0
		hub := realtime.NewHub(countingMsgRepo{loads: &loads}, stubThreadRepo{}, nil)
		ch, unsub := hub.Subscribe(77, 1)
		defer unsub()
		hub.PublishEnvelope(context.Background(), edit)
		assert.Equal(t, 1, loads)
		require.Len(t, ch, 1)
	})

	t.Run("inbox-only subscriber triggers lookup", func(t *testing.T) {
		loads := 0
		hub := realtime.NewHub(countingMsgRepo{loads: &loads}, stubThreadRepo{}, nil)
		_, unsub := hub.SubscribeInbox(9)
		defer unsub()
		hub.PublishEnvelope(context.Background(), edit)
		assert.Equal(t, 1, loads)
	})
}
