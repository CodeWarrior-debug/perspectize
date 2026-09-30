// Package llm defines provider-neutral types for talking to a language model.
//
// Everything outside an adapter package (llm/anthropic, later llm/openrouter)
// speaks these types only. That keeps the agent loop, tools, evals and the
// backend independent of any one provider's SDK (ai-tooling decision 3).
package llm

import (
	"context"
	"encoding/json"
	"strings"
)

// Role is who authored a message.
type Role string

const (
	RoleUser      Role = "user"
	RoleAssistant Role = "assistant"
)

// PartKind says which field of a Part is meaningful.
type PartKind int

const (
	PartText PartKind = iota
	PartToolCall
	PartToolResult
	// PartOpaque carries a provider-private block (e.g. an Anthropic thinking
	// block) that must be sent back unchanged on later turns. Only the adapter
	// named in Provider reads it; everything else passes it through untouched.
	PartOpaque
)

// Part is one piece of a message. Exactly the field matching Kind is set.
type Part struct {
	Kind     PartKind
	Text     string
	Call     ToolCall
	Result   ToolResult
	Provider string          // PartOpaque: adapter that produced it
	Opaque   json.RawMessage // PartOpaque: adapter-defined payload
}

// TextPart, CallPart and ResultPart build the common part kinds.
func TextPart(s string) Part       { return Part{Kind: PartText, Text: s} }
func CallPart(c ToolCall) Part     { return Part{Kind: PartToolCall, Call: c} }
func ResultPart(r ToolResult) Part { return Part{Kind: PartToolResult, Result: r} }
func OpaquePart(provider string, raw json.RawMessage) Part {
	return Part{Kind: PartOpaque, Provider: provider, Opaque: raw}
}

// ToolCall is the model asking to run a tool. The model never runs anything
// itself: our code decides whether and how to execute it.
type ToolCall struct {
	ID    string
	Name  string
	Input json.RawMessage // raw JSON; validated against the tool's schema before use
}

// ToolResult is our answer to one ToolCall, matched by CallID.
type ToolResult struct {
	CallID  string
	Content string
	IsError bool
}

// Message is one conversation turn.
type Message struct {
	Role  Role
	Parts []Part
}

// Text concatenates the message's text parts.
func (m Message) Text() string {
	var b strings.Builder
	for _, p := range m.Parts {
		if p.Kind == PartText {
			b.WriteString(p.Text)
		}
	}
	return b.String()
}

// ToolCalls returns the message's tool calls in order.
func (m Message) ToolCalls() []ToolCall {
	var calls []ToolCall
	for _, p := range m.Parts {
		if p.Kind == PartToolCall {
			calls = append(calls, p.Call)
		}
	}
	return calls
}

// ToolSpec describes a tool to the model.
type ToolSpec struct {
	Name        string
	Description string
	InputSchema json.RawMessage // JSON Schema object
}

// Request is everything a provider needs for one model call. The API is
// stateless, so every call carries the full system prompt, tools and history.
type Request struct {
	Model     string
	System    string
	Messages  []Message
	Tools     []ToolSpec
	MaxTokens int
}

// Stop is why the model stopped generating.
type Stop string

const (
	StopEnd       Stop = "end"        // finished its answer
	StopToolUse   Stop = "tool_use"   // wants tool results before continuing
	StopMaxTokens Stop = "max_tokens" // hit the output cap mid-answer
	StopRefusal   Stop = "refusal"    // declined (safety classifier)
	StopOther     Stop = "other"      // anything an adapter can't map
)

// Usage counts tokens for billing, budgets and evals.
type Usage struct {
	InputTokens      int
	OutputTokens     int
	CacheReadTokens  int
	CacheWriteTokens int
}

// Add returns the field-wise sum.
func (u Usage) Add(o Usage) Usage {
	return Usage{
		InputTokens:      u.InputTokens + o.InputTokens,
		OutputTokens:     u.OutputTokens + o.OutputTokens,
		CacheReadTokens:  u.CacheReadTokens + o.CacheReadTokens,
		CacheWriteTokens: u.CacheWriteTokens + o.CacheWriteTokens,
	}
}

// EventKind identifies a streaming event.
type EventKind int

const (
	EventStart     EventKind = iota // a model call began
	EventTextDelta                  // Text holds the next chunk
	EventToolCall                   // Call holds a complete tool call
	EventDone                       // Stop and Usage are set
)

// Event is emitted while a response streams in. UIs use these to show text
// as it arrives, tool activity, and a clear finish (for Stop buttons and
// screen-reader announcements).
type Event struct {
	Kind  EventKind
	Text  string
	Call  ToolCall
	Stop  Stop
	Usage Usage
}

// Response is the complete result of one model call.
type Response struct {
	Message Message // Role is always RoleAssistant
	Stop    Stop
	Usage   Usage
}

// Provider is the port every model adapter implements.
//
// Stream makes one model call, invoking onEvent (on the calling goroutine)
// as output arrives, and returns the complete response. Cancelling ctx must
// abort the upstream call promptly: that is what stops billing when a user
// presses Stop.
type Provider interface {
	Stream(ctx context.Context, req Request, onEvent func(Event)) (Response, error)
}
