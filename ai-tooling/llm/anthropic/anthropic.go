// Package anthropic adapts the official Anthropic Go SDK to llm.Provider.
//
// This is the only package that imports the SDK (ai-tooling decision 3).
// Everything it returns is an llm type; provider-private blocks such as
// thinking blocks travel as llm.PartOpaque and come back here unchanged.
package anthropic

import (
	"context"
	"encoding/json"
	"fmt"

	sdk "github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"

	"github.com/CodeWarrior-debug/perspectize/ai-tooling/llm"
)

// ProviderName tags opaque parts produced by this adapter.
const ProviderName = "anthropic"

// Provider calls the Claude Messages API with streaming.
type Provider struct {
	client sdk.Client
}

var _ llm.Provider = (*Provider)(nil)

// New builds a provider. With no options the SDK reads ANTHROPIC_API_KEY
// (and other standard credential sources) from the environment.
func New(opts ...option.RequestOption) *Provider {
	return &Provider{client: sdk.NewClient(opts...)}
}

// Stream implements llm.Provider.
func (p *Provider) Stream(ctx context.Context, req llm.Request, onEvent func(llm.Event)) (llm.Response, error) {
	params, err := toParams(req)
	if err != nil {
		return llm.Response{}, err
	}

	stream := p.client.Messages.NewStreaming(ctx, params)
	defer stream.Close()

	var msg sdk.Message
	started := false
	for stream.Next() {
		ev := stream.Current()
		if err := msg.Accumulate(ev); err != nil {
			return llm.Response{}, fmt.Errorf("anthropic: accumulate stream: %w", err)
		}
		switch e := ev.AsAny().(type) {
		case sdk.MessageStartEvent:
			started = true
			onEvent(llm.Event{Kind: llm.EventStart})
		case sdk.ContentBlockDeltaEvent:
			if d, ok := e.Delta.AsAny().(sdk.TextDelta); ok && d.Text != "" {
				onEvent(llm.Event{Kind: llm.EventTextDelta, Text: d.Text})
			}
		case sdk.ContentBlockStopEvent:
			// Tool input arrives in pieces; emit the call once it's complete.
			if int(e.Index) < len(msg.Content) {
				if tu, ok := msg.Content[e.Index].AsAny().(sdk.ToolUseBlock); ok {
					onEvent(llm.Event{Kind: llm.EventToolCall, Call: toolCall(tu)})
				}
			}
		}
	}
	if err := stream.Err(); err != nil {
		return llm.Response{}, fmt.Errorf("anthropic: %w", err)
	}
	if !started {
		return llm.Response{}, fmt.Errorf("anthropic: stream ended without a message")
	}

	resp, err := fromMessage(msg)
	if err != nil {
		return llm.Response{}, err
	}
	onEvent(llm.Event{Kind: llm.EventDone, Stop: resp.Stop, Usage: resp.Usage})
	return resp, nil
}

// toParams translates a neutral request into SDK params.
func toParams(req llm.Request) (sdk.MessageNewParams, error) {
	params := sdk.MessageNewParams{
		Model:     sdk.Model(req.Model),
		MaxTokens: int64(req.MaxTokens),
		// Adaptive thinking: the model decides when and how much to think.
		Thinking: sdk.ThinkingConfigParamUnion{OfAdaptive: &sdk.ThinkingConfigAdaptiveParam{}},
	}
	if req.System != "" {
		// Cache breakpoint on the system prompt caches tools + system together
		// (render order is tools → system → messages).
		params.System = []sdk.TextBlockParam{{Text: req.System, CacheControl: sdk.NewCacheControlEphemeralParam()}}
	}
	for _, t := range req.Tools {
		tp, err := toolParam(t)
		if err != nil {
			return params, err
		}
		params.Tools = append(params.Tools, sdk.ToolUnionParam{OfTool: &tp})
	}
	for _, m := range req.Messages {
		mp, err := messageParam(m)
		if err != nil {
			return params, err
		}
		params.Messages = append(params.Messages, mp)
	}
	return params, nil
}

func toolParam(t llm.ToolSpec) (sdk.ToolParam, error) {
	var schema map[string]any
	if err := json.Unmarshal(t.InputSchema, &schema); err != nil {
		return sdk.ToolParam{}, fmt.Errorf("anthropic: tool %q schema: %w", t.Name, err)
	}
	in := sdk.ToolInputSchemaParam{Properties: schema["properties"], ExtraFields: map[string]any{}}
	if req, ok := schema["required"].([]any); ok {
		for _, r := range req {
			if s, ok := r.(string); ok {
				in.Required = append(in.Required, s)
			}
		}
	}
	for k, v := range schema {
		if k != "type" && k != "properties" && k != "required" {
			in.ExtraFields[k] = v
		}
	}
	return sdk.ToolParam{Name: t.Name, Description: sdk.String(t.Description), InputSchema: in}, nil
}

func messageParam(m llm.Message) (sdk.MessageParam, error) {
	var blocks []sdk.ContentBlockParamUnion
	for _, p := range m.Parts {
		switch p.Kind {
		case llm.PartText:
			blocks = append(blocks, sdk.NewTextBlock(p.Text))
		case llm.PartToolCall:
			blocks = append(blocks, sdk.NewToolUseBlock(p.Call.ID, json.RawMessage(p.Call.Input), p.Call.Name))
		case llm.PartToolResult:
			blocks = append(blocks, sdk.NewToolResultBlock(p.Result.CallID, p.Result.Content, p.Result.IsError))
		case llm.PartOpaque:
			if p.Provider != ProviderName {
				continue // another provider's private block: meaningless here
			}
			var b sdk.ContentBlockParamUnion
			if err := json.Unmarshal(p.Opaque, &b); err != nil {
				return sdk.MessageParam{}, fmt.Errorf("anthropic: opaque block: %w", err)
			}
			blocks = append(blocks, b)
		}
	}
	if m.Role == llm.RoleAssistant {
		return sdk.NewAssistantMessage(blocks...), nil
	}
	return sdk.NewUserMessage(blocks...), nil
}

// fromMessage translates a complete SDK message into a neutral response.
func fromMessage(msg sdk.Message) (llm.Response, error) {
	out := llm.Message{Role: llm.RoleAssistant}
	for _, block := range msg.Content {
		switch b := block.AsAny().(type) {
		case sdk.TextBlock:
			out.Parts = append(out.Parts, llm.TextPart(b.Text))
		case sdk.ToolUseBlock:
			out.Parts = append(out.Parts, llm.CallPart(toolCall(b)))
		default:
			// Thinking and any other block types must be passed back exactly as
			// received on the next call; keep them opaque.
			raw, err := json.Marshal(block.ToParam())
			if err != nil {
				return llm.Response{}, fmt.Errorf("anthropic: keep block %q: %w", block.Type, err)
			}
			out.Parts = append(out.Parts, llm.OpaquePart(ProviderName, raw))
		}
	}
	return llm.Response{
		Message: out,
		Stop:    stop(msg.StopReason),
		Usage: llm.Usage{
			InputTokens:      int(msg.Usage.InputTokens),
			OutputTokens:     int(msg.Usage.OutputTokens),
			CacheReadTokens:  int(msg.Usage.CacheReadInputTokens),
			CacheWriteTokens: int(msg.Usage.CacheCreationInputTokens),
		},
	}, nil
}

func toolCall(b sdk.ToolUseBlock) llm.ToolCall {
	return llm.ToolCall{ID: b.ID, Name: b.Name, Input: json.RawMessage(b.Input)}
}

func stop(r sdk.StopReason) llm.Stop {
	switch r {
	case sdk.StopReasonEndTurn, sdk.StopReasonStopSequence:
		return llm.StopEnd
	case sdk.StopReasonToolUse:
		return llm.StopToolUse
	case sdk.StopReasonMaxTokens:
		return llm.StopMaxTokens
	case sdk.StopReasonRefusal:
		return llm.StopRefusal
	default:
		return llm.StopOther
	}
}
