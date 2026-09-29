package assistant

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/ai-tooling/agent"
	"github.com/CodeWarrior-debug/perspectize/ai-tooling/llm"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// scripted plays events to onEvent, then returns a result or error.
type scripted struct {
	events []llm.Event
	final  string
	err    error
	block  chan struct{} // if set, Ask waits on it (or ctx) before returning
	mu     sync.Mutex
	asked  []string
}

func (s *scripted) Ask(ctx context.Context, q string, onEvent func(llm.Event)) (agent.Result, error) {
	s.mu.Lock()
	s.asked = append(s.asked, q)
	s.mu.Unlock()
	for _, e := range s.events {
		onEvent(e)
	}
	if s.block != nil {
		select {
		case <-s.block:
		case <-ctx.Done():
			return agent.Result{}, ctx.Err()
		}
	}
	if s.err != nil {
		return agent.Result{}, s.err
	}
	return agent.Result{
		Final: llm.Message{Role: llm.RoleAssistant, Parts: []llm.Part{llm.TextPart(s.final)}},
		Stop:  llm.StopEnd, Usage: llm.Usage{InputTokens: 120, OutputTokens: 30}, Calls: 2,
	}, nil
}

type allowAll struct{}

func (allowAll) Allow(string) bool { return true }

type denyAll struct{}

func (denyAll) Allow(string) bool { return false }

func drain(t *testing.T, ch <-chan domain.AssistantEvent) []domain.AssistantEvent {
	t.Helper()
	var out []domain.AssistantEvent
	timeout := time.After(2 * time.Second)
	for {
		select {
		case e, ok := <-ch:
			if !ok {
				return out
			}
			out = append(out, e)
		case <-timeout:
			t.Fatal("stream did not close")
		}
	}
}

func deltas(parts ...string) []llm.Event {
	var es []llm.Event
	for _, p := range parts {
		es = append(es, llm.Event{Kind: llm.EventTextDelta, Text: p})
	}
	return es
}

func TestAsk_StreamsTextToolAndDone(t *testing.T) {
	events := append(
		[]llm.Event{{Kind: llm.EventToolCall, Call: llm.ToolCall{Name: "read_guide"}}},
		deltas("Open ", "**Compare** ", "[compare.pick-two].")...,
	)
	a := &scripted{events: events, final: "Open **Compare** [compare.pick-two]."}
	s := New(a, WithLimiter(allowAll{}), WithFlushEvery(0))

	ch, err := s.Ask(context.Background(), 7, "How do I compare?", "compare")
	require.NoError(t, err)
	got := drain(t, ch)

	require.GreaterOrEqual(t, len(got), 3)
	assert.Equal(t, domain.AssistantEventTool, got[0].Kind)
	assert.Equal(t, "read_guide", got[0].ToolName)
	var text strings.Builder
	for _, e := range got[1 : len(got)-1] {
		require.Equal(t, domain.AssistantEventText, e.Kind)
		text.WriteString(e.Text)
	}
	assert.Equal(t, "Open **Compare** [compare.pick-two].", text.String())

	done := got[len(got)-1]
	assert.Equal(t, domain.AssistantEventDone, done.Kind)
	assert.Equal(t, "end", done.Stop)
	assert.Equal(t, []string{"compare.pick-two"}, done.Citations)
	assert.Equal(t, 120, done.InputTokens)
	assert.Equal(t, 30, done.OutputTokens)
}

func TestAsk_BatchesTextDeltas(t *testing.T) {
	a := &scripted{events: deltas("a", "b", "c", "d"), final: "abcd"}
	s := New(a, WithLimiter(allowAll{}), WithFlushEvery(time.Hour))

	ch, err := s.Ask(context.Background(), 1, "q", "")
	require.NoError(t, err)
	got := drain(t, ch)

	require.Len(t, got, 2, "all deltas in one batch, then DONE")
	assert.Equal(t, "abcd", got[0].Text)
	assert.Equal(t, domain.AssistantEventDone, got[1].Kind)
}

func TestAsk_Validation(t *testing.T) {
	s := New(&scripted{}, WithLimiter(allowAll{}))
	_, err := s.Ask(context.Background(), 1, "   ", "")
	assert.ErrorIs(t, err, domain.ErrInvalidInput, "empty message")
	_, err = s.Ask(context.Background(), 1, strings.Repeat("x", domain.AssistantMaxMessageBytes+1), "")
	assert.ErrorIs(t, err, domain.ErrInvalidInput, "oversized message")
	_, err = s.Ask(context.Background(), 1, "q", strings.Repeat("p", 65))
	assert.ErrorIs(t, err, domain.ErrInvalidInput, "oversized page")
	_, err = s.Ask(context.Background(), 0, "q", "")
	assert.ErrorIs(t, err, domain.ErrForbidden, "no user")
}

func TestAsk_RateLimited(t *testing.T) {
	s := New(&scripted{}, WithLimiter(denyAll{}))
	_, err := s.Ask(context.Background(), 1, "q", "")
	assert.ErrorIs(t, err, domain.ErrRateLimited)
}

func TestAsk_OneReplyPerUser(t *testing.T) {
	block := make(chan struct{})
	s := New(&scripted{block: block, final: "x"}, WithLimiter(allowAll{}))

	ch, err := s.Ask(context.Background(), 5, "first", "")
	require.NoError(t, err)
	_, err = s.Ask(context.Background(), 5, "second", "")
	assert.ErrorIs(t, err, domain.ErrAssistantBusy)

	_, err = s.Ask(context.Background(), 6, "other user", "")
	assert.NoError(t, err, "different user is independent")

	close(block)
	drain(t, ch)
	// Slot is released after the stream ends.
	ch2, err := s.Ask(context.Background(), 5, "third", "")
	require.NoError(t, err)
	drain(t, ch2)
}

func TestAsk_CancellationStopsAndReleases(t *testing.T) {
	block := make(chan struct{})
	a := &scripted{block: block}
	s := New(a, WithLimiter(allowAll{}))

	ctx, cancel := context.WithCancel(context.Background())
	ch, err := s.Ask(ctx, 9, "q", "")
	require.NoError(t, err)
	cancel()
	drain(t, ch) // closes promptly; no final event is required after cancel

	ch2, err := s.Ask(context.Background(), 9, "again", "")
	require.NoError(t, err, "slot released after cancellation")
	close(block)
	drain(t, ch2)
}

func TestAsk_ErrorIsUserSafe(t *testing.T) {
	a := &scripted{err: errors.New("anthropic: 401 invalid x-api-key sk-secret")}
	s := New(a, WithLimiter(allowAll{}))

	ch, err := s.Ask(context.Background(), 1, "q", "")
	require.NoError(t, err)
	got := drain(t, ch)
	require.Len(t, got, 1)
	assert.Equal(t, domain.AssistantEventError, got[0].Kind)
	assert.NotContains(t, got[0].Message, "sk-secret", "upstream details never reach the client")
}

func TestDisabled(t *testing.T) {
	var s *Service
	_, err := s.Ask(context.Background(), 1, "q", "")
	assert.ErrorIs(t, err, domain.ErrAssistantDisabled)
}

func TestNewJeeves_BuildsWithoutNetwork(t *testing.T) {
	s, err := NewJeeves("claude-opus-5", allowAll{})
	require.NoError(t, err)
	assert.NotNil(t, s)
	assert.Equal(t, "claude-opus-5", s.model)
}
