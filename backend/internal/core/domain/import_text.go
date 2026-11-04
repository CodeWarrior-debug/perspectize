package domain

import (
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// summaryMinLength is the shortest line worth showing as a summary; shorter
// lines are usually labels ("Links:", "Chapters").
const summaryMinLength = 13

// summaryMaxLength caps a summary at roughly one grid line.
const summaryMaxLength = 200

// boilerplateLine matches lines that say nothing about the item itself: links,
// calls to action, social handles, copyright.
var boilerplateLine = regexp.MustCompile(`(?i)https?://|www\.|click here|subscribe|follow us|copyright|©|all rights reserved|^#\w|^(facebook|x|twitter|instagram|tiktok|website|podcast|patreon|merch)\s*[:\-–]`)

// timestampLine matches a chapter line: a timestamp at the start or the end.
var (
	timestampStart = regexp.MustCompile(`^\(?((?:\d{1,2}:)?\d{1,2}:\d{2})\)?\s*[-–—:|]*\s*(.+)$`)
	timestampEnd   = regexp.MustCompile(`^(.+?)\s*[-–—:|(]*\s*((?:\d{1,2}:)?\d{1,2}:\d{2})\)?$`)
	linkPattern    = regexp.MustCompile(`https?://[^\s)\]>"']+`)
)

// SummarizeDescriptions returns a one-line summary for each description of one
// source. A line that appears in more than half of the source's descriptions
// is channel boilerplate (a promo block, sign-off or social links) and is
// skipped, as are lines that look like links or calls to action. The summary
// is the first remaining line of summaryMinLength characters or more, or ""
// when nothing is left.
func SummarizeDescriptions(descriptions []string) []string {
	lineCount := make(map[string]int)
	for _, d := range descriptions {
		seen := make(map[string]bool)
		for _, line := range splitLines(d) {
			if !seen[line] {
				seen[line] = true
				lineCount[line]++
			}
		}
	}
	repeated := func(line string) bool {
		return len(descriptions) >= 3 && lineCount[line]*2 > len(descriptions)
	}

	out := make([]string, len(descriptions))
	for i, d := range descriptions {
		for _, line := range splitLines(d) {
			if len([]rune(line)) < summaryMinLength || boilerplateLine.MatchString(line) || repeated(line) {
				continue
			}
			if _, ok := parseChapterLine(line); ok {
				continue
			}
			out[i] = truncateRunes(line, summaryMaxLength)
			break
		}
	}
	return out
}

// ParseChapters reads chapter markers from a description the way YouTube
// does: at least three timestamps, the first at 0:00, strictly ascending, each
// chapter at least 10 seconds long. Anything else returns nil.
func ParseChapters(description string) []ImportChapter {
	var chapters []ImportChapter
	for _, line := range splitLines(description) {
		if ch, ok := parseChapterLine(line); ok {
			chapters = append(chapters, ch)
		}
	}
	if len(chapters) < 3 || chapters[0].StartSeconds != 0 {
		return nil
	}
	for i := 1; i < len(chapters); i++ {
		if chapters[i].StartSeconds-chapters[i-1].StartSeconds < 10 {
			return nil
		}
	}
	return chapters
}

// LinkDomains returns the distinct domains a description links to, without
// "www." and without YouTube's own, sorted, at most 8.
func LinkDomains(description string) []string {
	seen := make(map[string]bool)
	for _, raw := range linkPattern.FindAllString(description, -1) {
		u, err := url.Parse(raw)
		if err != nil || u.Host == "" {
			continue
		}
		host := strings.TrimPrefix(strings.ToLower(u.Hostname()), "www.")
		if host == "youtube.com" || host == "youtu.be" || strings.HasSuffix(host, ".youtube.com") {
			continue
		}
		seen[host] = true
	}
	out := make([]string, 0, len(seen))
	for h := range seen {
		out = append(out, h)
	}
	sort.Strings(out)
	if len(out) > 8 {
		out = out[:8]
	}
	return out
}

func parseChapterLine(line string) (ImportChapter, bool) {
	if m := timestampStart.FindStringSubmatch(line); m != nil {
		if secs, ok := parseClock(m[1]); ok {
			return ImportChapter{StartSeconds: secs, Title: strings.TrimSpace(m[2])}, true
		}
	}
	if m := timestampEnd.FindStringSubmatch(line); m != nil {
		if secs, ok := parseClock(m[2]); ok {
			return ImportChapter{StartSeconds: secs, Title: strings.TrimSpace(m[1])}, true
		}
	}
	return ImportChapter{}, false
}

// parseClock turns "m:ss" or "h:mm:ss" into seconds.
func parseClock(s string) (int, bool) {
	parts := strings.Split(s, ":")
	total := 0
	for i, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil || n < 0 || (i > 0 && n > 59) {
			return 0, false
		}
		total = total*60 + n
	}
	return total, true
}

func splitLines(s string) []string {
	raw := strings.Split(strings.ReplaceAll(s, "\r\n", "\n"), "\n")
	out := make([]string, 0, len(raw))
	for _, l := range raw {
		if t := strings.TrimSpace(l); t != "" {
			out = append(out, t)
		}
	}
	return out
}

func truncateRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return strings.TrimSpace(string(r[:n-1])) + "…"
}
