package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/ai-tooling/evals"
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

// answerAll returns a provider that answers every question in one turn.
func answerAll(n int, text string) *fake.Provider {
	turns := make([]fake.Turn, n)
	for i := range turns {
		turns[i] = fake.Turn{Text: []string{text}, Stop: llm.StopEnd, Usage: llm.Usage{InputTokens: 50, OutputTokens: 5}}
	}
	return &fake.Provider{Turns: turns}
}

func TestEval_CompareArea(t *testing.T) {
	dir := t.TempDir()
	// Cites pick-two AND says the unsupported phrase: passes traps and
	// pick-two seeds, fails seeds expecting other entries.
	p := answerAll(100, "Open **Compare** [compare.pick-two]. Perspectize doesn't support that.")
	code, out, errOut := runWith(t, p, nil, "eval", "--area", "compare", "--runs", "2", "--out", dir)
	require.Equal(t, 0, code, errOut)

	assert.Contains(t, out, "PASS")
	assert.Contains(t, out, "pass rate")
	assert.Contains(t, errOut, "saved ")

	files, err := os.ReadDir(dir)
	require.NoError(t, err)
	require.Len(t, files, 1)
	raw, err := os.ReadFile(filepath.Join(dir, files[0].Name()))
	require.NoError(t, err)
	var rep struct {
		Model       string `json:"model"`
		RunsPerSeed int    `json:"runs_per_seed"`
		Seeds       []struct {
			Trap bool `json:"trap"`
		} `json:"seeds"`
	}
	require.NoError(t, json.Unmarshal(raw, &rep))
	assert.Equal(t, defaultModel, rep.Model)
	assert.Equal(t, 2, rep.RunsPerSeed)
	assert.NotEmpty(t, rep.Seeds)
	traps := 0
	for _, s := range rep.Seeds {
		if s.Trap {
			traps++
		}
	}
	assert.GreaterOrEqual(t, traps, 1, "compare seeds include a trap")
}

func TestEval_BadArgs(t *testing.T) {
	code, _, _ := runWith(t, answerAll(1, "x"), nil, "eval", "--runs", "0")
	assert.Equal(t, 2, code)
	code, _, errOut := runWith(t, answerAll(1, "x"), nil, "eval", "--area", "nope", "--out", t.TempDir())
	assert.Equal(t, 1, code)
	assert.Contains(t, errOut, "no seed questions")
}

func TestToolsCall_ListPerspectivesUsesFixture(t *testing.T) {
	code, out, _ := runWith(t, nil, nil, "tools", "list")
	require.Equal(t, 0, code)
	assert.Contains(t, out, "list_perspectives")

	code, out, errOut := runWith(t, nil, nil, "tools", "call", "list_perspectives", "--as", "1", "--input", `{"scope":"content","content_id":101}`)
	require.Equal(t, 0, code, errOut)
	assert.Contains(t, out, "Deep Sea")
	assert.Contains(t, out, "untrusted")
	assert.NotContains(t, out, evals.Canary, "user 1 never sees user 2's private review")

	code, out, _ = runWith(t, nil, nil, "tools", "call", "list_perspectives", "--input", `{"scope":"mine"}`)
	require.Equal(t, 0, code)
	assert.Contains(t, out, "isn't signed in", "the default is signed out")
}

func TestChat_AsBindsTheViewer(t *testing.T) {
	p := &fake.Provider{Turns: []fake.Turn{
		{Calls: []llm.ToolCall{{ID: "t1", Name: "list_perspectives", Input: json.RawMessage(`{"scope":"mine"}`)}}, Stop: llm.StopToolUse},
		{Text: []string{"Your top pick is The Deep Sea Documentary."}, Stop: llm.StopEnd},
	}}
	code, _, errOut := runWith(t, p, nil, "chat", "--as", "1", "What did I rate highest?")
	require.Equal(t, 0, code, errOut)
	result := p.Requests()[1].Messages[2].Parts[0].Result.Content
	assert.Contains(t, result, "Psalm 23", "user 1's own private perspective is visible to them")
	assert.NotContains(t, result, evals.Canary)
}

func TestEval_DataSuite(t *testing.T) {
	dir := t.TempDir()
	p := answerAll(100, "Please sign in. [compare.pick-two]")
	code, out, errOut := runWith(t, p, nil, "eval", "--suite", "data", "--runs", "1", "--out", dir)
	require.Equal(t, 0, code, errOut)
	assert.Contains(t, errOut, fmt.Sprintf("evaluating %d questions", len(evals.DataCases())))
	assert.Contains(t, out, "pass rate")
	assert.Contains(t, out, "FAIL", "a canned answer can't pass the tool-selection cases")
}

func TestEval_SuiteArgs(t *testing.T) {
	code, _, _ := runWith(t, answerAll(1, "x"), nil, "eval", "--suite", "bogus")
	assert.Equal(t, 2, code)
	code, _, errOut := runWith(t, answerAll(1, "x"), nil, "eval", "--suite", "data", "--area", "compare")
	assert.Equal(t, 2, code)
	assert.Contains(t, errOut, "guide suite only")
}

func TestChat_MaxRoundsWrapsUp(t *testing.T) {
	call := llm.ToolCall{ID: "t", Name: "read_guide", Input: json.RawMessage(`{"area":"compare"}`)}
	p := &fake.Provider{Turns: []fake.Turn{
		{Calls: []llm.ToolCall{call}, Stop: llm.StopToolUse},
		{Calls: []llm.ToolCall{call}, Stop: llm.StopToolUse},
		{Text: []string{"Open Compare."}, Stop: llm.StopEnd},
	}}
	code, out, errOut := runWith(t, p, nil, "chat", "--max-rounds", "1", "How do I compare?")
	require.Equal(t, 0, code, errOut)
	assert.Equal(t, "Open Compare.\n", out)
	assert.Contains(t, errOut, "cap_reached=true")
	assert.Equal(t, llm.ToolChoiceNone, p.Requests()[2].ToolChoice)

	code, _, errOut = runWith(t, p, nil, "chat", "--max-rounds", "99", "q")
	assert.Equal(t, 1, code, "out-of-range cap is rejected")
	assert.Contains(t, errOut, "max rounds")
}

func TestEval_PrintsMaxCalls(t *testing.T) {
	p := answerAll(100, "Open **Compare** [compare.pick-two].")
	code, out, errOut := runWith(t, p, nil, "eval", "--area", "compare", "--runs", "1", "--out", t.TempDir())
	require.Equal(t, 0, code, errOut)
	assert.Contains(t, out, "MAX CALLS")
	assert.Contains(t, out, "runs that hit the round cap: 0")
}
