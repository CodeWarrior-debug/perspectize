package realtime

import (
	"context"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

type discardNotifier struct{}

func (discardNotifier) Notify(context.Context, ...string) error { return nil }

// BenchmarkHub_PublishEphemeral measures the marshal half of a typing + read
// receipt publish, the most frequent realtime write.
func BenchmarkHub_PublishEphemeral(b *testing.B) {
	h := NewHub(nil, nil, discardNotifier{})
	ctx := context.Background()
	envs := []domain.EventEnvelope{
		{Type: "TYPING", ThreadID: 42, UserID: 7, Typing: true},
		{Type: "READ", ThreadID: 42, UserID: 7, LastReadSeq: 1234},
	}
	b.ReportAllocs()
	for b.Loop() {
		if err := h.PublishEphemeral(ctx, envs...); err != nil {
			b.Fatal(err)
		}
	}
}
