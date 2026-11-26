package anthropic

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/anthropics/anthropic-sdk-go/option"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/ai-tooling/llm"
)

// sse renders (event, data) pairs as a Server-Sent Events body.
func sse(pairs ...string) string {
	var b strings.Builder
	for i := 0; i+1 < len(pairs); i += 2 {
		fmt.Fprintf(&b, "event: %s\ndata: %s\n\n", pairs[i], pairs[i+1])
	}
	return b.String()
}

const msgStart = `{"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","model":"claude-opus-5","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":12,"output_tokens":1,"cache_read_input_tokens":4,"cache_creation_input_tokens":8}}}`

// toolTurn: thinking block, text, then a streamed tool call.
var toolTurn = sse(
	"message_start", msgStart,
	"content_block_start", `{"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":"","signature":""}}`,
	"content_block_delta", `{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"hmm"}}`,
	"content_block_delta", `{"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"sig123"}}`,
	"content_block_stop", `{"type":"content_block_stop","index":0}`,
	"content_block_start", `{"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}`,
	"content_block_delta", `{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Let me "}}`,
	"content_block_delta", `{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"check."}}`,
	"content_block_stop", `{"type":"content_block_stop","index":1}`,
	"content_block_start", `{"type":"content_block_start","index":2,"content_block":{"type":"tool_use","id":"toolu_1","name":"read_guide","input":{}}}`,
	"content_block_delta", `{"type":"content_block_delta","index":2,"delta":{"type":"input_json_delta","partial_json":"{\"area\":"}}`,
	"content_block_delta", `{"type":"content_block_delta","index":2,"delta":{"type":"input_json_delta","partial_json":"\"compare\"}"}}`,
	"content_block_stop", `{"type":"content_block_stop","index":2}`,
	"message_delta", `{"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":30}}`,
	"message_stop", `{"type":"message_stop"}`,
)

func refusalTurn() string {
	return sse(
		"message_start", msgStart,
		"message_delta", `{"type":"message_delta","delta":{"stop_reason":"refusal","stop_sequence":null},"usage":{"output_tokens":0}}`,
		"message_stop", `{"type":"message_stop"}`,
	)
}

// server serves one SSE body per request and records request bodies.
func server(t *testing.T, bodies ...string) (*Provider, *[]map[string]any) {
	t.Helper()
	var got []map[string]any
	n := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		var m map[string]any
		require.NoError(t, json.Unmarshal(raw, &m))
		got = append(got, m)
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, bodies[n])
		n++
	}))
	t.Cleanup(srv.Close)
	return New(option.WithBaseURL(srv.URL), option.WithAPIKey("test-key"), option.WithMaxRetries(0)), &got
}

var guideSchema = json.RawMessage(`{"type":"object","properties":{"area":{"type":"string"}},"required":["area"],"additionalProperties":false}`)

func TestStream_ToolTurn(t *testing.T) {
	p, got := server(t, toolTurn)
	req := llm.Request{
		Model: "claude-opus-5", System: "sys", MaxTokens: 1000,
		Tools:    []llm.ToolSpec{{Name: "read_guide", Description: "guide", InputSchema: guideSchema}},
		Messages: []llm.Message{{Role: llm.RoleUser, Parts: []llm.Part{llm.TextPart("How do I compare?")}}},
	}

	var events []llm.Event
	resp, err := p.Stream(context.Background(), req, func(e llm.Event) { events = append(events, e) })
	require.NoError(t, err)

	assert.Equal(t, llm.StopToolUse, resp.Stop)
	assert.Equal(t, llm.Usage{InputTokens: 12, OutputTokens: 30, CacheReadTokens: 4, CacheWriteTokens: 8}, resp.Usage)
	require.Len(t, resp.Message.Parts, 3)
	assert.Equal(t, llm.PartOpaque, resp.Message.Parts[0].Kind, "thinking block kept opaque")
	assert.Equal(t, "Let me check.", resp.Message.Text())
	calls := resp.Message.ToolCalls()
	require.Len(t, calls, 1)
	assert.Equal(t, "toolu_1", calls[0].ID)
	assert.JSONEq(t, `{"area":"compare"}`, string(calls[0].Input))

	var kinds []llm.EventKind
	for _, e := range events {
		kinds = append(kinds, e.Kind)
	}
	assert.Equal(t, []llm.EventKind{llm.EventStart, llm.EventTextDelta, llm.EventTextDelta, llm.EventToolCall, llm.EventDone}, kinds)

	// Request translation.
	body := (*got)[0]
	assert.Equal(t, "claude-opus-5", body["model"])
	assert.EqualValues(t, 1000, body["max_tokens"])
	assert.Equal(t, map[string]any{"type": "adaptive"}, body["thinking"])
	sys := body["system"].([]any)[0].(map[string]any)
	assert.Equal(t, "sys", sys["text"])
	assert.NotNil(t, sys["cache_control"], "system prompt carries a cache breakpoint")
	tool := body["tools"].([]any)[0].(map[string]any)
	schema := tool["input_schema"].(map[string]any)
	assert.Equal(t, false, schema["additionalProperties"], "extra schema keys survive translation")
	assert.Equal(t, []any{"area"}, schema["required"])
}

func TestStream_ThinkingBlockRoundTrips(t *testing.T) {
	p, got := server(t, toolTurn, toolTurn)
	req := llm.Request{Model: "m", MaxTokens: 10, Messages: []llm.Message{{Role: llm.RoleUser, Parts: []llm.Part{llm.TextPart("q")}}}}
	resp, err := p.Stream(context.Background(), req, func(llm.Event) {})
	require.NoError(t, err)

	req.Messages = append(req.Messages, resp.Message, llm.Message{Role: llm.RoleUser, Parts: []llm.Part{
		llm.ResultPart(llm.ToolResult{CallID: "toolu_1", Content: "guide text"}),
	}})
	_, err = p.Stream(context.Background(), req, func(llm.Event) {})
	require.NoError(t, err)

	msgs := (*got)[1]["messages"].([]any)
	require.Len(t, msgs, 3)
	assistant := msgs[1].(map[string]any)["content"].([]any)
	thinking := assistant[0].(map[string]any)
	assert.Equal(t, "thinking", thinking["type"])
	assert.Equal(t, "sig123", thinking["signature"], "signature passed back unchanged")
	assert.Equal(t, "hmm", thinking["thinking"])
	result := msgs[2].(map[string]any)["content"].([]any)[0].(map[string]any)
	assert.Equal(t, "tool_result", result["type"])
	assert.Equal(t, "toolu_1", result["tool_use_id"])
}

func TestStream_Refusal(t *testing.T) {
	p, _ := server(t, refusalTurn())
	resp, err := p.Stream(context.Background(), llm.Request{Model: "m", MaxTokens: 10,
		Messages: []llm.Message{{Role: llm.RoleUser, Parts: []llm.Part{llm.TextPart("q")}}}}, func(llm.Event) {})
	require.NoError(t, err)
	assert.Equal(t, llm.StopRefusal, resp.Stop)
}

func TestStream_ForeignOpaqueDropped(t *testing.T) {
	p, got := server(t, refusalTurn())
	_, err := p.Stream(context.Background(), llm.Request{Model: "m", MaxTokens: 10, Messages: []llm.Message{
		{Role: llm.RoleUser, Parts: []llm.Part{llm.TextPart("q")}},
		{Role: llm.RoleAssistant, Parts: []llm.Part{llm.OpaquePart("openrouter", json.RawMessage(`{"x":1}`)), llm.TextPart("a")}},
		{Role: llm.RoleUser, Parts: []llm.Part{llm.TextPart("q2")}},
	}}, func(llm.Event) {})
	require.NoError(t, err)
	assistant := (*got)[0]["messages"].([]any)[1].(map[string]any)["content"].([]any)
	require.Len(t, assistant, 1, "another provider's opaque block is not sent to Anthropic")
}

func TestStream_HTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = io.WriteString(w, `{"type":"error","error":{"type":"invalid_request_error","message":"bad"}}`)
	}))
	t.Cleanup(srv.Close)
	p := New(option.WithBaseURL(srv.URL), option.WithAPIKey("k"), option.WithMaxRetries(0))
	_, err := p.Stream(context.Background(), llm.Request{Model: "m", MaxTokens: 1,
		Messages: []llm.Message{{Role: llm.RoleUser, Parts: []llm.Part{llm.TextPart("q")}}}}, func(llm.Event) {})
	assert.Error(t, err)
}

// TestLive_Smoke calls the real API. It skips unless ANTHROPIC_API_KEY is set,
// so CI never spends money.
func TestLive_Smoke(t *testing.T) {
	if os.Getenv("ANTHROPIC_API_KEY") == "" {
		t.Skip("ANTHROPIC_API_KEY not set")
	}
	model := os.Getenv("ASSISTANT_MODEL")
	if model == "" {
		model = "claude-opus-5"
	}
	resp, err := New().Stream(context.Background(), llm.Request{Model: model, MaxTokens: 2000,
		Messages: []llm.Message{{Role: llm.RoleUser, Parts: []llm.Part{llm.TextPart("Reply with the single word: pong")}}}},
		func(llm.Event) {})
	require.NoError(t, err)
	assert.Equal(t, llm.StopEnd, resp.Stop)
	assert.Contains(t, strings.ToLower(resp.Message.Text()), "pong")
}
