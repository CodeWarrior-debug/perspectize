package domain_test

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// TestEventEnvelopeWireBytesAreStable pins the exact JSON of every event kind.
// Clients are deployed against this format, so the bytes must not change when
// the Go types do.
func TestEventEnvelopeWireBytesAreStable(t *testing.T) {
	cases := []struct {
		name string
		env  domain.EventEnvelope
		want string
	}{
		{"posted", domain.EventEnvelope{Type: domain.KindMessagePosted, ThreadID: 1, Seq: 2, MessageID: 3},
			`{"type":"MESSAGE_POSTED","thread_id":1,"seq":2,"message_id":3}`},
		{"edited", domain.EventEnvelope{Type: domain.KindMessageEdited, ThreadID: 1, Seq: 2, MessageID: 3},
			`{"type":"MESSAGE_EDITED","thread_id":1,"seq":2,"message_id":3}`},
		{"deleted", domain.EventEnvelope{Type: domain.KindMessageDeleted, ThreadID: 1, Seq: 2, MessageID: 3},
			`{"type":"MESSAGE_DELETED","thread_id":1,"seq":2,"message_id":3}`},
		{"read", domain.EventEnvelope{Type: domain.KindReadReceiptChanged, ThreadID: 1, UserID: 4, LastReadSeq: 5},
			`{"type":"READ_RECEIPT_CHANGED","thread_id":1,"seq":0,"message_id":0,"user_id":4,"last_read_seq":5}`},
		{"typing", domain.EventEnvelope{Type: domain.KindTypingChanged, ThreadID: 1, UserID: 4, Typing: true},
			`{"type":"TYPING_CHANGED","thread_id":1,"seq":0,"message_id":0,"user_id":4,"typing":true}`},
		{"participant", domain.EventEnvelope{Type: domain.KindParticipantChanged, ThreadID: 1, UserID: 4, Change: domain.ParticipantAdded},
			`{"type":"PARTICIPANT_CHANGED","thread_id":1,"seq":0,"message_id":0,"user_id":4,"change":"ADDED"}`},
		{"presence", domain.EventEnvelope{Type: domain.KindPresenceChanged, ThreadID: 1, UserID: 4, State: domain.PresenceOnline},
			`{"type":"PRESENCE_CHANGED","thread_id":1,"seq":0,"message_id":0,"user_id":4,"state":"ONLINE"}`},
		{"reset", domain.EventEnvelope{Type: domain.KindStreamReset, ThreadID: 1},
			`{"type":"STREAM_RESET","thread_id":1,"seq":0,"message_id":0}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := json.Marshal(tc.env)
			require.NoError(t, err)
			assert.Equal(t, tc.want, string(got))
		})
	}
}

func TestKnownKindsAreExactlyTheDeclaredSet(t *testing.T) {
	kinds := domain.AllEventKinds()
	assert.Len(t, kinds, 8)
	for _, k := range kinds {
		assert.True(t, k.Known(), k.String())
	}
	var zero domain.EventKind
	assert.False(t, zero.Known())
}

func TestUnknownInboundKindDecodesAndIsNotKnown(t *testing.T) {
	var env domain.EventEnvelope
	require.NoError(t, json.Unmarshal([]byte(`{"type":"MESSAGE_POSTDE","thread_id":1}`), &env))
	assert.Equal(t, "MESSAGE_POSTDE", env.Type.String())
	assert.False(t, env.Type.Known())
}

func TestEventKindMarshalsAsPlainString(t *testing.T) {
	b, err := json.Marshal(domain.KindMessagePosted)
	require.NoError(t, err)
	assert.Equal(t, `"MESSAGE_POSTED"`, string(b))
}

// The MESSAGE_POSTED event is emitted by the DB trigger, so the Go kind must
// spell the same literal the live trigger function uses.
func TestMessagePostedKindMatchesTriggerLiteral(t *testing.T) {
	b, err := os.ReadFile("../../migrations/000021_messaging_retention_unbounded.up.sql")
	require.NoError(t, err)
	assert.Contains(t, string(b), "'type',       'MESSAGE_POSTED'")
	assert.Equal(t, "MESSAGE_POSTED", domain.KindMessagePosted.String())
}
