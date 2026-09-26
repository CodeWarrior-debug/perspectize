package appguide

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// validFixture returns an area + seeds that pass every rule, plus a repo root
// containing the one Source file they cite. Each lint case mutates a copy.
func validFixture(t *testing.T) ([]Area, map[string][]Seed, string) {
	t.Helper()
	root := t.TempDir()
	src := filepath.Join(root, "frontend", "x.svelte")
	require.NoError(t, os.MkdirAll(filepath.Dir(src), 0o755))
	require.NoError(t, os.WriteFile(src, []byte("<p/>"), 0o644))

	areas := []Area{{
		Slug: "compare", Title: "Compare", Route: "/compare", Summary: "S.",
		Entries: []Entry{{
			ID: "compare.pick-two", Task: "Compare", Where: "Compare page",
			Steps: []string{"Pick two."}, SignIn: "yes",
			Sources: []string{"frontend/x.svelte"},
		}},
	}}
	seeds := map[string][]Seed{"compare": {
		{Question: "q1", ExpectIDs: []string{"compare.pick-two"}},
		{Question: "q2", ExpectIDs: []string{"compare.pick-two"}},
		{Question: "q3", MustNotClaim: []string{"three at once"}},
	}}
	return areas, seeds, root
}

func rules(ps []Problem) []string {
	var out []string
	for _, p := range ps {
		out = append(out, p.Rule)
	}
	return out
}

func TestLint(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(a []Area, s map[string][]Seed) ([]Area, map[string][]Seed)
		want   []string
	}{
		{
			name:   "valid area and seeds",
			mutate: func(a []Area, s map[string][]Seed) ([]Area, map[string][]Seed) { return a, s },
			want:   nil,
		},
		{
			name: "missing route",
			mutate: func(a []Area, s map[string][]Seed) ([]Area, map[string][]Seed) {
				a[0].Route = ""
				return a, s
			},
			want: []string{"area-header"},
		},
		{
			name: "missing summary",
			mutate: func(a []Area, s map[string][]Seed) ([]Area, map[string][]Seed) {
				a[0].Summary = ""
				return a, s
			},
			want: []string{"area-header"},
		},
		{
			name: "bad id format",
			mutate: func(a []Area, s map[string][]Seed) ([]Area, map[string][]Seed) {
				a[0].Entries[0].ID = "Compare.PickTwo"
				s["compare"][0].ExpectIDs = []string{"Compare.PickTwo"}
				s["compare"][1].ExpectIDs = []string{"Compare.PickTwo"}
				return a, s
			},
			want: []string{"id-format"},
		},
		{
			name: "id prefix does not match area",
			mutate: func(a []Area, s map[string][]Seed) ([]Area, map[string][]Seed) {
				a[0].Entries[0].ID = "activity.pick-two"
				s["compare"][0].ExpectIDs = []string{"activity.pick-two"}
				s["compare"][1].ExpectIDs = []string{"activity.pick-two"}
				return a, s
			},
			want: []string{"id-prefix"},
		},
		{
			name: "duplicate id",
			mutate: func(a []Area, s map[string][]Seed) ([]Area, map[string][]Seed) {
				a[0].Entries = append(a[0].Entries, a[0].Entries[0])
				return a, s
			},
			want: []string{"id-unique"},
		},
		{
			name: "no steps",
			mutate: func(a []Area, s map[string][]Seed) ([]Area, map[string][]Seed) {
				a[0].Entries[0].Steps = nil
				return a, s
			},
			want: []string{"required-field"},
		},
		{
			name: "missing task and where",
			mutate: func(a []Area, s map[string][]Seed) ([]Area, map[string][]Seed) {
				a[0].Entries[0].Task = ""
				a[0].Entries[0].Where = ""
				return a, s
			},
			want: []string{"required-field", "required-field"},
		},
		{
			name: "no sources",
			mutate: func(a []Area, s map[string][]Seed) ([]Area, map[string][]Seed) {
				a[0].Entries[0].Sources = nil
				return a, s
			},
			want: []string{"required-field"},
		},
		{
			name: "sign-in value",
			mutate: func(a []Area, s map[string][]Seed) ([]Area, map[string][]Seed) {
				a[0].Entries[0].SignIn = "maybe"
				return a, s
			},
			want: []string{"sign-in-value"},
		},
		{
			name: "source does not exist",
			mutate: func(a []Area, s map[string][]Seed) ([]Area, map[string][]Seed) {
				a[0].Entries[0].Sources = []string{"frontend/missing.svelte"}
				return a, s
			},
			want: []string{"source-exists"},
		},
		{
			name: "source escapes repo root",
			mutate: func(a []Area, s map[string][]Seed) ([]Area, map[string][]Seed) {
				a[0].Entries[0].Sources = []string{"../outside.go"}
				return a, s
			},
			want: []string{"source-exists"},
		},
		{
			name: "seed references unknown id",
			mutate: func(a []Area, s map[string][]Seed) ([]Area, map[string][]Seed) {
				s["compare"][0].ExpectIDs = []string{"compare.nope"}
				return a, s
			},
			want: []string{"seed-ref"},
		},
		{
			name: "too few seeds",
			mutate: func(a []Area, s map[string][]Seed) ([]Area, map[string][]Seed) {
				s["compare"] = s["compare"][1:]
				return a, s
			},
			want: []string{"seed-coverage"},
		},
		{
			name: "no trap seed",
			mutate: func(a []Area, s map[string][]Seed) ([]Area, map[string][]Seed) {
				s["compare"][2] = Seed{Question: "q3", ExpectIDs: []string{"compare.pick-two"}}
				return a, s
			},
			want: []string{"seed-coverage"},
		},
		{
			name: "area has no seed file",
			mutate: func(a []Area, s map[string][]Seed) ([]Area, map[string][]Seed) {
				delete(s, "compare")
				return a, s
			},
			want: []string{"seed-coverage"},
		},
		{
			name: "seed file without an area",
			mutate: func(a []Area, s map[string][]Seed) ([]Area, map[string][]Seed) {
				s["ghost"] = s["compare"]
				return a, s
			},
			want: []string{"seed-orphan"},
		},
		{
			name: "unknown entry field",
			mutate: func(a []Area, s map[string][]Seed) ([]Area, map[string][]Seed) {
				a[0].Entries[0].Unknown = []string{"Colour"}
				return a, s
			},
			want: []string{"unknown-field"},
		},
		{
			name: "unknown area field",
			mutate: func(a []Area, s map[string][]Seed) ([]Area, map[string][]Seed) {
				a[0].Unknown = []string{"Owner"}
				return a, s
			},
			want: []string{"unknown-field"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			a, s, root := validFixture(t)
			a, s = tt.mutate(a, s)
			assert.Equal(t, tt.want, rules(Lint(a, s, root)))
		})
	}
}

func TestLint_ProblemCarriesLocation(t *testing.T) {
	a, s, root := validFixture(t)
	a[0].Entries[0].SignIn = "maybe"
	ps := Lint(a, s, root)
	require.Len(t, ps, 1)
	assert.Equal(t, "guide/compare.md", ps[0].File)
	assert.Equal(t, "compare.pick-two", ps[0].EntryID)
	assert.NotEmpty(t, ps[0].Message)
}
