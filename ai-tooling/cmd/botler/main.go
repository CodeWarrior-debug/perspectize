// Command botler is the developer CLI for Jeeves: inspect and call tools
// without a model, chat through the full agent loop, and run evals.
//
//	botler tools list
//	botler tools call <name> --input '<json>'
//	botler chat [--model M] [--name N] <question...>
//
// chat reads ANTHROPIC_API_KEY from the environment. The model comes from
// --model, then ASSISTANT_MODEL, then defaultModel.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"strings"

	"github.com/CodeWarrior-debug/perspectize/ai-tooling/appguide"
	"github.com/CodeWarrior-debug/perspectize/ai-tooling/jeeves"
	"github.com/CodeWarrior-debug/perspectize/ai-tooling/llm"
	"github.com/CodeWarrior-debug/perspectize/ai-tooling/llm/anthropic"
)

const defaultModel = "claude-opus-5"

const usageText = `usage: botler <command>

  tools list                          list Jeeves's tools
  tools call <name> --input '<json>'  run one tool directly (no model)
  chat [--model M] [--name N] <q...>  ask Jeeves one question (streams)
`

// deps are the side-effecting pieces, swapped out in tests.
type deps struct {
	newProvider func() llm.Provider
	getenv      func(string) string
}

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr, deps{
		newProvider: func() llm.Provider { return anthropic.New() },
		getenv:      os.Getenv,
	}))
}

// run returns the process exit code: 0 ok, 1 runtime failure, 2 bad usage.
func run(args []string, stdout, stderr io.Writer, d deps) int {
	if len(args) == 0 {
		fmt.Fprint(stderr, usageText)
		return 2
	}
	switch args[0] {
	case "tools":
		return runTools(args[1:], stdout, stderr)
	case "chat":
		return runChat(args[1:], stdout, stderr, d)
	default:
		fmt.Fprintf(stderr, "unknown command %q\n\n%s", args[0], usageText)
		return 2
	}
}

// newAssistant builds Jeeves over the embedded guide. provider may be nil
// for commands that never call a model.
func newAssistant(p llm.Provider, model, name string) (*jeeves.Assistant, error) {
	areas, _, err := appguide.Load()
	if err != nil {
		return nil, err
	}
	if p == nil {
		p = noProvider{}
	}
	return jeeves.New(jeeves.Config{Provider: p, Model: model, Areas: areas, Name: name})
}

func runTools(args []string, stdout, stderr io.Writer) int {
	a, err := newAssistant(nil, defaultModel, "")
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	if len(args) == 0 {
		fmt.Fprint(stderr, usageText)
		return 2
	}
	switch args[0] {
	case "list":
		for _, s := range a.Tools().Specs() {
			fmt.Fprintf(stdout, "%s\t%s\n", s.Name, s.Description)
		}
		return 0
	case "call":
		fs := flag.NewFlagSet("tools call", flag.ContinueOnError)
		fs.SetOutput(stderr)
		input := fs.String("input", "{}", "tool input as JSON")
		if len(args) < 2 || strings.HasPrefix(args[1], "-") {
			fmt.Fprintln(stderr, "usage: botler tools call <name> --input '<json>'")
			return 2
		}
		name := args[1]
		if err := fs.Parse(args[2:]); err != nil {
			return 2
		}
		res := a.Tools().Call(context.Background(), llm.ToolCall{ID: "cli", Name: name, Input: json.RawMessage(*input)})
		if res.IsError {
			fmt.Fprintln(stderr, res.Content)
			return 1
		}
		fmt.Fprintln(stdout, res.Content)
		return 0
	default:
		fmt.Fprint(stderr, usageText)
		return 2
	}
}

func runChat(args []string, stdout, stderr io.Writer, d deps) int {
	fs := flag.NewFlagSet("chat", flag.ContinueOnError)
	fs.SetOutput(stderr)
	model := fs.String("model", "", "model ID (default: $ASSISTANT_MODEL or "+defaultModel+")")
	name := fs.String("name", "", "assistant display name (default: "+jeeves.DefaultName+")")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	question := strings.TrimSpace(strings.Join(fs.Args(), " "))
	if question == "" {
		fmt.Fprintln(stderr, "usage: botler chat [--model M] [--name N] <question...>")
		return 2
	}
	m := *model
	if m == "" {
		m = d.getenv("ASSISTANT_MODEL")
	}
	if m == "" {
		m = defaultModel
	}

	a, err := newAssistant(d.newProvider(), m, *name)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}

	// Ctrl-C cancels the context, which aborts the upstream model call.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	res, err := a.Ask(ctx, question, func(e llm.Event) {
		switch e.Kind {
		case llm.EventTextDelta:
			fmt.Fprint(stdout, e.Text)
		case llm.EventToolCall:
			fmt.Fprintf(stderr, "→ %s %s\n", e.Call.Name, e.Call.Input)
		}
	})
	fmt.Fprintln(stdout)
	if err != nil {
		fmt.Fprintf(stderr, "error: %v\n", err)
		return 1
	}
	u := res.Usage
	fmt.Fprintf(stderr, "[model=%s stop=%s calls=%d in=%d out=%d cache_read=%d cache_write=%d]\n",
		m, res.Stop, res.Calls, u.InputTokens, u.OutputTokens, u.CacheReadTokens, u.CacheWriteTokens)
	return 0
}

// noProvider backs commands that must never reach a model.
type noProvider struct{}

func (noProvider) Stream(context.Context, llm.Request, func(llm.Event)) (llm.Response, error) {
	return llm.Response{}, errors.New("botler: this command does not call a model")
}
