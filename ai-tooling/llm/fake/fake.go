// Package fake is a scripted llm.Provider for tests: deterministic, instant,
// and free. CI never calls a real model API.
package fake

import (
	"context"
	"errors"
	"strings"
	"sync"

	"github.com/CodeWarrior-debug/perspectize/ai-tooling/llm"
)

// ErrNoMoreTurns is returned when Stream is called more times than scripted.
var ErrNoMoreTurns = errors.New("fake: no more scripted turns")

// Turn scripts one model call.
type Turn struct {
	Text  []string // text deltas, emitted in order
	Calls []llm.ToolCall
	Stop  llm.Stop
	Usage llm.Usage
	Err   error // if set, Stream returns it before emitting anything
}

// Provider replays Turns in order and records every Request it receives.
type Provider struct {
	Turns []Turn

	mu       sync.Mutex
	next     int
	requests []llm.Request
}

var _ llm.Provider = (*Provider)(nil)

// Requests returns the requests received so far, in order.
func (p *Provider) Requests() []llm.Request {
	p.mu.Lock()
	defer p.mu.Unlock()
	return append([]llm.Request(nil), p.requests...)
}

// Stream implements llm.Provider.
func (p *Provider) Stream(ctx context.Context, req llm.Request, onEvent func(llm.Event)) (llm.Response, error) {
	p.mu.Lock()
	// Copy the history: callers append to their slice after this returns.
	req.Messages = append([]llm.Message(nil), req.Messages...)
	p.requests = append(p.requests, req)
	if p.next >= len(p.Turns) {
		p.mu.Unlock()
		return llm.Response{}, ErrNoMoreTurns
	}
	turn := p.Turns[p.next]
	p.next++
	p.mu.Unlock()

	if turn.Err != nil {
		return llm.Response{}, turn.Err
	}
	if err := ctx.Err(); err != nil {
		return llm.Response{}, err
	}

	onEvent(llm.Event{Kind: llm.EventStart})
	msg := llm.Message{Role: llm.RoleAssistant}
	if len(turn.Text) > 0 {
		for _, d := range turn.Text {
			if err := ctx.Err(); err != nil {
				return llm.Response{}, err
			}
			onEvent(llm.Event{Kind: llm.EventTextDelta, Text: d})
		}
		if err := ctx.Err(); err != nil {
			return llm.Response{}, err
		}
		msg.Parts = append(msg.Parts, llm.TextPart(strings.Join(turn.Text, "")))
	}
	for _, c := range turn.Calls {
		onEvent(llm.Event{Kind: llm.EventToolCall, Call: c})
		msg.Parts = append(msg.Parts, llm.CallPart(c))
	}
	onEvent(llm.Event{Kind: llm.EventDone, Stop: turn.Stop, Usage: turn.Usage})
	return llm.Response{Message: msg, Stop: turn.Stop, Usage: turn.Usage}, nil
}
