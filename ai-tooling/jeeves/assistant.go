package jeeves

import (
	"context"
	"errors"

	"github.com/CodeWarrior-debug/perspectize/ai-tooling/agent"
	"github.com/CodeWarrior-debug/perspectize/ai-tooling/appguide"
	"github.com/CodeWarrior-debug/perspectize/ai-tooling/llm"
)

// DefaultMaxTokens is the per-call output cap. Generous on purpose: hitting
// the cap truncates an answer mid-sentence.
const DefaultMaxTokens = 16000

// Config wires an Assistant. Areas usually come from appguide.Load.
type Config struct {
	Provider llm.Provider
	Model    string
	Areas    []appguide.Area
	Name     string // display name; invalid or empty falls back to DefaultName

	// Data, when set, adds the read-only data tools (list_perspectives),
	// bound per request to the viewer passed to AskAs.
	Data PerspectizeData
}

// Assistant is Jeeves: system prompt + tools + agent loop, ready to ask.
// botler, evals and (later) the backend all build it the same way.
type Assistant struct {
	provider llm.Provider
	areas    []appguide.Area
	data     PerspectizeData
	tools    *agent.Registry // tool set for an anonymous viewer
	model    string
	system   string
}

// New builds an Assistant: read_guide always, plus the data tools when
// cfg.Data is set.
func New(cfg Config) (*Assistant, error) {
	if cfg.Provider == nil {
		return nil, errors.New("jeeves: provider required")
	}
	if cfg.Model == "" {
		return nil, errors.New("jeeves: model required")
	}
	a := &Assistant{
		provider: cfg.Provider,
		areas:    cfg.Areas,
		data:     cfg.Data,
		model:    cfg.Model,
		system:   SystemPrompt(cfg.Areas, cfg.Name, cfg.Data != nil),
	}
	tools, err := a.toolsFor(Viewer{})
	if err != nil {
		return nil, err
	}
	a.tools = tools
	return a, nil
}

// toolsFor builds the tool set for one viewer. Registration order is fixed
// (read_guide first) so the tool list stays byte-stable for prompt caching.
func (a *Assistant) toolsFor(v Viewer) (*agent.Registry, error) {
	r := agent.NewRegistry()
	if err := r.Register(ReadGuideTool(a.areas)); err != nil {
		return nil, err
	}
	if a.data != nil {
		if err := r.Register(ListPerspectivesTool(a.data, v)); err != nil {
			return nil, err
		}
	}
	return r, nil
}

// System returns the system prompt (for inspection and tests).
func (a *Assistant) System() string { return a.system }

// Tools returns the anonymous viewer's tool registry (for `botler tools`).
func (a *Assistant) Tools() *agent.Registry { return a.tools }

// Ask answers one question for an anonymous viewer, with no prior history.
func (a *Assistant) Ask(ctx context.Context, question string, onEvent func(llm.Event)) (agent.Result, error) {
	return a.AskAs(ctx, Viewer{}, question, onEvent)
}

// AskAs answers one question for viewer, with no prior history. Data tools
// are bound to viewer here, never taken from the model's tool input.
func (a *Assistant) AskAs(ctx context.Context, viewer Viewer, question string, onEvent func(llm.Event)) (agent.Result, error) {
	tools := a.tools
	if a.data != nil && !viewer.Anonymous() {
		var err error
		if tools, err = a.toolsFor(viewer); err != nil {
			return agent.Result{}, err
		}
	}
	loop := &agent.Loop{Provider: a.provider, Tools: tools}
	return loop.Run(ctx, llm.Request{
		Model:     a.model,
		System:    a.system,
		MaxTokens: DefaultMaxTokens,
		Messages:  []llm.Message{{Role: llm.RoleUser, Parts: []llm.Part{llm.TextPart(question)}}},
	}, onEvent)
}
