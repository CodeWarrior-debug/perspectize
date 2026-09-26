package appguide

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// Problem is one lint finding. Rule is a stable machine-readable name
// (e.g. "source-exists") so tests and the writing loop can match on it.
type Problem struct {
	File    string // "guide/<slug>.md" or "seeds/<slug>.json"
	EntryID string // empty for area- or file-level problems
	Rule    string
	Message string
}

func (p Problem) String() string {
	loc := p.File
	if p.EntryID != "" {
		loc += " " + p.EntryID
	}
	return fmt.Sprintf("%s [%s] %s", loc, p.Rule, p.Message)
}

// minSeeds is the minimum number of eval seeds per area (spec §Eval seeds).
const minSeeds = 3

var idRe = regexp.MustCompile(`^[a-z0-9-]+\.[a-z0-9-]+$`)

// Lint runs the deterministic guide checks. repoRoot resolves Source paths,
// which are repo-relative. Problems are returned in a stable order: areas in
// the given order (entries in file order), then seed files by slug.
func Lint(areas []Area, seeds map[string][]Seed, repoRoot string) []Problem {
	var ps []Problem
	ids := map[string]bool{}

	for _, a := range areas {
		file := "guide/" + a.Slug + ".md"
		add := func(entryID, rule, format string, args ...any) {
			ps = append(ps, Problem{File: file, EntryID: entryID, Rule: rule, Message: fmt.Sprintf(format, args...)})
		}

		if a.Route == "" || a.Summary == "" {
			add("", "area-header", "area needs both **Route:** and **Summary:**")
		}
		for _, name := range a.Unknown {
			add("", "unknown-field", "unknown area field %q", name)
		}

		for _, e := range a.Entries {
			switch {
			case !idRe.MatchString(e.ID):
				add(e.ID, "id-format", "ID must match area.task in lowercase kebab-case")
			case !strings.HasPrefix(e.ID, a.Slug+"."):
				add(e.ID, "id-prefix", "ID must start with %q", a.Slug+".")
			}
			if ids[e.ID] {
				add(e.ID, "id-unique", "ID is already used by another entry")
			}
			ids[e.ID] = true

			for _, f := range []struct {
				name  string
				empty bool
			}{
				{"Task", e.Task == ""},
				{"Where", e.Where == ""},
				{"Steps", len(e.Steps) == 0},
				{"Source", len(e.Sources) == 0},
			} {
				if f.empty {
					add(e.ID, "required-field", "missing **%s:**", f.name)
				}
			}
			if e.SignIn != "yes" && e.SignIn != "no" {
				add(e.ID, "sign-in-value", "**Sign-in required:** must be yes or no, got %q", e.SignIn)
			}
			for _, src := range e.Sources {
				if msg := checkSource(repoRoot, src); msg != "" {
					add(e.ID, "source-exists", "%s", msg)
				}
			}
			for _, name := range e.Unknown {
				add(e.ID, "unknown-field", "unknown field %q", name)
			}
		}
	}

	return append(ps, lintSeeds(areas, seeds, ids)...)
}

// checkSource returns a problem message, or "" when src is a repo-relative
// path that exists under repoRoot.
func checkSource(repoRoot, src string) string {
	clean := filepath.Clean(filepath.FromSlash(src))
	if filepath.IsAbs(clean) || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return fmt.Sprintf("source %q must be a repo-relative path inside the repo", src)
	}
	if _, err := os.Stat(filepath.Join(repoRoot, clean)); err != nil {
		return fmt.Sprintf("source %q does not exist", src)
	}
	return ""
}

func lintSeeds(areas []Area, seeds map[string][]Seed, ids map[string]bool) []Problem {
	var ps []Problem
	known := map[string]bool{}
	for _, a := range areas {
		known[a.Slug] = true
		file := "seeds/" + a.Slug + ".json"
		ss := seeds[a.Slug]

		hasTrap := false
		for _, s := range ss {
			if len(s.MustNotClaim) > 0 {
				hasTrap = true
			}
			for _, id := range s.ExpectIDs {
				if !ids[id] {
					ps = append(ps, Problem{File: file, Rule: "seed-ref",
						Message: fmt.Sprintf("seed %q expects unknown entry %q", s.Question, id)})
				}
			}
		}
		if len(ss) < minSeeds || !hasTrap {
			ps = append(ps, Problem{File: file, Rule: "seed-coverage",
				Message: fmt.Sprintf("need at least %d seeds including one with must_not_claim (have %d, trap: %v)", minSeeds, len(ss), hasTrap)})
		}
	}

	var orphans []string
	for slug := range seeds {
		if !known[slug] {
			orphans = append(orphans, slug)
		}
	}
	sort.Strings(orphans)
	for _, slug := range orphans {
		ps = append(ps, Problem{File: "seeds/" + slug + ".json", Rule: "seed-orphan",
			Message: "seed file has no matching guide area"})
	}
	return ps
}
