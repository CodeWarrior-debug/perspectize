package jeeves

import "regexp"

var citeRe = regexp.MustCompile(`\[([a-z0-9-]+\.[a-z0-9-]+)\]`)

// Citations returns the unique [area.task] guide IDs cited in text, in
// first-seen order. The system prompt asks for this citation format; the
// evals grade it and the UI renders it as chips.
func Citations(text string) []string {
	var ids []string
	seen := map[string]bool{}
	for _, m := range citeRe.FindAllStringSubmatch(text, -1) {
		if !seen[m[1]] {
			seen[m[1]] = true
			ids = append(ids, m[1])
		}
	}
	return ids
}
