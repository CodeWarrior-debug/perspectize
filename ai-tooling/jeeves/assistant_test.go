package jeeves

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/ai-tooling/llm"
	"github.com/CodeWarrior-debug/perspectize/ai-tooling/llm/fake"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAssistant_Ask(t *testing.T) {
	p := &fake.Provider{Turns: []fake.Turn{
		{Calls: []llm.ToolCall{{ID: "t1", Name: ReadGuideToolName, Input: json.RawMessage(`{"area":"compare"}`)}}, Stop: llm.StopToolUse},
		{Text: []string{"Open **Compare** [compare.pick-two]."}, Stop: llm.StopEnd},
	}}
	a, err := New(Config{Provider: p, Model: "m", Areas: testAreas()})
	require.NoError(t, err)

	res, err := a.Ask(context.Background(), "How do I compare?", func(llm.Event) {})
	require.NoError(t, err)
	assert.Contains(t, res.Final.Text(), "[compare.pick-two]")

	reqs := p.Requests()
	require.Len(t, reqs, 2)
	assert.Equal(t, "m", reqs[0].Model)
	assert.Equal(t, a.System(), reqs[0].System)
	assert.Equal(t, DefaultMaxTokens, reqs[0].MaxTokens)
	require.Len(t, reqs[0].Tools, 1)
	assert.Equal(t, ReadGuideToolName, reqs[0].Tools[0].Name)
	// The guide content reached the model through the tool result.
	result := reqs[1].Messages[2].Parts[0].Result
	assert.False(t, result.IsError)
	assert.Contains(t, result.Content, "## compare.pick-two")
}

func TestNew_Validates(t *testing.T) {
	_, err := New(Config{Model: "m", Areas: testAreas()})
	assert.Error(t, err, "provider required")
	_, err = New(Config{Provider: &fake.Provider{}, Areas: testAreas()})
	assert.Error(t, err, "model required")
}
