package agent

import (
	"context"
	"encoding/json"
	"sync/atomic"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/ai-tooling/llm"
	"github.com/CodeWarrior-debug/perspectize/ai-tooling/llm/fake"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func userAsk(q string) llm.Request {
	return llm.Request{Model: "m", Messages: []llm.Message{{Role: llm.RoleUser, Parts: []llm.Part{llm.TextPart(q)}}}}
}

func newLoop(t *testing.T, p llm.Provider, tools ...Tool) *Loop {
	t.Helper()
	r := NewRegistry()
	for _, tool := range tools {
		require.NoError(t, r.Register(tool))
	}
	return &Loop{Provider: p, Tools: r}
}

func noEvents(llm.Event) {}

func TestLoop_TextOnly_OneCall(t *testing.T) {
	p := &fake.Provider{Turns: []fake.Turn{{Text: []string{"Hi"}, Stop: llm.StopEnd, Usage: llm.Usage{InputTokens: 5}}}}
	res, err := newLoop(t, p).Run(context.Background(), userAsk("hello"), noEvents)
	require.NoError(t, err)
	assert.Equal(t, "Hi", res.Final.Text())
	assert.Equal(t, llm.StopEnd, res.Stop)
	assert.Equal(t, 1, res.Calls)
	assert.Len(t, p.Requests(), 1)
}

func TestLoop_OneToolRound_TwoCalls(t *testing.T) {
	c := llm.ToolCall{ID: "t1", Name: "echo", Input: json.RawMessage(`{"area":"compare"}`)}
	p := &fake.Provider{Turns: []fake.Turn{
		{Calls: []llm.ToolCall{c}, Stop: llm.StopToolUse, Usage: llm.Usage{InputTokens: 10, OutputTokens: 1}},
		{Text: []string{"Done"}, Stop: llm.StopEnd, Usage: llm.Usage{InputTokens: 20, OutputTokens: 2}},
	}}
	res, err := newLoop(t, p, echoTool("echo")).Run(context.Background(), userAsk("q"), noEvents)
	require.NoError(t, err)

	assert.Equal(t, 2, res.Calls, "one tool round = two model calls")
	assert.Equal(t, llm.Usage{InputTokens: 30, OutputTokens: 3}, res.Usage)

	reqs := p.Requests()
	require.Len(t, reqs, 2)
	assert.NotEmpty(t, reqs[0].Tools, "tool specs are sent")
	// Second call carries: user ask, assistant tool call, user tool result.
	require.Len(t, reqs[1].Messages, 3)
	last := reqs[1].Messages[2]
	assert.Equal(t, llm.RoleUser, last.Role)
	require.Len(t, last.Parts, 1)
	assert.Equal(t, llm.PartToolResult, last.Parts[0].Kind)
	assert.Equal(t, "t1", last.Parts[0].Result.CallID)
	assert.Equal(t, "area=compare", last.Parts[0].Result.Content)
}

func TestLoop_ParallelCalls_OneResultsMessage(t *testing.T) {
	var inFlight, maxInFlight atomic.Int32
	slow := echoTool("slow")
	slow.Handler = func(context.Context, json.RawMessage) (string, error) {
		n := inFlight.Add(1)
		for {
			m := maxInFlight.Load()
			if n <= m || maxInFlight.CompareAndSwap(m, n) {
				break
			}
		}
		time.Sleep(20 * time.Millisecond)
		inFlight.Add(-1)
		return "ok", nil
	}
	calls := []llm.ToolCall{
		{ID: "a", Name: "slow", Input: json.RawMessage(`{"area":"1"}`)},
		{ID: "b", Name: "slow", Input: json.RawMessage(`{"area":"2"}`)},
	}
	p := &fake.Provider{Turns: []fake.Turn{
		{Calls: calls, Stop: llm.StopToolUse},
		{Text: []string{"Both done"}, Stop: llm.StopEnd},
	}}
	res, err := newLoop(t, p, slow).Run(context.Background(), userAsk("q"), noEvents)
	require.NoError(t, err)
	assert.Equal(t, 2, res.Calls, "parallel calls share one round")
	assert.Equal(t, int32(2), maxInFlight.Load(), "tools ran concurrently")

	results := p.Requests()[1].Messages[2]
	require.Len(t, results.Parts, 2, "all results in ONE user message")
	assert.Equal(t, "a", results.Parts[0].Result.CallID, "results keep call order")
	assert.Equal(t, "b", results.Parts[1].Result.CallID)
}

func TestLoop_RoundCap(t *testing.T) {
	c := llm.ToolCall{ID: "t", Name: "echo", Input: json.RawMessage(`{"area":"x"}`)}
	turns := make([]fake.Turn, 10)
	for i := range turns {
		turns[i] = fake.Turn{Calls: []llm.ToolCall{c}, Stop: llm.StopToolUse}
	}
	p := &fake.Provider{Turns: turns}
	l := newLoop(t, p, echoTool("echo"))
	l.MaxRounds = 2

	res, err := l.Run(context.Background(), userAsk("q"), noEvents)
	assert.ErrorIs(t, err, ErrRoundCap)
	assert.Equal(t, 3, res.Calls, "2 tool rounds executed, cap hit on the 3rd request for tools")
}

func TestLoop_CancelDuringTool(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	blocking := echoTool("block")
	blocking.Handler = func(ctx context.Context, _ json.RawMessage) (string, error) {
		cancel()
		<-ctx.Done()
		return "", ctx.Err()
	}
	c := llm.ToolCall{ID: "t", Name: "block", Input: json.RawMessage(`{"area":"x"}`)}
	p := &fake.Provider{Turns: []fake.Turn{
		{Calls: []llm.ToolCall{c}, Stop: llm.StopToolUse},
		{Text: []string{"never"}, Stop: llm.StopEnd},
	}}
	_, err := newLoop(t, p, blocking).Run(ctx, userAsk("q"), noEvents)
	assert.ErrorIs(t, err, context.Canceled)
	assert.Len(t, p.Requests(), 1, "no model call after cancellation")
}

func TestLoop_ProviderErrorReturnsPartial(t *testing.T) {
	p := &fake.Provider{Turns: []fake.Turn{{Err: assert.AnError}}}
	_, err := newLoop(t, p).Run(context.Background(), userAsk("q"), noEvents)
	assert.ErrorIs(t, err, assert.AnError)
}

func TestLoop_ForwardsEvents(t *testing.T) {
	p := &fake.Provider{Turns: []fake.Turn{{Text: []string{"a", "b"}, Stop: llm.StopEnd}}}
	var text string
	_, err := newLoop(t, p).Run(context.Background(), userAsk("q"), func(e llm.Event) {
		if e.Kind == llm.EventTextDelta {
			text += e.Text
		}
	})
	require.NoError(t, err)
	assert.Equal(t, "ab", text)
}
