// Package appguide loads Jeeves's task-oriented app guide and its eval seeds.
//
// The guide is Markdown in a small, fixed format (see guide/README.md). The
// parser is a line scanner rather than a Markdown library: the format is ours,
// so a constrained parser is simpler and its errors are easier to lint.
package appguide

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"path"
	"regexp"
	"sort"
	"strings"
)

// Directories rather than globs: go:embed fails to compile when a glob
// matches nothing, and each directory always holds at least its README.
//
//go:embed guide seeds
var files embed.FS

// Area is one guide file, e.g. guide/compare.md.
type Area struct {
	Slug    string // file name without ".md"
	Title   string
	Route   string
	Summary string
	Entries []Entry
	Unknown []string // unrecognized **Field:** names in the area header
}

// Entry is one task, headed "## <slug>.<task>".
type Entry struct {
	ID           string
	Task         string
	Where        string
	Steps        []string
	NotSupported string
	Notes        string
	SignIn       string // "yes" or "no"; validated by Lint
	Sources      []string
	Unknown      []string // unrecognized **Field:** names, reported by Lint
}

// Seed is one eval question for an area.
type Seed struct {
	Question     string   `json:"question"`
	ExpectIDs    []string `json:"expect_ids"`
	MustNotClaim []string `json:"must_not_claim"`
}

var (
	fieldRe  = regexp.MustCompile(`^\*\*([^*:]+):\*\*\s*(.*)$`)
	stepRe   = regexp.MustCompile(`^\d+\.\s+(.*)$`)
	sourceRe = regexp.MustCompile("`([^`]+)`")
)

// ParseArea parses one area file. slug is the file name without ".md".
func ParseArea(slug string, src []byte) (Area, error) {
	a := Area{Slug: slug}
	text := strings.ReplaceAll(string(src), "\r\n", "\n")

	var cur *Entry
	inSteps := false
	for _, raw := range strings.Split(text, "\n") {
		line := strings.TrimSpace(raw)
		switch {
		case line == "":
			continue
		case strings.HasPrefix(line, "## "):
			a.Entries = append(a.Entries, Entry{ID: strings.TrimSpace(line[3:])})
			cur = &a.Entries[len(a.Entries)-1]
			inSteps = false
		case strings.HasPrefix(line, "# "):
			a.Title = strings.TrimSpace(line[2:])
		case inSteps && stepRe.MatchString(line):
			cur.Steps = append(cur.Steps, stepRe.FindStringSubmatch(line)[1])
		default:
			m := fieldRe.FindStringSubmatch(line)
			if m == nil {
				continue // prose outside the format is ignored, not an error
			}
			name, value := strings.TrimSpace(m[1]), strings.TrimSpace(m[2])
			inSteps = false
			if cur == nil {
				setAreaField(&a, name, value)
			} else {
				inSteps = setEntryField(cur, name, value)
			}
		}
	}
	if a.Title == "" {
		return Area{}, fmt.Errorf("appguide: %s: missing \"# Title\" line", slug)
	}
	return a, nil
}

func setAreaField(a *Area, name, value string) {
	switch name {
	case "Route":
		a.Route = value
	case "Summary":
		a.Summary = value
	default:
		a.Unknown = append(a.Unknown, name)
	}
}

// setEntryField stores one field and reports whether a Steps list begins.
func setEntryField(e *Entry, name, value string) bool {
	switch name {
	case "Task":
		e.Task = value
	case "Where":
		e.Where = value
	case "Steps":
		return true
	case "Not supported":
		e.NotSupported = value
	case "Notes":
		e.Notes = value
	case "Sign-in required":
		e.SignIn = value
	case "Source":
		for _, m := range sourceRe.FindAllStringSubmatch(value, -1) {
			e.Sources = append(e.Sources, m[1])
		}
	default:
		e.Unknown = append(e.Unknown, name)
	}
	return false
}

// Load parses every embedded area (guide/*.md except README.md) and every
// seed file (seeds/*.json), keyed by area slug. Areas are sorted by slug.
func Load() ([]Area, map[string][]Seed, error) {
	areas, err := loadAreas()
	if err != nil {
		return nil, nil, err
	}
	seeds, err := loadSeeds()
	if err != nil {
		return nil, nil, err
	}
	return areas, seeds, nil
}

func loadAreas() ([]Area, error) {
	names, err := fs.Glob(files, "guide/*.md")
	if err != nil {
		return nil, err
	}
	var areas []Area
	for _, name := range names {
		slug := strings.TrimSuffix(path.Base(name), ".md")
		if slug == "README" {
			continue
		}
		src, err := files.ReadFile(name)
		if err != nil {
			return nil, err
		}
		a, err := ParseArea(slug, src)
		if err != nil {
			return nil, err
		}
		areas = append(areas, a)
	}
	sort.Slice(areas, func(i, j int) bool { return areas[i].Slug < areas[j].Slug })
	return areas, nil
}

func loadSeeds() (map[string][]Seed, error) {
	names, err := fs.Glob(files, "seeds/*.json")
	if err != nil {
		return nil, err
	}
	seeds := make(map[string][]Seed, len(names))
	for _, name := range names {
		src, err := files.ReadFile(name)
		if err != nil {
			return nil, err
		}
		var s []Seed
		if err := json.Unmarshal(src, &s); err != nil {
			return nil, fmt.Errorf("appguide: %s: %w", name, err)
		}
		seeds[strings.TrimSuffix(path.Base(name), ".json")] = s
	}
	return seeds, nil
}
