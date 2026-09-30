package evals

import (
	"context"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/ai-tooling/agent"
	"github.com/CodeWarrior-debug/perspectize/ai-tooling/appguide"
	"github.com/CodeWarrior-debug/perspectize/ai-tooling/jeeves"
	"github.com/CodeWarrior-debug/perspectize/ai-tooling/llm"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var known = map[string]bool{"compare.pick-two": true, "compare.swap-sides": true}

func TestCheck(t *testing.T) {
	normal := appguide.Seed{Question: "q", ExpectIDs: []string{"compare.pick-two"}}
	trap := appguide.Seed{Question: "q", MustNotClaim: []string{"three at once"}}

	tests := []struct {
		name   string
		answer string
		seed   appguide.Seed
		pass   bool
		reason string
	}{
		{"cites expected", "Open **Compare** [compare.pick-two].", normal, true, ""},
		{"cites wrong entry", "Use [compare.swap-sides].", normal, false, "expected one of"},
		{"no citation", "Open Compare.", normal, false, "expected one of"},
		{"unknown citation", "See [compare.pick-two] and [compare.made-up].", normal, false, "unknown entry compare.made-up"},
		{"trap refused", "Perspectize doesn't support that. You can compare two.", trap, true, ""},
		{"trap hallucinated", "Sure, pick three perspectives.", trap, false, "missing unsupported phrase"},
		{"trap refused but unknown cite", "Perspectize doesn't support that. [compare.nope]", trap, false, "unknown entry"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pass, reason := Check(tt.answer, tt.seed, known)
			assert.Equal(t, tt.pass, pass, reason)
			assert.Contains(t, reason, tt.reason)
		})
	}
}

func TestCitations(t *testing.T) {
	assert.Equal(t, []string{"a.b", "c.d-e"}, Citations("x [a.b] y [c.d-e] z [a.b] [Not.An.ID] [nope]"))
}

// scripted answers questions in order, cycling.
type scripted struct {
	answers []string
	i       int
}

func (s *scripted) Ask(_ context.Context, _ string, _ func(llm.Event)) (agent.Result, error) {
	a := s.answers[s.i%len(s.answers)]
	s.i++
	return agent.Result{
		Final: llm.Message{Role: llm.RoleAssistant, Parts: []llm.Part{llm.TextPart(a)}},
		Stop:  llm.StopEnd, Usage: llm.Usage{InputTokens: 100, OutputTokens: 10}, Calls: 2,
	}, nil
}

func TestRun_PassRateAndTotals(t *testing.T) {
	cases := []Case{
		{Area: "compare", Seed: appguide.Seed{Question: "normal", ExpectIDs: []string{"compare.pick-two"}}},
		{Area: "compare", Seed: appguide.Seed{Question: "trap", MustNotClaim: []string{"x"}}},
	}
	// Runs are grouped per seed: normal×3 then trap×3.
	s := &scripted{answers: []string{
		"[compare.pick-two]", "[compare.pick-two]", "nope",
		jeeves.UnsupportedPhrase, jeeves.UnsupportedPhrase, jeeves.UnsupportedPhrase,
	}}
	rep := Run(context.Background(), s, "m", cases, 3, known)

	require.Len(t, rep.Seeds, 2)
	assert.InDelta(t, 2.0/3.0, rep.Seeds[0].PassRate, 1e-9)
	assert.False(t, rep.Seeds[0].Trap)
	assert.InDelta(t, 1.0, rep.Seeds[1].PassRate, 1e-9)
	assert.True(t, rep.Seeds[1].Trap)
	assert.InDelta(t, 5.0/6.0, rep.PassRate, 1e-9)
	assert.Equal(t, 600, rep.Usage.InputTokens)
	assert.Equal(t, 60, rep.Usage.OutputTokens)
	assert.Equal(t, 12, rep.ModelCalls)
	assert.Equal(t, "m", rep.Model)
	assert.Equal(t, 3, rep.RunsPerSeed)
}

type failing struct{}

func (failing) Ask(context.Context, string, func(llm.Event)) (agent.Result, error) {
	return agent.Result{}, assert.AnError
}

func TestRun_ErrorsCountAsFailures(t *testing.T) {
	cases := []Case{{Area: "compare", Seed: appguide.Seed{Question: "q", ExpectIDs: []string{"compare.pick-two"}}}}
	rep := Run(context.Background(), failing{}, "m", cases, 2, known)
	assert.Equal(t, 0.0, rep.PassRate)
	assert.Contains(t, rep.Seeds[0].Runs[0].Reason, "error")
}

func TestCases_FromLoad(t *testing.T) {
	areas := []appguide.Area{{Slug: "compare"}, {Slug: "settings"}}
	seeds := map[string][]appguide.Seed{
		"compare":  {{Question: "a"}, {Question: "b"}},
		"settings": {{Question: "c"}},
	}
	assert.Len(t, Cases(areas, seeds, ""), 3)
	only := Cases(areas, seeds, "compare")
	require.Len(t, only, 2)
	assert.Equal(t, "compare", only[0].Area)
}
