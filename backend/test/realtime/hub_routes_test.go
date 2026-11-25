package realtime_test

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// captureDefaultLogger points slog's default logger at a buffer for the test.
func captureDefaultLogger(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })
	return &buf
}

// Every declared kind must have a route in the hub. A kind missing from the
// switch falls to the default branch, which logs "unknown envelope type".
func TestHub_EveryDeclaredKindHasARoute(t *testing.T) {
	logs := captureDefaultLogger(t)
	hub := newHub(domain.Message{ID: 1, ThreadID: 1, Seq: 1})
	_, unsubThread := hub.Subscribe(1, 2)
	defer unsubThread()
	_, unsubInbox := hub.SubscribeInbox(2)
	defer unsubInbox()

	for _, k := range domain.AllEventKinds() {
		hub.PublishEnvelope(context.Background(), domain.EventEnvelope{
			Type: k, ThreadID: 1, UserID: 2, MessageID: 1, Seq: 1,
		})
	}
	assert.NotContains(t, logs.String(), "unknown envelope type")
}

// An unknown kind (for example a future trigger value) is dropped with a log
// line; it is not an error that stops the listener.
func TestHub_UnknownInboundKindIsLoggedAndDropped(t *testing.T) {
	logs := captureDefaultLogger(t)
	hub := newHub(domain.Message{ID: 1, ThreadID: 1, Seq: 1})
	ch, unsub := hub.Subscribe(1, 2)
	defer unsub()

	var env domain.EventEnvelope
	require.NoError(t, env.Type.UnmarshalText([]byte("MESSAGE_FUTURE")))
	hub.PublishEnvelope(context.Background(), env)

	assert.Contains(t, logs.String(), "unknown envelope type")
	assert.Contains(t, logs.String(), "MESSAGE_FUTURE")
	assert.Len(t, ch, 0)
}

// A zero or unknown kind must not reach subscribers from the publish side.
func TestHub_PublishEphemeralRejectsUnknownKind(t *testing.T) {
	hub := newHub(domain.Message{ID: 1, ThreadID: 1, Seq: 1})
	ch, unsub := hub.Subscribe(1, 2)
	defer unsub()

	var zero domain.EventKind
	err := hub.PublishEphemeral(context.Background(), domain.EventEnvelope{Type: zero, ThreadID: 1})
	require.Error(t, err)
	assert.True(t, strings.Contains(err.Error(), "unknown event kind"), err.Error())
	assert.Len(t, ch, 0)
}
