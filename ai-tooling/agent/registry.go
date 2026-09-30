// Package agent runs the tool-use loop: ask the model, execute the tools it
// requests, send the results back, repeat until it answers.
package agent

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/CodeWarrior-debug/perspectize/ai-tooling/llm"
	"github.com/google/jsonschema-go/jsonschema"
)

// MaxResultBytes caps one tool result so a tool can't flood the context
// window (and the bill) with, say, fifty full perspectives.
const MaxResultBytes = 16 * 1024

const truncatedMarker = "\n…[truncated]"

// Handler runs a tool. input has already been validated against the tool's
// schema. The returned string is sent to the model as the tool result.
type Handler func(ctx context.Context, input json.RawMessage) (string, error)

// Tool is a spec the model sees plus the handler our code runs.
type Tool struct {
	Spec    llm.ToolSpec
	Handler Handler
}

type registered struct {
	tool   Tool
	schema *jsonschema.Resolved
}

// Registry holds tools in registration order. Order matters: the tool list
// is part of the prompt-cache prefix, so it must be stable across calls.
type Registry struct {
	byName map[string]registered
	order  []string
}

// NewRegistry returns an empty registry.
func NewRegistry() *Registry {
	return &Registry{byName: map[string]registered{}}
}

// Register adds a tool, compiling its input schema up front so a bad schema
// fails at startup rather than on a user's first question.
func (r *Registry) Register(t Tool) error {
	name := t.Spec.Name
	if name == "" || t.Handler == nil {
		return fmt.Errorf("agent: tool needs a name and a handler")
	}
	if _, dup := r.byName[name]; dup {
		return fmt.Errorf("agent: tool %q already registered", name)
	}
	var s jsonschema.Schema
	if err := json.Unmarshal(t.Spec.InputSchema, &s); err != nil {
		return fmt.Errorf("agent: tool %q schema: %w", name, err)
	}
	resolved, err := s.Resolve(nil)
	if err != nil {
		return fmt.Errorf("agent: tool %q schema: %w", name, err)
	}
	r.byName[name] = registered{tool: t, schema: resolved}
	r.order = append(r.order, name)
	return nil
}

// Specs returns the tool specs in registration order.
func (r *Registry) Specs() []llm.ToolSpec {
	specs := make([]llm.ToolSpec, 0, len(r.order))
	for _, name := range r.order {
		specs = append(specs, r.byName[name].tool.Spec)
	}
	return specs
}

// Call executes one tool call. It never panics or returns a Go error: every
// failure becomes an IsError result the model can read and recover from.
func (r *Registry) Call(ctx context.Context, c llm.ToolCall) llm.ToolResult {
	fail := func(format string, args ...any) llm.ToolResult {
		return llm.ToolResult{CallID: c.ID, Content: fmt.Sprintf(format, args...), IsError: true}
	}

	reg, ok := r.byName[c.Name]
	if !ok {
		return fail("unknown tool %q", c.Name)
	}
	// Models can emit malformed or schema-violating input; never trust it.
	var instance any
	if err := json.Unmarshal(c.Input, &instance); err != nil {
		return fail("invalid JSON input: %v", err)
	}
	if err := reg.schema.Validate(instance); err != nil {
		return fail("invalid input: %v", err)
	}

	out, err := reg.tool.Handler(ctx, c.Input)
	if err != nil {
		return fail("%s failed: %v", c.Name, err)
	}
	if len(out) > MaxResultBytes {
		out = out[:MaxResultBytes] + truncatedMarker
	}
	return llm.ToolResult{CallID: c.ID, Content: out}
}
