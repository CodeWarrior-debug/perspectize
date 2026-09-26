// Package evals runs Jeeves against the app guide's seed questions and grades
// the answers with deterministic checks: no model grades another model here.
//
// Two contracts with the system prompt make that possible:
//   - answers cite guide entries as [area.task], so we can check grounding;
//   - unsupported features get exactly jeeves.UnsupportedPhrase, so a trap
//     question has a checkable right answer.
package evals

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/CodeWarrior-debug/perspectize/ai-tooling/agent"
	"github.com/CodeWarrior-debug/perspectize/ai-tooling/appguide"
	"github.com/CodeWarrior-debug/perspectize/ai-tooling/jeeves"
	"github.com/CodeWarrior-debug/perspectize/ai-tooling/llm"
)

// Asker is what an eval needs from Jeeves (jeeves.Assistant satisfies it).
type Asker interface {
	Ask(ctx context.Context, question string, onEvent func(llm.Event)) (agent.Result, error)
}

// Case is one seed question from one guide area.
type Case struct {
	Area string
	Seed appguide.Seed
}

// RunResult is one attempt at one case.
type RunResult struct {
	Pass    bool          `json:"pass"`
	Reason  string        `json:"reason,omitempty"`
	Answer  string        `json:"answer"`
	Cited   []string      `json:"cited"`
	Stop    llm.Stop      `json:"stop"`
	Calls   int           `json:"model_calls"`
	Usage   llm.Usage     `json:"usage"`
	Latency time.Duration `json:"latency_ns"`
}

// SeedReport aggregates the runs of one case.
type SeedReport struct {
	Area     string      `json:"area"`
	Question string      `json:"question"`
	Trap     bool        `json:"trap"`
	PassRate float64     `json:"pass_rate"`
	Runs     []RunResult `json:"runs"`
}

// Report is one eval run: one model, every case, N runs each.
type Report struct {
	Model       string        `json:"model"`
	RunsPerSeed int           `json:"runs_per_seed"`
	StartedAt   time.Time     `json:"started_at"`
	PassRate    float64       `json:"pass_rate"`
	ModelCalls  int           `json:"model_calls"`
	Usage       llm.Usage     `json:"usage"`
	AvgLatency  time.Duration `json:"avg_latency_ns"`
	Seeds       []SeedReport  `json:"seeds"`
}

// Citations returns the unique [area.task] IDs in text, in first-seen order.
func Citations(text string) []string { return jeeves.Citations(text) }

// Check grades one answer. A seed with must_not_claim entries is a trap: it
// passes only with the exact unsupported phrase. Any other seed passes when
// the answer cites at least one expected entry. Either way, citing an entry
// that doesn't exist fails (a hallucinated citation is still a hallucination).
func Check(answer string, seed appguide.Seed, known map[string]bool) (bool, string) {
	cited := Citations(answer)
	for _, id := range cited {
		if !known[id] {
			return false, "cites unknown entry " + id
		}
	}
	if len(seed.MustNotClaim) > 0 {
		if !strings.Contains(answer, jeeves.UnsupportedPhrase) {
			return false, "trap: missing unsupported phrase"
		}
		return true, ""
	}
	for _, id := range cited {
		for _, want := range seed.ExpectIDs {
			if id == want {
				return true, ""
			}
		}
	}
	return false, fmt.Sprintf("expected one of %v, cited %v", seed.ExpectIDs, cited)
}

// Cases lists every seed (optionally only one area's) in area order.
func Cases(areas []appguide.Area, seeds map[string][]appguide.Seed, onlyArea string) []Case {
	var cs []Case
	for _, a := range areas {
		if onlyArea != "" && a.Slug != onlyArea {
			continue
		}
		for _, s := range seeds[a.Slug] {
			cs = append(cs, Case{Area: a.Slug, Seed: s})
		}
	}
	return cs
}

// KnownIDs returns every entry ID in the guide.
func KnownIDs(areas []appguide.Area) map[string]bool {
	ids := map[string]bool{}
	for _, a := range areas {
		for _, e := range a.Entries {
			ids[e.ID] = true
		}
	}
	return ids
}

// Run asks every case runs times, sequentially (gentle on rate limits and
// keeps latency numbers honest), and aggregates the results.
func Run(ctx context.Context, a Asker, model string, cases []Case, runs int, known map[string]bool) Report {
	rep := Report{Model: model, RunsPerSeed: runs, StartedAt: time.Now().UTC()}
	var passes, total int
	var latency time.Duration
	for _, c := range cases {
		sr := SeedReport{Area: c.Area, Question: c.Seed.Question, Trap: len(c.Seed.MustNotClaim) > 0}
		seedPasses := 0
		for i := 0; i < runs; i++ {
			start := time.Now()
			res, err := a.Ask(ctx, c.Seed.Question, func(llm.Event) {})
			rr := RunResult{Latency: time.Since(start), Stop: res.Stop, Calls: res.Calls, Usage: res.Usage}
			if err != nil {
				rr.Reason = "error: " + err.Error()
			} else {
				rr.Answer = res.Final.Text()
				rr.Cited = Citations(rr.Answer)
				rr.Pass, rr.Reason = Check(rr.Answer, c.Seed, known)
			}
			if rr.Pass {
				seedPasses++
			}
			rep.ModelCalls += rr.Calls
			rep.Usage = rep.Usage.Add(rr.Usage)
			latency += rr.Latency
			sr.Runs = append(sr.Runs, rr)
		}
		if runs > 0 {
			sr.PassRate = float64(seedPasses) / float64(runs)
		}
		passes += seedPasses
		total += runs
		rep.Seeds = append(rep.Seeds, sr)
	}
	if total > 0 {
		rep.PassRate = float64(passes) / float64(total)
		rep.AvgLatency = latency / time.Duration(total)
	}
	return rep
}
