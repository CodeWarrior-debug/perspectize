package openlibrary

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// workIDRe and editionIDRe gate every id before it reaches a URL path, so a
// caller-supplied id cannot add segments, a query or a fragment.
var (
	workIDRe    = regexp.MustCompile(`^OL\d+W$`)
	editionIDRe = regexp.MustCompile(`^OL\d+M$`)
)

// relatedHeadRe matches the first line after a `---` rule that marks the
// related-works block ("Contains:" or "Also contained in:").
var relatedHeadRe = regexp.MustCompile(`(?i)^(contains|also contained in)`)

// workLinkRe matches a markdown link to a work, absolute or relative, and
// captures the link title and the bare work id. Any slug, query or fragment
// after the id is discarded.
var workLinkRe = regexp.MustCompile(`\[([^\]]*)\]\((?:https://openlibrary\.org)?/works/(OL\d+W)(?:[/?#][^)]*)?\)`)

// FetchWork reads the canonical work record for a bare work id. Callers treat
// any error as best effort: the record adds description data only.
func (c *Client) FetchWork(ctx context.Context, workKey string) (*services.BookWork, error) {
	if !workIDRe.MatchString(workKey) {
		return nil, fmt.Errorf("%w: not an Open Library work id", domain.ErrInvalidInput)
	}
	body, err := c.get(ctx, "/works/"+workKey+".json", nil)
	if err != nil {
		return nil, err
	}
	return parseWorkRecord(body)
}

// ResolveEdition returns the bare work id an edition record belongs to. The
// id must be a bare edition id (e.g. "OL22640535M").
func (c *Client) ResolveEdition(ctx context.Context, editionKey string) (string, error) {
	if !editionIDRe.MatchString(editionKey) {
		return "", fmt.Errorf("%w: not an Open Library edition id", domain.ErrInvalidInput)
	}
	body, err := c.get(ctx, "/books/"+editionKey+".json", nil)
	if err != nil {
		return "", err
	}
	return editionWorkKey(body)
}

// parseWorkRecord shapes a raw /works/{id}.json payload into its description
// and related works. A missing, null or unrecognised description yields "",
// never an error.
func parseWorkRecord(raw []byte) (*services.BookWork, error) {
	var record struct {
		Description json.RawMessage `json:"description"`
	}
	if err := json.Unmarshal(raw, &record); err != nil {
		// Deliberately not wrapping err: decoder errors can echo upstream content.
		return nil, fmt.Errorf("%w: failed to parse work response", ErrOpenLibraryAPI)
	}
	description, related := splitRelatedWorks(decodeDescription(record.Description))
	return &services.BookWork{Description: description, RelatedWorks: related}, nil
}

// decodeDescription accepts Open Library's two description shapes: a plain
// string, or a {type, value} object. Anything else decodes to "".
func decodeDescription(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return normalizeNewlines(s)
	}
	var obj struct {
		Value string `json:"value"`
	}
	if err := json.Unmarshal(raw, &obj); err == nil {
		return normalizeNewlines(obj.Value)
	}
	return ""
}

// splitRelatedWorks separates the description from its trailing related-works
// block. The block starts at the first line that is exactly `---` whose next
// non-blank line begins with "Contains" or "Also contained in" (case-insensitive).
// A `---` rule followed by anything else leaves the whole text in the
// description. Related works are the work links in the block, in order, with
// duplicates collapsed. The result is never a nil slice.
func splitRelatedWorks(text string) (string, []services.BookRelatedWork) {
	text = normalizeNewlines(text)
	lines := strings.Split(text, "\n")
	for i, line := range lines {
		if strings.TrimSpace(line) != "---" {
			continue
		}
		next := nextNonBlank(lines, i+1)
		if next < 0 || !relatedHeadRe.MatchString(strings.TrimSpace(lines[next])) {
			continue
		}
		description := strings.TrimSpace(strings.Join(lines[:i], "\n"))
		return description, parseWorkLinks(strings.Join(lines[i+1:], "\n"))
	}
	return strings.TrimSpace(text), []services.BookRelatedWork{}
}

// nextNonBlank returns the index of the first non-blank line at or after from,
// or -1 when there is none.
func nextNonBlank(lines []string, from int) int {
	for j := from; j < len(lines); j++ {
		if strings.TrimSpace(lines[j]) != "" {
			return j
		}
	}
	return -1
}

// parseWorkLinks collects canonical work links from markdown text, in order,
// dropping duplicates. Non-work links are ignored.
func parseWorkLinks(text string) []services.BookRelatedWork {
	related := []services.BookRelatedWork{}
	seen := map[string]bool{}
	for _, m := range workLinkRe.FindAllStringSubmatch(text, -1) {
		url := canonicalBookURL(m[2])
		if seen[url] {
			continue
		}
		seen[url] = true
		title := strings.TrimSpace(m[1])
		if title == "" {
			title = url
		}
		related = append(related, services.BookRelatedWork{Title: title, URL: url})
	}
	return related
}

// canonicalBookURL is the canonical https://openlibrary.org/works/<id> link for
// a bare work id (no slug).
func canonicalBookURL(workKey string) string {
	return "https://openlibrary.org/works/" + workKey
}

// normalizeNewlines converts CRLF and lone CR to LF, so stored text never
// carries carriage returns.
func normalizeNewlines(s string) string {
	return strings.ReplaceAll(strings.ReplaceAll(s, "\r\n", "\n"), "\r", "\n")
}
