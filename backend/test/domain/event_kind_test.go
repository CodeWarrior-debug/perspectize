package domain_test

import (
	"encoding/json"
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
			assert.Equal(t, tc.want, string(got))
		})
	}
}
