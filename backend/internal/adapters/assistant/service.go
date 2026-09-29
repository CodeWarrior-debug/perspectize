// Package assistant adapts the ai-tooling Jeeves assistant to the backend's
// AssistantService port: validation, per-user limits, stream shaping (text
// batching, a single terminal event), and usage logging.
//
// This adapter lives under backend/internal because later tools will call
// backend services in-process; Go's internal/ rule means only backend code
// may do that.
package assistant

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/CodeWarrior-debug/perspectize/ai-tooling/agent"
	"github.com/CodeWarrior-debug/perspectize/ai-tooling/appguide"
	"github.com/CodeWarrior-debug/perspectize/ai-tooling/jeeves"
	"github.com/CodeWarrior-debug/perspectize/ai-tooling/llm"
	"github.com/CodeWarrior-debug/perspectize/ai-tooling/llm/anthropic"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// Asker is what the adapter needs from Jeeves; *jeeves.Assistant satisfies it.
type Asker interface {
	Ask(ctx context.Context, question string, onEvent func(llm.Event)) (agent.Result, error)
}

// Limiter is a per-key rate limiter (services.SlidingWindowLimiter fits).
type Limiter interface {
	Allow(key string) bool
}

const (
	// DefaultFlushEvery batches text deltas so the client gets smooth updates
	// without one WebSocket frame per token.
	DefaultFlushEvery = 50 * time.Millisecond
	maxPageBytes      = 64
	eventBuffer       = 16
	userSafeError     = "Jeeves couldn't answer right now. Please try again in a moment."
)

// Service implements portservices.AssistantService.
type Service struct {
	asker      Asker
	limiter    Limiter
	flushEvery time.Duration
	model      string

	mu       sync.Mutex
	inflight map[int]bool
}

var _ portservices.AssistantService = (*Service)(nil)

// Option configures a Service.
type Option func(*Service)

// WithLimiter sets the per-user rate limiter (required in production).
func WithLimiter(l Limiter) Option { return func(s *Service) { s.limiter = l } }

// WithFlushEvery sets the text batching interval (0 flushes every delta).
func WithFlushEvery(d time.Duration) Option { return func(s *Service) { s.flushEvery = d } }

// WithModel records the model name in usage logs.
func WithModel(m string) Option { return func(s *Service) { s.model = m } }

// New builds the service around a Jeeves asker.
func New(a Asker, opts ...Option) *Service {
	s := &Service{asker: a, flushEvery: DefaultFlushEvery, inflight: map[int]bool{}}
	for _, o := range opts {
		o(s)
	}
	return s
}

// Ask implements portservices.AssistantService. A nil *Service means the
// assistant is disabled on this server.
func (s *Service) Ask(ctx context.Context, userID int, message, page string) (<-chan domain.AssistantEvent, error) {
	if s == nil {
		return nil, domain.ErrAssistantDisabled
	}
	if userID <= 0 {
		return nil, domain.ErrForbidden
	}
	message = strings.TrimSpace(message)
	switch {
	case message == "":
		return nil, fmt.Errorf("%w: message is empty", domain.ErrInvalidInput)
	case len(message) > domain.AssistantMaxMessageBytes:
		return nil, fmt.Errorf("%w: message is longer than %d bytes", domain.ErrInvalidInput, domain.AssistantMaxMessageBytes)
	case len(page) > maxPageBytes:
		return nil, fmt.Errorf("%w: page is too long", domain.ErrInvalidInput)
	}
	if s.limiter != nil && !s.limiter.Allow(fmt.Sprintf("assistant:%d", userID)) {
		return nil, domain.ErrRateLimited
	}
	if !s.acquire(userID) {
		return nil, domain.ErrAssistantBusy
	}

	out := make(chan domain.AssistantEvent, eventBuffer)
	go s.run(ctx, userID, message, out)
	return out, nil
}

func (s *Service) acquire(userID int) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.inflight[userID] {
		return false
	}
	s.inflight[userID] = true
	return true
}

func (s *Service) release(userID int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.inflight, userID)
}

// run drives one reply. It always closes out and releases the user's slot.
// Page is accepted for the upcoming per-page tool sets; the tracer uses the
// same tools on every page.
func (s *Service) run(ctx context.Context, userID int, message string, out chan<- domain.AssistantEvent) {
	defer close(out)
	defer s.release(userID)

	send := func(e domain.AssistantEvent) bool {
		select {
		case out <- e:
			return true
		case <-ctx.Done():
			return false
		}
	}

	var buf strings.Builder
	lastFlush := time.Now()
	flush := func() {
		if buf.Len() > 0 {
			send(domain.AssistantEvent{Kind: domain.AssistantEventText, Text: buf.String()})
			buf.Reset()
		}
		lastFlush = time.Now()
	}

	start := time.Now()
	res, err := s.asker.Ask(ctx, message, func(e llm.Event) {
		switch e.Kind {
		case llm.EventTextDelta:
			buf.WriteString(e.Text)
			if time.Since(lastFlush) >= s.flushEvery {
				flush()
			}
		case llm.EventToolCall:
			flush()
			send(domain.AssistantEvent{Kind: domain.AssistantEventTool, ToolName: e.Call.Name})
		}
	})
	flush()

	// Log usage even when the client has gone (Stop): the tokens were spent.
	logCtx := context.WithoutCancel(ctx)
	attrs := []any{
		"user_id", userID, "model", s.model, "stop", res.Stop, "model_calls", res.Calls,
		"input_tokens", res.Usage.InputTokens, "output_tokens", res.Usage.OutputTokens,
		"cache_read_tokens", res.Usage.CacheReadTokens, "latency_ms", time.Since(start).Milliseconds(),
	}

	if err != nil {
		if errors.Is(err, context.Canceled) || ctx.Err() != nil {
			slog.InfoContext(logCtx, "assistant reply cancelled", attrs...)
			return
		}
		slog.ErrorContext(logCtx, "assistant reply failed", append(attrs, "error", err)...)
		send(domain.AssistantEvent{Kind: domain.AssistantEventError, Message: userSafeError})
		return
	}

	slog.InfoContext(logCtx, "assistant reply", attrs...)
	send(domain.AssistantEvent{
		Kind:         domain.AssistantEventDone,
		Stop:         string(res.Stop),
		Citations:    jeeves.Citations(res.Final.Text()),
		InputTokens:  res.Usage.InputTokens,
		OutputTokens: res.Usage.OutputTokens,
	})
}

// DefaultRateLimit is how many replies one user may start per DefaultRateWindow.
const (
	DefaultRateLimit  = 20
	DefaultRateWindow = time.Hour
)

// NewJeeves builds the production service: Jeeves over the embedded app
// guide, backed by the Anthropic provider (which reads ANTHROPIC_API_KEY
// from the environment), with the given per-user limiter.
func NewJeeves(model string, limiter Limiter) (*Service, error) {
	areas, _, err := appguide.Load()
	if err != nil {
		return nil, fmt.Errorf("assistant: load app guide: %w", err)
	}
	j, err := jeeves.New(jeeves.Config{Provider: anthropic.New(), Model: model, Areas: areas})
	if err != nil {
		return nil, fmt.Errorf("assistant: %w", err)
	}
	return New(j, WithLimiter(limiter), WithModel(model)), nil
}
