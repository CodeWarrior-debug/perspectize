package agent

import (
	"context"
	"errors"
	"sync"

	"github.com/CodeWarrior-debug/perspectize/ai-tooling/llm"
)

// DefaultMaxRounds caps tool rounds per question. Each round is another full
// model call, so this bounds both latency and cost of a runaway loop.
const DefaultMaxRounds = 6

// ErrRoundCap means the model still wanted tools after MaxRounds rounds.
var ErrRoundCap = errors.New("agent: tool round cap reached")

// Loop is the tool-use loop. It owns no conversation state: history goes in
// with the request and comes back in the Result.
type Loop struct {
	Provider  llm.Provider
	Tools     *Registry
	MaxRounds int // 0 means DefaultMaxRounds
}

// Result is what one Run produced.
type Result struct {
	Messages []llm.Message // full history including this run's turns
	Final    llm.Message   // the last assistant message
	Stop     llm.Stop
	Usage    llm.Usage // summed across every model call
	Calls    int       // model calls made (tool rounds + 1 when it finishes)
}

// Run sends req to the model and executes requested tools until the model
// stops asking for them. The model never runs anything: it asks, and this
// code decides and executes. On error, Result holds whatever was completed.
func (l *Loop) Run(ctx context.Context, req llm.Request, onEvent func(llm.Event)) (Result, error) {
	maxRounds := l.MaxRounds
	if maxRounds == 0 {
		maxRounds = DefaultMaxRounds
	}
	req.Tools = l.Tools.Specs()
	res := Result{Messages: append([]llm.Message(nil), req.Messages...)}

	for rounds := 0; ; rounds++ {
		req.Messages = res.Messages
		resp, err := l.Provider.Stream(ctx, req, onEvent)
		if err != nil {
			return res, err
		}
		res.Calls++
		res.Usage = res.Usage.Add(resp.Usage)
		res.Messages = append(res.Messages, resp.Message)
		res.Final, res.Stop = resp.Message, resp.Stop

		calls := resp.Message.ToolCalls()
		if resp.Stop != llm.StopToolUse || len(calls) == 0 {
			return res, nil
		}
		if rounds == maxRounds {
			return res, ErrRoundCap
		}

		results := l.runTools(ctx, calls)
		if err := ctx.Err(); err != nil {
			return res, err
		}
		// All results go back in ONE user message: splitting them teaches the
		// model to stop making parallel calls.
		parts := make([]llm.Part, len(results))
		for i, r := range results {
			parts[i] = llm.ResultPart(r)
		}
		res.Messages = append(res.Messages, llm.Message{Role: llm.RoleUser, Parts: parts})
	}
}

// runTools executes calls concurrently and returns results in call order.
func (l *Loop) runTools(ctx context.Context, calls []llm.ToolCall) []llm.ToolResult {
	results := make([]llm.ToolResult, len(calls))
	var wg sync.WaitGroup
	for i, c := range calls {
		wg.Add(1)
		go func() {
			defer wg.Done()
			results[i] = l.Tools.Call(ctx, c)
		}()
	}
	wg.Wait()
	return results
}
