package main

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/ai-tooling/llm"
	"github.com/CodeWarrior-debug/perspectize/ai-tooling/llm/fake"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func runWith(t *testing.T, p llm.Provider, env map[string]string, args ...string) (int, string, string) {
	t.Helper()
	var out, errOut bytes.Buffer
	d := deps{
		newProvider: func() llm.Provider { return p },
		getenv:      func(k string) string { return env[k] },
	}
	code := run(args, &out, &errOut, d)
	return code, out.String(), errOut.String()
}

func TestUsage(t *testing.T) {
	code, _, errOut := runWith(t, nil, nil)
	assert.Equal(t, 2, code)
	assert.Contains(t, errOut, "usage: botler")

	code, _, _ = runWith(t, nil, nil, "bogus")
	assert.Equal(t, 2, code)
}

func TestToolsList(t *testing.T) {
	code, out, _ := runWith(t, nil, nil, "tools", "list")
	assert.Equal(t, 0, code)
	assert.Contains(t, out, "read_guide")
}

func TestToolsCall(t *testing.T) {
	code, out, _ := runWith(t, nil, nil, "tools", "call", "read_guide", "--input", `{"area":"compare"}`)
	require.Equal(t, 0, code)
	assert.Contains(t, out, "## compare.pick-two", "reads the real embedded guide")

	code, _, errOut := runWith(t, nil, nil, "tools", "call", "read_guide", "--input", `{"area":"nope"}`)
	assert.Equal(t, 1, code)
	assert.Contains(t, errOut, "unknown area")

	code, _, _ = runWith(t, nil, nil, "tools", "call")
	assert.Equal(t, 2, code, "missing tool name")
}

func TestChat(t *testing.T) {
	p := &fake.Provider{Turns: []fake.Turn{
		{Calls: []llm.ToolCall{{ID: "t1", Name: "read_guide", Input: json.RawMessage(`{"area":"compare"}`)}},
			Stop: llm.StopToolUse, Usage: llm.Usage{InputTokens: 100, OutputTokens: 10}},
		{Text: []string{"Open **Compare** ", "[compare.pick-two]."}, Stop: llm.StopEnd, Usage: llm.Usage{InputTokens: 200, OutputTokens: 20}},
	}}
	code, out, errOut := runWith(t, p, map[string]string{"ASSISTANT_MODEL": "env-model"}, "chat", "How do I compare?")
	require.Equal(t, 0, code, errOut)
	assert.Equal(t, "Open **Compare** [compare.pick-two].\n", out)
	assert.Contains(t, errOut, `→ read_guide {"area":"compare"}`)
	assert.Contains(t, errOut, "in=300 out=30")
	assert.Contains(t, errOut, "calls=2")
	assert.Equal(t, "env-model", p.Requests()[0].Model)
}

func TestChat_ModelFlagWins(t *testing.T) {
	p := &fake.Provider{Turns: []fake.Turn{{Text: []string{"hi"}, Stop: llm.StopEnd}}}
	code, _, _ := runWith(t, p, map[string]string{"ASSISTANT_MODEL": "env-model"}, "chat", "--model", "flag-model", "hello", "there")
	require.Equal(t, 0, code)
	assert.Equal(t, "flag-model", p.Requests()[0].Model)
	assert.Equal(t, "hello there", p.Requests()[0].Messages[0].Text())
}

func TestChat_DefaultModel(t *testing.T) {
	p := &fake.Provider{Turns: []fake.Turn{{Text: []string{"hi"}, Stop: llm.StopEnd}}}
	code, _, _ := runWith(t, p, nil, "chat", "hello")
	require.Equal(t, 0, code)
	assert.Equal(t, defaultModel, p.Requests()[0].Model)
}

func TestChat_Errors(t *testing.T) {
	code, _, _ := runWith(t, &fake.Provider{}, nil, "chat")
	assert.Equal(t, 2, code, "no question")

	code, _, errOut := runWith(t, &fake.Provider{Turns: []fake.Turn{{Err: assert.AnError}}}, nil, "chat", "q")
	assert.Equal(t, 1, code)
	assert.True(t, strings.Contains(errOut, assert.AnError.Error()))
}

func TestChat_Refusal(t *testing.T) {
	p := &fake.Provider{Turns: []fake.Turn{{Stop: llm.StopRefusal}}}
	code, _, errOut := runWith(t, p, nil, "chat", "q")
	assert.Equal(t, 0, code)
	assert.Contains(t, errOut, "stop=refusal")
}
