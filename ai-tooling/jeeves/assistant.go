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
}

// Assistant is Jeeves: system prompt + tools + agent loop, ready to ask.
// botler, evals and (later) the backend all build it the same way.
type Assistant struct {
	loop   *agent.Loop
	model  string
	system string
}

// New builds an Assistant with the tracer tool set (read_guide).
func New(cfg Config) (*Assistant, error) {
	if cfg.Provider == nil {
		return nil, errors.New("jeeves: provider required")
	}
	if cfg.Model == "" {
		return nil, errors.New("jeeves: model required")
	}
	tools := agent.NewRegistry()
	if err := tools.Register(ReadGuideTool(cfg.Areas)); err != nil {
		return nil, err
	}
	return &Assistant{
		loop:   &agent.Loop{Provider: cfg.Provider, Tools: tools},
		model:  cfg.Model,
		system: SystemPrompt(cfg.Areas, cfg.Name),
	}, nil
}

// System returns the system prompt (for inspection and tests).
func (a *Assistant) System() string { return a.system }

// Tools returns the tool registry (for `botler tools`).
func (a *Assistant) Tools() *agent.Registry { return a.loop.Tools }

// Ask answers one question with no prior history.
func (a *Assistant) Ask(ctx context.Context, question string, onEvent func(llm.Event)) (agent.Result, error) {
	return a.loop.Run(ctx, llm.Request{
		Model:     a.model,
		System:    a.system,
		MaxTokens: DefaultMaxTokens,
		Messages:  []llm.Message{{Role: llm.RoleUser, Parts: []llm.Part{llm.TextPart(question)}}},
	}, onEvent)
}
