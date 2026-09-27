package assistant

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/CodeWarrior-debug/perspectize/ai-tooling/appguide"
	"github.com/CodeWarrior-debug/perspectize/ai-tooling/jeeves"
	"github.com/CodeWarrior-debug/perspectize/ai-tooling/llm"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// maxToolInputBytes caps one tool input. Real inputs are a few dozen bytes.
const maxToolInputBytes = 2048

// ToolRunner implements portservices.AssistantToolService over Jeeves's own
// tool registry (jeeves.Tools), so WebMCP callers get exactly the tools,
// schema checks and privacy rules the in-app assistant has. It needs no model
// and no API key. A nil *ToolRunner means the feature is disabled.
type ToolRunner struct {
	areas []appguide.Area
	data  jeeves.PerspectizeData
}

var _ portservices.AssistantToolService = (*ToolRunner)(nil)

// NewToolRunner loads the embedded guide and binds the data source.
func NewToolRunner(data jeeves.PerspectizeData) (*ToolRunner, error) {
	areas, _, err := appguide.Load()
	if err != nil {
		return nil, fmt.Errorf("assistant tools: load app guide: %w", err)
	}
	return &ToolRunner{areas: areas, data: data}, nil
}

// Specs lists the exposed tools: only those jeeves marks read-only.
func (r *ToolRunner) Specs() []domain.AssistantToolSpec {
	if r == nil {
		return nil
	}
	reg, err := jeeves.Tools(r.areas, r.data, jeeves.Viewer{})
	if err != nil {
		slog.Error("assistant tools: build registry", "error", err)
		return nil
	}
	var out []domain.AssistantToolSpec
	for _, s := range reg.Specs() {
		if !jeeves.ReadOnlyTools[s.Name] {
			continue
		}
		out = append(out, domain.AssistantToolSpec{
			Name:             s.Name,
			Description:      s.Description,
			InputSchema:      string(s.InputSchema),
			UntrustedContent: s.Name == jeeves.ListPerspectivesToolName,
		})
	}
	return out
}

// Run calls one exposed tool as userID. Validation failures and tool errors
// come back as errors whose text is safe to show (data tools never include
// backend error details).
func (r *ToolRunner) Run(ctx context.Context, userID int, name, inputJSON string) (string, error) {
	if r == nil {
		return "", domain.ErrAssistantToolsDisabled
	}
	if userID <= 0 {
		return "", fmt.Errorf("%w: a signed-in user is required", domain.ErrInvalidInput)
	}
	if !jeeves.ReadOnlyTools[name] {
		return "", fmt.Errorf("%w: %q", domain.ErrAssistantToolUnknown, name)
	}
	if len(inputJSON) > maxToolInputBytes {
		return "", fmt.Errorf("%w: tool input is longer than %d bytes", domain.ErrInvalidInput, maxToolInputBytes)
	}
	if !json.Valid([]byte(inputJSON)) {
		return "", fmt.Errorf("%w: tool input must be JSON", domain.ErrInvalidInput)
	}
	reg, err := jeeves.Tools(r.areas, r.data, jeeves.Viewer{UserID: userID})
	if err != nil {
		return "", fmt.Errorf("assistant tools: build registry: %w", err)
	}
	res := reg.Call(ctx, llm.ToolCall{ID: "webmcp", Name: name, Input: json.RawMessage(inputJSON)})
	slog.InfoContext(ctx, "assistant tool call", "surface", "webmcp", "user_id", userID, "tool", name, "error", res.IsError)
	if res.IsError {
		return "", fmt.Errorf("%w: %s", domain.ErrInvalidInput, res.Content)
	}
	return res.Content, nil
}
