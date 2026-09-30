package fake

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/ai-tooling/llm"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestProvider_ReplaysTurnsInOrder(t *testing.T) {
	call := llm.ToolCall{ID: "c1", Name: "read_guide", Input: json.RawMessage(`{"area":"compare"}`)}
	p := &Provider{Turns: []Turn{
		{Calls: []llm.ToolCall{call}, Stop: llm.StopToolUse, Usage: llm.Usage{InputTokens: 10, OutputTokens: 2}},
		{Text: []string{"Open ", "Compare."}, Stop: llm.StopEnd, Usage: llm.Usage{InputTokens: 20, OutputTokens: 3}},
	}}

	var events []llm.Event
	on := func(e llm.Event) { events = append(events, e) }

	r1, err := p.Stream(context.Background(), llm.Request{Model: "m1"}, on)
	require.NoError(t, err)
	assert.Equal(t, llm.StopToolUse, r1.Stop)
	assert.Equal(t, llm.RoleAssistant, r1.Message.Role)
	require.Len(t, r1.Message.Parts, 1)
	assert.Equal(t, llm.PartToolCall, r1.Message.Parts[0].Kind)
	assert.Equal(t, call, r1.Message.Parts[0].Call)

	r2, err := p.Stream(context.Background(), llm.Request{Model: "m2"}, on)
	require.NoError(t, err)
	assert.Equal(t, llm.StopEnd, r2.Stop)
	assert.Equal(t, "Open Compare.", r2.Message.Text())
	assert.Equal(t, llm.Usage{InputTokens: 20, OutputTokens: 3}, r2.Usage)

	var kinds []llm.EventKind
	for _, e := range events {
		kinds = append(kinds, e.Kind)
	}
	assert.Equal(t, []llm.EventKind{
		llm.EventStart, llm.EventToolCall, llm.EventDone,
		llm.EventStart, llm.EventTextDelta, llm.EventTextDelta, llm.EventDone,
	}, kinds)

	require.Len(t, p.Requests(), 2)
	assert.Equal(t, "m1", p.Requests()[0].Model)
	assert.Equal(t, "m2", p.Requests()[1].Model)
}

func TestProvider_ExhaustedTurnsError(t *testing.T) {
	p := &Provider{}
	_, err := p.Stream(context.Background(), llm.Request{}, func(llm.Event) {})
	assert.ErrorIs(t, err, ErrNoMoreTurns)
}

func TestProvider_ScriptedError(t *testing.T) {
	boom := assert.AnError
	p := &Provider{Turns: []Turn{{Err: boom}}}
	_, err := p.Stream(context.Background(), llm.Request{}, func(llm.Event) {})
	assert.ErrorIs(t, err, boom)
}

func TestProvider_HonoursCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	p := &Provider{Turns: []Turn{{Text: []string{"a", "b", "c"}, Stop: llm.StopEnd}}}
	n := 0
	_, err := p.Stream(ctx, llm.Request{}, func(e llm.Event) {
		if e.Kind == llm.EventTextDelta {
			n++
			cancel()
		}
	})
	assert.ErrorIs(t, err, context.Canceled)
	assert.Equal(t, 1, n, "no deltas after cancellation")
}

func TestUsage_Add(t *testing.T) {
	a := llm.Usage{InputTokens: 1, OutputTokens: 2, CacheReadTokens: 3, CacheWriteTokens: 4}
	assert.Equal(t, llm.Usage{InputTokens: 2, OutputTokens: 4, CacheReadTokens: 6, CacheWriteTokens: 8}, a.Add(a))
}
