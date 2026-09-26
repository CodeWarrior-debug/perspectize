package agent

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/ai-tooling/llm"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const areaSchema = `{"type":"object","properties":{"area":{"type":"string"}},"required":["area"],"additionalProperties":false}`

func echoTool(name string) Tool {
	return Tool{
		Spec: llm.ToolSpec{Name: name, Description: "echo", InputSchema: json.RawMessage(areaSchema)},
		Handler: func(_ context.Context, in json.RawMessage) (string, error) {
			var v struct{ Area string }
			if err := json.Unmarshal(in, &v); err != nil {
				return "", err
			}
			return "area=" + v.Area, nil
		},
	}
}

func call(name, input string) llm.ToolCall {
	return llm.ToolCall{ID: "c1", Name: name, Input: json.RawMessage(input)}
}

func TestRegistry_RegisterAndSpecs(t *testing.T) {
	r := NewRegistry()
	require.NoError(t, r.Register(echoTool("b")))
	require.NoError(t, r.Register(echoTool("a")))

	specs := r.Specs()
	require.Len(t, specs, 2)
	assert.Equal(t, "b", specs[0].Name, "specs keep registration order (stable prompt-cache prefix)")
	assert.Equal(t, "a", specs[1].Name)
}

func TestRegistry_RegisterRejects(t *testing.T) {
	r := NewRegistry()
	require.NoError(t, r.Register(echoTool("a")))
	assert.Error(t, r.Register(echoTool("a")), "duplicate name")

	bad := echoTool("bad")
	bad.Spec.InputSchema = json.RawMessage(`{"type":`)
	assert.Error(t, r.Register(bad), "unparseable schema")

	noHandler := echoTool("nh")
	noHandler.Handler = nil
	assert.Error(t, r.Register(noHandler), "nil handler")
}

func TestRegistry_Call(t *testing.T) {
	r := NewRegistry()
	require.NoError(t, r.Register(echoTool("echo")))
	failing := echoTool("fails")
	failing.Handler = func(context.Context, json.RawMessage) (string, error) { return "", errors.New("db down") }
	require.NoError(t, r.Register(failing))
	big := echoTool("big")
	big.Handler = func(context.Context, json.RawMessage) (string, error) {
		return strings.Repeat("x", MaxResultBytes+100), nil
	}
	require.NoError(t, r.Register(big))

	tests := []struct {
		name        string
		call        llm.ToolCall
		wantErr     bool
		wantContent string
	}{
		{"valid input", call("echo", `{"area":"compare"}`), false, "area=compare"},
		{"unknown tool", call("nope", `{}`), true, `unknown tool "nope"`},
		{"invalid JSON", call("echo", `{"area":`), true, "invalid JSON"},
		{"schema violation", call("echo", `{"area":7}`), true, "invalid input"},
		{"missing required", call("echo", `{}`), true, "invalid input"},
		{"handler error", call("fails", `{"area":"x"}`), true, "db down"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res := r.Call(context.Background(), tt.call)
			assert.Equal(t, "c1", res.CallID)
			assert.Equal(t, tt.wantErr, res.IsError)
			assert.Contains(t, res.Content, tt.wantContent)
		})
	}

	t.Run("oversized result is truncated", func(t *testing.T) {
		res := r.Call(context.Background(), call("big", `{"area":"x"}`))
		assert.False(t, res.IsError)
		assert.LessOrEqual(t, len(res.Content), MaxResultBytes+len(truncatedMarker))
		assert.True(t, strings.HasSuffix(res.Content, truncatedMarker))
	})
}
