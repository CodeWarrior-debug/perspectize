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
	"path/filepath"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/CodeWarrior-debug/perspectize/ai-tooling/appguide"
	"github.com/CodeWarrior-debug/perspectize/ai-tooling/evals"
	"github.com/CodeWarrior-debug/perspectize/ai-tooling/jeeves"
	"github.com/CodeWarrior-debug/perspectize/ai-tooling/llm"
	"github.com/CodeWarrior-debug/perspectize/ai-tooling/llm/anthropic"
)

const defaultModel = "claude-opus-5"

const usageText = `usage: botler <command>

  tools list                          list Jeeves's tools
  tools call <name> --input '<json>'  run one tool directly (no model)
  chat [--model M] [--name N] <q...>  ask Jeeves one question (streams)
  eval [--model M] [--area A] [--runs N] [--out DIR]
                                      run guide seed questions, grade them,
                                      print a report, save JSON to DIR
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
	case "eval":
		return runEval(args[1:], stdout, stderr, d)
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
	m := resolveModel(*model, d)

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

// resolveModel applies the precedence --model, $ASSISTANT_MODEL, default.
func resolveModel(flagValue string, d deps) string {
	if flagValue != "" {
		return flagValue
	}
	if env := d.getenv("ASSISTANT_MODEL"); env != "" {
		return env
	}
	return defaultModel
}

func runEval(args []string, stdout, stderr io.Writer, d deps) int {
	fs := flag.NewFlagSet("eval", flag.ContinueOnError)
	fs.SetOutput(stderr)
	model := fs.String("model", "", "model ID (default: $ASSISTANT_MODEL or "+defaultModel+")")
	area := fs.String("area", "", "only this guide area (default: all)")
	runs := fs.Int("runs", 3, "runs per seed question")
	out := fs.String("out", filepath.Join("evals", "results"), "directory for the JSON report")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if *runs < 1 {
		fmt.Fprintln(stderr, "--runs must be at least 1")
		return 2
	}
	m := resolveModel(*model, d)

	areas, seeds, err := appguide.Load()
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	cases := evals.Cases(areas, seeds, *area)
	if len(cases) == 0 {
		fmt.Fprintf(stderr, "no seed questions found (area %q)\n", *area)
		return 1
	}
	a, err := jeeves.New(jeeves.Config{Provider: d.newProvider(), Model: m, Areas: areas})
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	fmt.Fprintf(stderr, "evaluating %d questions × %d runs on %s…\n", len(cases), *runs, m)
	rep := evals.Run(ctx, a, m, cases, *runs, evals.KnownIDs(areas))

	printReport(stdout, rep)
	path, err := saveReport(*out, rep)
	if err != nil {
		fmt.Fprintf(stderr, "could not save report: %v\n", err)
		return 1
	}
	fmt.Fprintf(stderr, "saved %s\n", path)
	return 0
}

func printReport(w io.Writer, rep evals.Report) {
	tw := tabwriter.NewWriter(w, 0, 0, 2, ' ', 0)
	fmt.Fprintln(tw, "PASS\tTRAP\tAVG IN\tAVG OUT\tAVG LATENCY\tQUESTION")
	for _, s := range rep.Seeds {
		var in, outTok int
		var lat time.Duration
		passes := 0
		for _, r := range s.Runs {
			in += r.Usage.InputTokens
			outTok += r.Usage.OutputTokens
			lat += r.Latency
			if r.Pass {
				passes++
			}
		}
		n := len(s.Runs)
		trap := ""
		if s.Trap {
			trap = "yes"
		}
		fmt.Fprintf(tw, "%d/%d\t%s\t%d\t%d\t%s\t%s\n", passes, n, trap, in/n, outTok/n,
			(lat / time.Duration(n)).Round(time.Millisecond), truncate(s.Question, 60))
	}
	tw.Flush()
	fmt.Fprintf(w, "\nmodel %s — pass rate %.0f%% — %d model calls — tokens in %d / out %d (cache read %d) — avg latency %s\n",
		rep.Model, rep.PassRate*100, rep.ModelCalls, rep.Usage.InputTokens, rep.Usage.OutputTokens,
		rep.Usage.CacheReadTokens, rep.AvgLatency.Round(time.Millisecond))
	for _, s := range rep.Seeds {
		for _, r := range s.Runs {
			if !r.Pass {
				fmt.Fprintf(w, "FAIL %q: %s\n", truncate(s.Question, 50), r.Reason)
			}
		}
	}
}

func saveReport(dir string, rep evals.Report) (string, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	safeModel := strings.NewReplacer("/", "_", ":", "_").Replace(rep.Model)
	path := filepath.Join(dir, rep.StartedAt.Format("20060102T150405Z")+"-"+safeModel+".json")
	data, err := json.MarshalIndent(rep, "", "  ")
	if err != nil {
		return "", err
	}
	return path, os.WriteFile(path, data, 0o644)
}

func truncate(s string, n int) string {
	if len([]rune(s)) <= n {
		return s
	}
	return string([]rune(s)[:n-1]) + "…"
}
