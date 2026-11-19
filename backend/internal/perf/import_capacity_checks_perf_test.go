package perf

// Pure logic for the import capacity harness (.docs/CAPACITY_TESTING.md): the
// max-finder that applies the three checks, the half-of-max rule, the guard that
// keeps write load off the shared Neon database, and the markdown table row. No
// database and no network here; the DB-backed ramp that produces stepResult
// values lives elsewhere in this package.
//
// This file has no `perf` build tag on purpose: `go test ./...` runs the
// max-finder and the Neon guard, which is the only safety check between the
// write-heavy harness and the shared database, so it must not be skipped. The
// DB-backed ramp (import_capacity_perf_test.go) stays behind the `perf` tag.

import (
	"errors"
	"fmt"
	"net/url"
	"slices"
	"strings"
	"testing"
	"time"
	"unicode/utf8"
)

// stepResult is what one step of the ramp measured, at one concurrency setting.
type stepResult struct {
	Concurrency   int
	ItemsPerSec   float64
	ItemP50       time.Duration
	ItemP95       time.Duration
	CPUSecPerItem float64
	PeakRSSBytes  uint64
	Goroutines    int
	PoolInUse     int
	PoolWaitDelta int64
	ProbeP95      time.Duration
	ProbeErrors   int
	Errors        int
	FirstError    string
}

// The thresholds are starting points (CAPACITY_TESTING.md, "What max means"); a
// feature that needs different ones changes them here and says so in its
// register row.
const (
	minThroughputGain = 1.10 // check 1: a step must add at least 10% items/s
	maxProbeSlowdown  = 2    // check 2: probe p95 may be at most 2x its idle baseline
)

// findMax applies the three checks to steps, which are in ramp order, and
// returns the concurrency of the last step before the first one that fails
// (0 if the first step fails). failedChecks names every check that tripped at
// that first failing step, from "throughput", "probe" and "errors" (the last
// covers both request errors and DB pool waiting), in that order. When every
// step passes it returns the last step's concurrency and no failed checks: the
// ramp did not reach the limit and the caller should extend it.
func findMax(steps []stepResult, probeBaseline time.Duration) (maxConcurrency int, failedChecks []string) {
	for i := range steps {
		failed := stepFailures(steps, i, probeBaseline)
		if len(failed) == 0 {
			continue
		}
		if i == 0 {
			return 0, failed
		}
		return steps[i-1].Concurrency, failed
	}
	if len(steps) == 0 {
		return 0, nil
	}
	return steps[len(steps)-1].Concurrency, nil
}

// stepFailures names the checks step i trips, from "throughput", "probe" and
// "errors" (the last covers both request errors and DB pool waiting), in that
// order. Throughput is judged against the step before it; the first step has
// nothing to grow from and is not judged on it. Empty when the step passes.
// findMax and rampStatusAfter both judge every step through this one function,
// so they cannot disagree about what failing means.
func stepFailures(steps []stepResult, i int, probeBaseline time.Duration) []string {
	s := steps[i]
	var failed []string
	if i > 0 && !grewEnough(steps[i-1].ItemsPerSec, s.ItemsPerSec) {
		failed = append(failed, "throughput")
	}
	if s.ProbeP95 > maxProbeSlowdown*probeBaseline || s.ProbeErrors != 0 {
		failed = append(failed, "probe")
	}
	if s.Errors != 0 || s.PoolWaitDelta != 0 {
		failed = append(failed, "errors")
	}
	return failed
}

// firstFailure is the index of the first step that trips a check, or -1.
func firstFailure(steps []stepResult, probeBaseline time.Duration) int {
	for i := range steps {
		if len(stepFailures(steps, i, probeBaseline)) > 0 {
			return i
		}
	}
	return -1
}

// rampStatus says what a ramp should do after the steps run so far, and, once it
// is done, how far to trust the max it found.
type rampStatus int

const (
	rampRunOn         rampStatus = iota // run the next ramp value (possibly the confirm step)
	rampFloor                           // done: nothing failed through the last ramp value, so max is only a floor
	rampConfirmed                       // done: the first failing step was followed by one more step that also failed
	rampUnconfirmed                     // done: that one more step passed, so the first failure may be noise
	rampNoConfirmStep                   // done: the first failure was at the last ramp value, so no step is left to confirm it
)

func (s rampStatus) String() string {
	names := [...]string{"run on", "floor", "confirmed", "unconfirmed", "no confirm step"}
	if int(s) < 0 || int(s) >= len(names) {
		return fmt.Sprintf("rampStatus(%d)", int(s))
	}
	return names[s]
}

// rampStatusAfter implements the procedure's "ramp until a check fails, and run
// one step past it to confirm" (CAPACITY_TESTING.md, Procedure step 3). steps are
// the steps run so far, in ramp order; moreSteps says whether the ramp has
// another value within its limit. Exactly one step is run past the first failure:
// that step is judged the way findMax judges every step (against the step before
// it, which is the failed one), and fails or passes the confirmation. The max
// itself is still findMax's: the last step that passed before the first failure.
func rampStatusAfter(steps []stepResult, probeBaseline time.Duration, moreSteps bool) rampStatus {
	first := firstFailure(steps, probeBaseline)
	switch {
	case first < 0 && moreSteps:
		return rampRunOn
	case first < 0:
		return rampFloor
	case first == len(steps)-1 && moreSteps:
		return rampRunOn // the confirm step
	case first == len(steps)-1:
		return rampNoConfirmStep
	case len(stepFailures(steps, first+1, probeBaseline)) > 0:
		return rampConfirmed
	default:
		return rampUnconfirmed
	}
}

// verdictLine is the sentence printed under a finished ramp about how far to
// trust its max. maxConcurrency is findMax's value, firstFail the concurrency of
// the first failing step (0 when none failed), maxConc the ramp's limit, and
// confirmFailed the checks the confirm step tripped.
func verdictLine(status rampStatus, maxConcurrency, firstFail, maxConc int, confirmFailed []string) string {
	switch status {
	case rampFloor:
		return fmt.Sprintf("No check failed up to PERF_MAX_CONC=%d, so this is a floor, not a limit: raise PERF_MAX_CONC and run again before trusting it.", maxConc)
	case rampConfirmed:
		return fmt.Sprintf("Confirmed: the next step also failed (%s).", strings.Join(confirmFailed, ", "))
	case rampUnconfirmed:
		if maxConcurrency == 0 {
			return "UNCONFIRMED: the first failure may be noise; re-run before trusting max (the first step itself failed, so there is nothing below it to bisect)."
		}
		return fmt.Sprintf("UNCONFIRMED: the first failure may be noise; re-run or bisect between %d and %d before trusting max.", maxConcurrency, firstFail)
	case rampNoConfirmStep:
		return fmt.Sprintf("Not confirmed: the first failure was at the last ramp value (PERF_MAX_CONC=%d), so there is no step left to confirm it; raise PERF_MAX_CONC or re-run before trusting max.", maxConc)
	default:
		return ""
	}
}

// grewEnough reports whether cur is at least minThroughputGain times prev. It
// divides rather than multiplying prev by 1.10 because that product rounds just
// above the exact boundary (100 * 1.10 is 110.00000000000001), which would fail
// a step that gained exactly 10%. A prev of 0 passes any positive cur and fails
// 0 (no growth).
func grewEnough(prev, cur float64) bool {
	return cur/prev >= minThroughputGain
}

// halfOf is the shipped default for a measured max: half of it, at least 1.
func halfOf(maxConcurrency int) int {
	return max(1, maxConcurrency/2)
}

// refuseIfNeon returns an error when dsn points at the shared Neon database, or
// when it cannot tell where dsn points (when unsure, refuse): the harness
// inserts rows. Only the host is compared, so a local database or user that
// happens to be called neon is fine. The error never contains any part of the
// DSN, and url.Parse's own error is dropped for that reason (it quotes the
// whole input, password included).
func refuseIfNeon(dsn string) error {
	hosts, ok := dsnHosts(dsn)
	if !ok || len(hosts) == 0 {
		return errors.New("refusing to run: cannot tell which database host the connection string points at, " +
			"and this harness writes rows so it must not run against the shared Neon database; " +
			"name the host explicitly, for example postgres://localhost:5432/db or host=localhost")
	}
	for _, host := range hosts {
		if strings.Contains(strings.ToLower(host), "neon") {
			return errors.New("refusing to run: this harness writes rows and must not run against " +
				"the shared Neon database; point DATABASE_URL at a throwaway local Postgres")
		}
	}
	return nil
}

// dsnHosts returns the non-empty host values a Postgres connection string names.
// ok is false when the string cannot be parsed.
func dsnHosts(dsn string) (hosts []string, ok bool) {
	dsn = strings.TrimSpace(dsn)
	if lower := strings.ToLower(dsn); strings.HasPrefix(lower, "postgres://") || strings.HasPrefix(lower, "postgresql://") {
		return urlHosts(dsn)
	}
	return keyValueHosts(dsn)
}

// urlHosts reads the host from the authority and any ?host= query parameter
// (which is how a URL names a unix-socket directory, and which overrides the
// authority).
func urlHosts(dsn string) ([]string, bool) {
	u, err := url.Parse(dsn)
	if err != nil {
		return nil, false
	}
	query, err := url.ParseQuery(u.RawQuery)
	if err != nil {
		return nil, false
	}
	var hosts []string
	for _, host := range append([]string{u.Hostname()}, query["host"]...) {
		if host != "" {
			hosts = append(hosts, host)
		}
	}
	return hosts, true
}

const dsnSpace = " \t\n\r"

// keyValueHosts reads every host=... setting from a libpq "key=value key=value"
// string, honouring single-quoted values (which may contain spaces and other
// keys' names) and spaces around the "=".
func keyValueHosts(dsn string) ([]string, bool) {
	var hosts []string
	rest := dsn
	for {
		rest = strings.TrimLeft(rest, dsnSpace)
		if rest == "" {
			return hosts, true
		}
		eq := strings.IndexByte(rest, '=')
		if eq < 0 {
			return nil, false
		}
		key := strings.TrimRight(rest[:eq], dsnSpace)
		if key == "" || strings.ContainsAny(key, dsnSpace) {
			return nil, false
		}
		value, remaining, ok := readDSNValue(strings.TrimLeft(rest[eq+1:], dsnSpace))
		if !ok {
			return nil, false
		}
		rest = remaining
		if strings.EqualFold(key, "host") && value != "" {
			hosts = append(hosts, value)
		}
	}
}

// readDSNValue reads one value off the front of s: either 'single quoted' or
// bare up to the next whitespace, with a backslash escaping the next character.
// It returns the value and what follows it; ok is false for an unterminated quote.
func readDSNValue(s string) (value, rest string, ok bool) {
	quoted := strings.HasPrefix(s, "'")
	if quoted {
		s = s[1:]
	}
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		switch c := s[i]; {
		case c == '\\' && i+1 < len(s):
			i++
			b.WriteByte(s[i])
		case quoted && c == '\'':
			return b.String(), s[i+1:], true
		case !quoted && strings.IndexByte(dsnSpace, c) >= 0:
			return b.String(), s[i:], true
		default:
			b.WriteByte(c)
		}
	}
	return b.String(), "", !quoted
}

// stepTableHeader is the markdown header (titles, then the separator row) for
// the rows markdownRow prints; the columns match one for one.
const stepTableHeader = "| Concurrency | Items/s | Item p50 (ms) | Item p95 (ms) | CPU s/item | Peak RSS (MiB) | Goroutines | Pool in use | Pool wait delta | Probe p95 (ms) | Probe errors | Errors | First error |\n" +
	"| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"

// firstErrorMaxChars caps the first-error cell so one long message cannot
// blow up the table.
const firstErrorMaxChars = 60

// markdownRow prints the step as one pipe-delimited row under stepTableHeader.
// The first-error cell is empty when there was no error; otherwise the message
// is flattened onto one line, its pipes replaced, and cut to firstErrorMaxChars.
func (s stepResult) markdownRow() string {
	return fmt.Sprintf("| %d | %.1f | %.1f | %.1f | %.4f | %.1f | %d | %d | %d | %.1f | %d | %d | %s |",
		s.Concurrency, s.ItemsPerSec, ms(s.ItemP50), ms(s.ItemP95), s.CPUSecPerItem,
		float64(s.PeakRSSBytes)/(1<<20), s.Goroutines, s.PoolInUse, s.PoolWaitDelta,
		ms(s.ProbeP95), s.ProbeErrors, s.Errors, errorCell(s.FirstError))
}

// ms is a duration in milliseconds, for the table cells. It lives here, in the
// untagged file, so this file compiles with and without the `perf` tag; the
// tagged harness files use it too.
func ms(d time.Duration) float64 { return float64(d.Microseconds()) / 1000 }

func errorCell(message string) string {
	message = strings.ReplaceAll(strings.Join(strings.Fields(message), " "), "|", "/")
	if runes := []rune(message); len(runes) > firstErrorMaxChars {
		message = string(runes[:firstErrorMaxChars-len("...")]) + "..."
	}
	return message
}

const testProbeBaseline = 100 * time.Millisecond

// healthyStep passes checks 2 and 3 at any throughput.
func healthyStep(concurrency int, itemsPerSec float64) stepResult {
	return stepResult{Concurrency: concurrency, ItemsPerSec: itemsPerSec, ProbeP95: testProbeBaseline}
}

func tweak(s stepResult, f func(*stepResult)) stepResult {
	f(&s)
	return s
}

func TestFindMax(t *testing.T) {
	tests := []struct {
		name       string
		steps      []stepResult
		wantMax    int
		wantFailed []string
	}{
		{
			name:    "empty input",
			steps:   nil,
			wantMax: 0,
		},
		{
			name:    "every step passes: max is the last, nothing failed (caller says extend the ramp)",
			steps:   []stepResult{healthyStep(1, 100), healthyStep(2, 180), healthyStep(4, 300), healthyStep(8, 500)},
			wantMax: 8,
		},
		{
			name:    "a single step has nothing to grow from and passes",
			steps:   []stepResult{healthyStep(1, 1)},
			wantMax: 1,
		},
		{
			name:    "first step is not judged on throughput",
			steps:   []stepResult{healthyStep(1, 0.5), healthyStep(2, 1)},
			wantMax: 2,
		},
		{
			name:       "throughput gains 5.6% at the third step",
			steps:      []stepResult{healthyStep(1, 100), healthyStep(2, 180), healthyStep(4, 190)},
			wantMax:    2,
			wantFailed: []string{"throughput"},
		},
		{
			name:       "throughput is judged against the previous step, not the first",
			steps:      []stepResult{healthyStep(1, 100), healthyStep(2, 150), healthyStep(4, 160)},
			wantMax:    2,
			wantFailed: []string{"throughput"},
		},
		{
			name:       "throughput falling fails",
			steps:      []stepResult{healthyStep(1, 100), healthyStep(2, 80)},
			wantMax:    1,
			wantFailed: []string{"throughput"},
		},
		{
			name:    "exactly +10% throughput passes",
			steps:   []stepResult{healthyStep(1, 100), healthyStep(2, 110)},
			wantMax: 2,
		},
		{
			name:       "just under +10% throughput fails",
			steps:      []stepResult{healthyStep(1, 100), healthyStep(2, 109.9)},
			wantMax:    1,
			wantFailed: []string{"throughput"},
		},
		{
			name: "probe p95 at 3x baseline fails",
			steps: []stepResult{
				healthyStep(1, 100), healthyStep(2, 180),
				tweak(healthyStep(4, 300), func(s *stepResult) { s.ProbeP95 = 3 * testProbeBaseline }),
			},
			wantMax:    2,
			wantFailed: []string{"probe"},
		},
		{
			name: "probe p95 at exactly 2x baseline passes",
			steps: []stepResult{
				healthyStep(1, 100),
				tweak(healthyStep(2, 180), func(s *stepResult) { s.ProbeP95 = 2 * testProbeBaseline }),
			},
			wantMax: 2,
		},
		{
			name: "probe p95 at 2x baseline plus 1ns fails",
			steps: []stepResult{
				healthyStep(1, 100),
				tweak(healthyStep(2, 180), func(s *stepResult) { s.ProbeP95 = 2*testProbeBaseline + time.Nanosecond }),
			},
			wantMax:    1,
			wantFailed: []string{"probe"},
		},
		{
			name: "a probe error fails even when its p95 is fine",
			steps: []stepResult{
				healthyStep(1, 100), healthyStep(2, 180),
				tweak(healthyStep(4, 300), func(s *stepResult) { s.ProbeErrors = 1 }),
			},
			wantMax:    2,
			wantFailed: []string{"probe"},
		},
		{
			name: "an error at the fourth step",
			steps: []stepResult{
				healthyStep(1, 100), healthyStep(2, 180), healthyStep(4, 300),
				tweak(healthyStep(8, 500), func(s *stepResult) { s.Errors = 1 }),
			},
			wantMax:    4,
			wantFailed: []string{"errors"},
		},
		{
			name: "pool waiting alone fails",
			steps: []stepResult{
				healthyStep(1, 100), healthyStep(2, 180),
				tweak(healthyStep(4, 300), func(s *stepResult) { s.PoolWaitDelta = 5 }),
			},
			wantMax:    2,
			wantFailed: []string{"errors"},
		},
		{
			name: "errors and pool waiting together are one check",
			steps: []stepResult{
				healthyStep(1, 100),
				tweak(healthyStep(2, 180), func(s *stepResult) { s.Errors = 1; s.PoolWaitDelta = 1 }),
			},
			wantMax:    1,
			wantFailed: []string{"errors"},
		},
		{
			name: "first step fails on errors: max is 0",
			steps: []stepResult{
				tweak(healthyStep(1, 100), func(s *stepResult) { s.Errors = 2 }),
				healthyStep(2, 180),
			},
			wantMax:    0,
			wantFailed: []string{"errors"},
		},
		{
			name: "first step fails on the probe: max is 0",
			steps: []stepResult{
				tweak(healthyStep(1, 100), func(s *stepResult) { s.ProbeP95 = 5 * testProbeBaseline }),
				healthyStep(2, 180),
			},
			wantMax:    0,
			wantFailed: []string{"probe"},
		},
		{
			name: "two checks trip at once: both listed, in fixed order",
			steps: []stepResult{
				healthyStep(1, 100), healthyStep(2, 180),
				tweak(healthyStep(4, 190), func(s *stepResult) { s.ProbeP95 = 3 * testProbeBaseline }),
			},
			wantMax:    2,
			wantFailed: []string{"throughput", "probe"},
		},
		{
			name: "all three checks trip at once",
			steps: []stepResult{
				healthyStep(1, 100), healthyStep(2, 180),
				tweak(healthyStep(4, 190), func(s *stepResult) { s.ProbeErrors = 1; s.PoolWaitDelta = 2 }),
			},
			wantMax:    2,
			wantFailed: []string{"throughput", "probe", "errors"},
		},
		{
			name: "steps after the first failure are ignored",
			steps: []stepResult{
				healthyStep(1, 100), healthyStep(2, 180), healthyStep(4, 185), healthyStep(8, 400),
			},
			wantMax:    2,
			wantFailed: []string{"throughput"},
		},
		{
			name: "only the first failing step is reported",
			steps: []stepResult{
				healthyStep(1, 100), healthyStep(2, 180), healthyStep(4, 185),
				tweak(healthyStep(8, 190), func(s *stepResult) { s.Errors = 3 }),
			},
			wantMax:    2,
			wantFailed: []string{"throughput"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotMax, gotFailed := findMax(tt.steps, testProbeBaseline)
			if gotMax != tt.wantMax {
				t.Errorf("max = %d, want %d", gotMax, tt.wantMax)
			}
			if !slices.Equal(gotFailed, tt.wantFailed) {
				t.Errorf("failedChecks = %q, want %q", gotFailed, tt.wantFailed)
			}
		})
	}
}

// failingStep trips the errors check and carries the given throughput.
func failingStep(concurrency int, itemsPerSec float64) stepResult {
	return tweak(healthyStep(concurrency, itemsPerSec), func(s *stepResult) { s.Errors = 1 })
}

func TestRampStatusAfter(t *testing.T) {
	tests := []struct {
		name      string
		steps     []stepResult
		moreSteps bool
		want      rampStatus
	}{
		{"no steps yet, the ramp has values left", nil, true, rampRunOn},
		{"all pass, values left: continue", []stepResult{healthyStep(1, 100), healthyStep(2, 180)}, true, rampRunOn},
		{"all pass through the last value: a floor", []stepResult{healthyStep(1, 100), healthyStep(2, 180), healthyStep(4, 300)}, false, rampFloor},
		{"a single passing step that is also the last value: a floor", []stepResult{healthyStep(1, 100)}, false, rampFloor},
		{
			"first failure at step k with a value left: run exactly one more (the confirm step)",
			[]stepResult{healthyStep(1, 100), healthyStep(2, 180), failingStep(4, 300)}, true, rampRunOn,
		},
		{
			"first failure at the last ramp value: no step left to confirm",
			[]stepResult{healthyStep(1, 100), healthyStep(2, 180), failingStep(4, 300)}, false, rampNoConfirmStep,
		},
		{
			"confirm step fails on errors: confirmed",
			[]stepResult{healthyStep(1, 100), healthyStep(2, 180), failingStep(4, 300), failingStep(8, 500)}, true, rampConfirmed,
		},
		{
			"confirm step fails on errors at the last value: confirmed",
			[]stepResult{healthyStep(1, 100), healthyStep(2, 180), failingStep(4, 300), failingStep(8, 500)}, false, rampConfirmed,
		},
		{
			"confirm step fails on throughput alone (+3%): confirmed",
			[]stepResult{healthyStep(1, 100), healthyStep(2, 180), failingStep(4, 300), healthyStep(8, 309)}, true, rampConfirmed,
		},
		{
			"confirm step passes: unconfirmed, and the ramp stops there",
			[]stepResult{healthyStep(1, 100), healthyStep(2, 180), failingStep(4, 300), healthyStep(8, 500)}, true, rampUnconfirmed,
		},
		{
			"confirm step passes at the last value: unconfirmed",
			[]stepResult{healthyStep(1, 100), healthyStep(2, 180), failingStep(4, 300), healthyStep(8, 500)}, false, rampUnconfirmed,
		},
		{
			// 170 against the failed step's 150 is +13%: it passes. Against the last pass (180) it would fall.
			"confirm step is judged against the failed step, not the last pass (passes)",
			[]stepResult{healthyStep(1, 100), healthyStep(2, 180), failingStep(4, 150), healthyStep(8, 170)}, true, rampUnconfirmed,
		},
		{
			// 200 against the failed step's 190 is +5%: it fails. Against the last pass (180) it would gain 11%.
			"confirm step is judged against the failed step, not the last pass (fails)",
			[]stepResult{healthyStep(1, 100), healthyStep(2, 180), failingStep(4, 190), healthyStep(8, 200)}, true, rampConfirmed,
		},
		{"step 0 fails with a value left: still run step 1 to confirm", []stepResult{failingStep(1, 100)}, true, rampRunOn},
		{"step 0 fails and it is the only value: no step to confirm with", []stepResult{failingStep(1, 100)}, false, rampNoConfirmStep},
		{"step 0 fails and step 1 fails: confirmed", []stepResult{failingStep(1, 100), failingStep(2, 150)}, true, rampConfirmed},
		{"step 0 fails and step 1 passes: unconfirmed", []stepResult{failingStep(1, 100), healthyStep(2, 180)}, true, rampUnconfirmed},
		{
			"a probe failure counts like any other",
			[]stepResult{
				healthyStep(1, 100), healthyStep(2, 180),
				tweak(healthyStep(4, 300), func(s *stepResult) { s.ProbeP95 = 3 * testProbeBaseline }),
				healthyStep(8, 500),
			},
			true, rampUnconfirmed,
		},
		{
			"steps past the confirm step cannot change the answer",
			[]stepResult{healthyStep(1, 100), healthyStep(2, 180), failingStep(4, 300), healthyStep(8, 500), failingStep(16, 600)},
			true, rampUnconfirmed,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := rampStatusAfter(tt.steps, testProbeBaseline, tt.moreSteps); got != tt.want {
				t.Errorf("rampStatusAfter = %s, want %s", got, tt.want)
			}
		})
	}
}

// The max is still findMax's even though the ramp now runs a step past the
// failure: the confirm step must not move it.
func TestMaxIgnoresTheConfirmStep(t *testing.T) {
	steps := []stepResult{healthyStep(1, 100), healthyStep(2, 180), failingStep(4, 300), healthyStep(8, 500)}
	gotMax, failed := findMax(steps, testProbeBaseline)
	if gotMax != 2 || !slices.Equal(failed, []string{"errors"}) {
		t.Errorf("findMax = %d, %q; want 2, [errors]", gotMax, failed)
	}
	if got := firstFailure(steps, testProbeBaseline); got != 2 {
		t.Errorf("firstFailure = %d, want 2", got)
	}
	if got := firstFailure(steps[:2], testProbeBaseline); got != -1 {
		t.Errorf("firstFailure with no failure = %d, want -1", got)
	}
	if got := stepFailures(steps, 3, testProbeBaseline); len(got) != 0 {
		t.Errorf("confirm step passes on its own merits, got failures %q", got)
	}
}

func TestVerdictLine(t *testing.T) {
	tests := []struct {
		name          string
		status        rampStatus
		max, first    int
		maxConc       int
		confirmFailed []string
		want          string
	}{
		{"floor", rampFloor, 64, 0, 64, nil,
			"No check failed up to PERF_MAX_CONC=64, so this is a floor, not a limit: raise PERF_MAX_CONC and run again before trusting it."},
		{"confirmed names the checks", rampConfirmed, 8, 16, 64, []string{"throughput", "errors"},
			"Confirmed: the next step also failed (throughput, errors)."},
		{"unconfirmed names the bracket to bisect", rampUnconfirmed, 8, 16, 64, nil,
			"UNCONFIRMED: the first failure may be noise; re-run or bisect between 8 and 16 before trusting max."},
		{"unconfirmed with max 0 has nothing to bisect", rampUnconfirmed, 0, 1, 64, nil,
			"UNCONFIRMED: the first failure may be noise; re-run before trusting max (the first step itself failed, so there is nothing below it to bisect)."},
		{"no confirm step says so", rampNoConfirmStep, 32, 64, 64, nil,
			"Not confirmed: the first failure was at the last ramp value (PERF_MAX_CONC=64), so there is no step left to confirm it; raise PERF_MAX_CONC or re-run before trusting max."},
		{"still running prints nothing", rampRunOn, 0, 0, 64, nil, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := verdictLine(tt.status, tt.max, tt.first, tt.maxConc, tt.confirmFailed); got != tt.want {
				t.Errorf("verdictLine =\n%s\nwant\n%s", got, tt.want)
			}
		})
	}
}

func TestHalfOf(t *testing.T) {
	tests := []struct{ in, want int }{
		{0, 1},
		{1, 1},
		{2, 1},
		{3, 1},
		{4, 2},
		{9, 4},
		{16, 8},
	}
	for _, tt := range tests {
		if got := halfOf(tt.in); got != tt.want {
			t.Errorf("halfOf(%d) = %d, want %d", tt.in, got, tt.want)
		}
	}
}

// RF5: every Neon DSN form (URL, postgresql://, pooler host, key=value) is
// refused, and so is anything the guard cannot read.
func TestRefuseIfNeon(t *testing.T) {
	refused := []struct{ name, dsn string }{
		{"url form", "postgres://u:p@ep-cool-123.us-east-1.aws.neon.tech/db"},
		{"url form, pooler host", "postgres://u:p@ep-cool-123-pooler.us-east-1.aws.neon.tech/db"},
		{"postgresql scheme", "postgresql://u:p@ep-cool-123.us-east-1.aws.neon.tech/db?sslmode=require"},
		{"key=value form", "host=ep-x.us-east-2.aws.neon.tech user=u dbname=d"},
		{"upper-case url host", "postgres://u:p@EP-COOL-123.US-EAST-1.AWS.NEON.TECH/db"},
		{"upper-case key=value host", "host=EP-X.US-EAST-2.AWS.NEON.TECH user=u dbname=d"},
		{"upper-case scheme", "POSTGRES://u:p@ep-x.neon.tech/db"},
		{"url form with a port", "postgres://u:p@ep-x.neon.tech:5432/db"},
		{"host given as a url query parameter", "postgres:///db?host=ep-x.neon.tech"},
		{"neon among several url hosts", "postgres://u:p@localhost:5432,ep-x.neon.tech:5432/db"},
		{"key=value host not first", "user=u dbname=d host=ep-x.neon.tech"},
		{"key=value with spaces around =", "host = ep-x.neon.tech user=u"},
		{"key=value quoted host", "host='ep-x.neon.tech' user=u"},
		{"neon host after a quoted password with spaces", "password='a b' host=ep-x.neon.tech"},
		{"neon host hidden after a decoy inside a quoted value", "password='host=localhost' host=ep-x.neon.tech"},
		{"bare word before a neon host", "host=localhost oops host=ep-x.neon.tech"},
		{"empty", ""},
		{"blank", "   "},
		{"not a dsn", "not a dsn"},
		{"url without a host", "postgres:///db"},
		{"key=value without a host", "dbname=d user=u"},
		{"empty host value", "dbname=d host="},
		{"unparsable url", "postgres://u:p@ho st/db"},
		{"unsupported scheme", "mysql://u:p@localhost/db"},
		{"unterminated quote", "host='localhost dbname=d"},
		{"malformed url query", "postgres://u:p@localhost/db?host=localhost;x=1"},
	}
	for _, tt := range refused {
		t.Run("refuses "+tt.name, func(t *testing.T) {
			err := refuseIfNeon(tt.dsn)
			if err == nil {
				t.Fatalf("refuseIfNeon(%q) = nil, want an error", tt.dsn)
			}
			for _, want := range []string{"writes rows", "Neon"} {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("error %q does not mention %q", err, want)
				}
			}
		})
	}

	allowed := []struct{ name, dsn string }{
		{"localhost", "postgres://u:p@localhost:5432/db"},
		{"postgresql scheme", "postgresql://u:p@localhost:5432/db"},
		{"loopback ipv4", "postgres://u:p@127.0.0.1:5432/db"},
		{"loopback ipv6 in a url", "postgres://u:p@[::1]:5432/db"},
		{"loopback ipv6 as key=value", "host=::1 dbname=d"},
		{"demo stack", "postgres://demo:demo@localhost:5434/perf?sslmode=disable"},
		{"unix socket directory", "host=/var/run/postgresql dbname=d"},
		{"unix socket directory as a url query parameter", "postgres:///db?host=/var/run/postgresql"},
		{"a database named neon_test on localhost", "postgres://u:p@localhost:5432/neon_test"},
		{"a user named neon on localhost", "postgres://neon:neon@localhost:5432/db"},
		{"key=value dbname containing neon", "host=localhost port=5432 dbname=neon_test"},
		{"key=value quoted host", "host='localhost' dbname=d"},
		{"decoy host inside a quoted password", "host=localhost password='host=ep-x.neon.tech'"},
	}
	for _, tt := range allowed {
		t.Run("allows "+tt.name, func(t *testing.T) {
			if err := refuseIfNeon(tt.dsn); err != nil {
				t.Errorf("refuseIfNeon(%q) = %v, want nil", tt.dsn, err)
			}
		})
	}
}

// The error is printed to a terminal and CI logs, so it must not carry the DSN
// or any piece of it (host, user, password), including when parsing failed.
func TestRefuseIfNeonDoesNotEchoTheDSN(t *testing.T) {
	tests := []struct {
		name string
		dsn  string
		leak []string
	}{
		{"neon url", "postgres://alice:hunter2@ep-secret-host-123.us-east-1.aws.neon.tech/prod", []string{"alice", "hunter2", "ep-secret-host-123", "us-east-1", "prod"}},
		{"neon key=value", "host=ep-secret-host-123.neon.tech user=alice password=hunter2", []string{"alice", "hunter2", "ep-secret-host-123"}},
		{"unparsable url", "postgres://alice:hunter2@ho st/db", []string{"alice", "hunter2", "ho st"}},
		{"unterminated quote", "host='db-internal-77 password=hunter2", []string{"hunter2", "db-internal-77"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := refuseIfNeon(tt.dsn)
			if err == nil {
				t.Fatalf("refuseIfNeon(%q) = nil, want an error", tt.dsn)
			}
			for _, leaked := range tt.leak {
				if strings.Contains(err.Error(), leaked) {
					t.Errorf("error %q leaks %q from the DSN", err, leaked)
				}
			}
		})
	}
}

func tableCells(line string) []string {
	line = strings.TrimSuffix(strings.TrimPrefix(strings.TrimSpace(line), "|"), "|")
	cells := strings.Split(line, "|")
	for i := range cells {
		cells[i] = strings.TrimSpace(cells[i])
	}
	return cells
}

func TestMarkdownRow(t *testing.T) {
	t.Run("formats every metric in column order", func(t *testing.T) {
		s := stepResult{
			Concurrency:   8,
			ItemsPerSec:   123.456,
			ItemP50:       45*time.Millisecond + 500*time.Microsecond,
			ItemP95:       120 * time.Millisecond,
			CPUSecPerItem: 0.01234,
			PeakRSSBytes:  150 << 20,
			Goroutines:    42,
			PoolInUse:     7,
			PoolWaitDelta: 3,
			ProbeP95:      82460 * time.Microsecond,
			ProbeErrors:   2,
			Errors:        5,
			FirstError:    "boom",
		}
		want := "| 8 | 123.5 | 45.5 | 120.0 | 0.0123 | 150.0 | 42 | 7 | 3 | 82.5 | 2 | 5 | boom |"
		if got := s.markdownRow(); got != want {
			t.Errorf("markdownRow() =\n%s\nwant\n%s", got, want)
		}
	})

	t.Run("leaves the first-error cell empty when there is no error", func(t *testing.T) {
		got := healthyStep(1, 100).markdownRow()
		want := "| 1 | 100.0 | 0.0 | 0.0 | 0.0000 | 0.0 | 0 | 0 | 0 | 100.0 | 0 | 0 |  |"
		if got != want {
			t.Errorf("markdownRow() =\n%s\nwant\n%s", got, want)
		}
	})

	t.Run("keeps the row on one line and in its cells", func(t *testing.T) {
		s := tweak(healthyStep(2, 10), func(s *stepResult) {
			s.Errors = 1
			s.FirstError = "pq: bad\r\ninsert | into\tcontent\n  failed"
		})
		row := s.markdownRow()
		if strings.ContainsAny(row, "\r\n") {
			t.Errorf("row spans lines: %q", row)
		}
		if got, want := len(tableCells(row)), len(tableCells(healthyStep(2, 10).markdownRow())); got != want {
			t.Errorf("row has %d cells, want %d: %q", got, want, row)
		}
		if !strings.HasSuffix(row, "| pq: bad insert / into content failed |") {
			t.Errorf("first error not flattened as expected: %q", row)
		}
	})

	t.Run("caps the first error at 60 characters", func(t *testing.T) {
		tests := []struct {
			name    string
			message string
			want    string
		}{
			{"exactly 60 is kept", strings.Repeat("x", 60), strings.Repeat("x", 60)},
			{"61 is cut", strings.Repeat("x", 61), strings.Repeat("x", 57) + "..."},
			{"long is cut", strings.Repeat("x", 500), strings.Repeat("x", 57) + "..."},
			{"cuts on characters, not bytes", strings.Repeat("é", 100), strings.Repeat("é", 57) + "..."},
		}
		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				row := stepResult{FirstError: tt.message}.markdownRow()
				if !utf8.ValidString(row) {
					t.Fatalf("row is not valid UTF-8: %q", row)
				}
				cells := tableCells(row)
				if got := cells[len(cells)-1]; got != tt.want {
					t.Errorf("first-error cell = %q, want %q", got, tt.want)
				}
			})
		}
	})
}

func TestStepTableHeader(t *testing.T) {
	lines := strings.Split(stepTableHeader, "\n")
	if len(lines) != 2 {
		t.Fatalf("header has %d lines, want 2 (titles, then the separator): %q", len(lines), stepTableHeader)
	}
	titles, separator := tableCells(lines[0]), tableCells(lines[1])

	if len(titles) != len(separator) {
		t.Errorf("header has %d titles but %d separator cells", len(titles), len(separator))
	}
	for i, cell := range separator {
		if cell != "---" {
			t.Errorf("separator cell %d = %q, want ---", i, cell)
		}
	}
	for i, title := range titles {
		if title == "" {
			t.Errorf("header title %d is empty", i)
		}
	}

	rows := map[string]stepResult{
		"no error":       healthyStep(4, 250),
		"with an error":  {Concurrency: 4, Errors: 1, FirstError: "context deadline exceeded"},
		"hostile error":  {Concurrency: 4, Errors: 1, FirstError: "a | b\nc"},
		"zero value row": {},
	}
	for name, s := range rows {
		if got := len(tableCells(s.markdownRow())); got != len(titles) {
			t.Errorf("%s: row has %d cells, header has %d", name, got, len(titles))
		}
	}
}
