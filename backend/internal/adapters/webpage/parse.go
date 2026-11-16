package webpage

import (
	"encoding/json"
	"io"
	"net/url"
	"strings"
	"time"

	"golang.org/x/net/html"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// Rune caps on stored text. A page controls every one of these, so each is bounded
// whichever source (<title>, og:, meta) it came from.
const (
	maxTitleRunes       = 300
	maxDescriptionRunes = 1000
	maxSiteNameRunes    = 200
	maxAuthorRunes      = 200
)

// dateLayouts are the date forms accepted from meta tags and JSON-LD. The first
// that parses wins; the stored value is always YYYY-MM-DD as written on the page.
var dateLayouts = []string{
	time.RFC3339,
	"2006-01-02T15:04:05",
	"2006-01-02",
	"2006/01/02",
	"2006/1/2",
	"January 2, 2006",
	"2 January 2006",
	"Jan 2, 2006",
}

// headFields collects the raw values seen in <head>. Each keeps the first value.
type headFields struct {
	lang          string
	ogTitle       string
	ogDescription string
	siteName      string
	ogImage       string
	articlePub    string
	citationDate  string
	metaDesc      string
	metaAuthor    string
	canonical     string
	favicon       string
}

// ParseHead reads a page's <head> and returns the metadata it declares. Relative
// URLs resolve against base (the final URL after redirects). Missing values are
// nil, never a guess. The reader never sets Roles (the adder picks them), and the
// caller fills SchemaVersion, FinalURL, Domain and Fetch. Parsing stops at
// </head>, the first <body>, or the end of input.
func ParseHead(r io.Reader, base *url.URL) domain.WebPageMeta {
	return parseHeadAt(r, base, time.Now())
}

// parseHeadAt is ParseHead with the clock injected: now decides which published
// dates are too far in the future to trust.
func parseHeadAt(r io.Reader, base *url.URL, now time.Time) domain.WebPageMeta {
	var h headFields
	var titleText, ldText strings.Builder
	var ldBlocks []string
	titleSeen, inTitle, inLD := false, false, false

	z := html.NewTokenizer(r)
scan:
	for {
		switch z.Next() {
		case html.ErrorToken:
			break scan
		case html.TextToken:
			if inTitle {
				titleText.Write(z.Text())
			}
			if inLD {
				ldText.Write(z.Text())
			}
		case html.EndTagToken:
			name, _ := z.TagName()
			switch string(name) {
			case "head", "body":
				break scan
			case "title":
				inTitle = false
			case "script":
				if inLD {
					ldBlocks = append(ldBlocks, ldText.String())
					ldText.Reset()
					inLD = false
				}
			}
		case html.StartTagToken, html.SelfClosingTagToken:
			tok := z.Token()
			switch tok.Data {
			case "body":
				break scan
			case "html":
				setFirst(&h.lang, attrValue(tok, "lang"))
			case "title":
				if !titleSeen && !hasSelfClose(tok) {
					titleSeen = true
					inTitle = true
				}
			case "meta":
				h.addMeta(tok)
			case "link":
				h.addLink(tok)
			case "script":
				if isLDJSON(tok) {
					inLD = true
					ldText.Reset()
				}
			}
		}
	}

	meta := domain.WebPageMeta{
		SiteName:    nilIfEmpty(truncateRunes(collapse(h.siteName), maxSiteNameRunes)),
		Lang:        nilIfEmpty(collapse(h.lang)),
		Description: nilIfEmpty(truncateRunes(first(collapse(h.ogDescription), collapse(h.metaDesc)), maxDescriptionRunes)),
		Title:       nilIfEmpty(truncateRunes(first(collapse(h.ogTitle), collapse(titleText.String())), maxTitleRunes)),
	}

	if img, ok := absoluteHTTP(base, h.ogImage); ok {
		meta.ImageURL = &img
	}
	// The favicon is the declared icon, else /favicon.ico on the page's origin (not verified).
	if icon, ok := absoluteHTTP(base, h.favicon); ok {
		meta.FaviconURL = &icon
	} else if icon, ok := absoluteHTTP(base, "/favicon.ico"); ok {
		meta.FaviconURL = &icon
	}
	if canonical, ok := absoluteHTTP(base, h.canonical); ok {
		meta.DeclaredCanonical = canonical
	}

	ldDates, ldAuthor := jsonLDFields(ldBlocks)
	for _, candidate := range append([]string{h.articlePub, h.citationDate}, ldDates...) {
		if date, ok := normaliseDate(candidate, now); ok {
			meta.PublishedAt = &date
			break
		}
	}

	author := first(ldAuthor, collapse(h.metaAuthor))
	if author != "" {
		capped := truncateRunes(author, maxAuthorRunes)
		meta.Author = &capped
	}
	return meta
}

// addMeta records the og:, article:, citation_, description and author meta tags.
// A tag can name its value with either name or property.
func (h *headFields) addMeta(tok html.Token) {
	content := attrValue(tok, "content")
	for _, key := range []string{strings.ToLower(attrValue(tok, "name")), strings.ToLower(attrValue(tok, "property"))} {
		switch key {
		case "og:title":
			setFirst(&h.ogTitle, content)
		case "og:description":
			setFirst(&h.ogDescription, content)
		case "og:site_name":
			setFirst(&h.siteName, content)
		case "og:image":
			setFirst(&h.ogImage, content)
		case "article:published_time":
			setFirst(&h.articlePub, content)
		case "citation_date", "citation_publication_date":
			setFirst(&h.citationDate, content)
		case "description":
			setFirst(&h.metaDesc, content)
		case "author":
			setFirst(&h.metaAuthor, content)
		}
	}
}

// addLink records the declared canonical and the first icon link.
func (h *headFields) addLink(tok html.Token) {
	rel := strings.Fields(strings.ToLower(attrValue(tok, "rel")))
	for _, token := range rel {
		switch token {
		case "canonical":
			setFirst(&h.canonical, attrValue(tok, "href"))
		case "icon":
			setFirst(&h.favicon, attrValue(tok, "href"))
		}
	}
}

// jsonLDFields returns the datePublished values (in document order) and the
// first author name found in the JSON-LD blocks. A block that is not valid JSON
// is skipped, so one broken block never costs the rest of the metadata.
func jsonLDFields(blocks []string) (dates []string, author string) {
	for _, block := range blocks {
		var root any
		if err := json.Unmarshal([]byte(block), &root); err != nil {
			continue
		}
		for _, node := range jsonLDNodes(root) {
			if s, ok := node["datePublished"].(string); ok {
				dates = append(dates, s)
			}
			if author == "" {
				author = jsonLDAuthorName(node["author"])
			}
		}
	}
	return dates, author
}

// jsonLDNodes returns the objects to inspect: the root object or array items,
// plus the members of any @graph.
func jsonLDNodes(root any) []map[string]any {
	var nodes []map[string]any
	add := func(v any) {
		if m, ok := v.(map[string]any); ok {
			nodes = append(nodes, m)
		}
	}
	switch v := root.(type) {
	case map[string]any:
		add(v)
		if graph, ok := v["@graph"].([]any); ok {
			for _, item := range graph {
				add(item)
			}
		}
	case []any:
		for _, item := range v {
			add(item)
		}
	}
	return nodes
}

// jsonLDAuthorName reads a JSON-LD author: a string, an object with a name, or an
// array (the first item that yields a name). Anything else yields "".
func jsonLDAuthorName(v any) string {
	switch a := v.(type) {
	case string:
		return collapse(a)
	case map[string]any:
		if name, ok := a["name"].(string); ok {
			return collapse(name)
		}
	case []any:
		for _, item := range a {
			if name := jsonLDAuthorName(item); name != "" {
				return name
			}
		}
	}
	return ""
}

// maxFutureSkew is how far ahead of now a published date may be. A day covers the
// gap between the page's timezone and UTC; anything further is not a publish date.
const maxFutureSkew = 24 * time.Hour

// normaliseDate returns the date as YYYY-MM-DD, or false when no known layout parses
// or the date is more than maxFutureSkew ahead of now.
func normaliseDate(raw string, now time.Time) (string, bool) {
	s := collapse(raw)
	if s == "" {
		return "", false
	}
	for _, layout := range dateLayouts {
		if t, err := time.Parse(layout, s); err == nil {
			if t.After(now.Add(maxFutureSkew)) {
				return "", false
			}
			return t.Format("2006-01-02"), true
		}
	}
	return "", false
}

// absoluteHTTP resolves ref against base. It returns false for an empty ref, a
// missing base, or a result that is not http or https (so no data: or javascript: links).
func absoluteHTTP(base *url.URL, ref string) (string, bool) {
	ref = strings.TrimSpace(ref)
	if ref == "" || base == nil {
		return "", false
	}
	u, err := url.Parse(ref)
	if err != nil {
		return "", false
	}
	abs := base.ResolveReference(u)
	if abs.Scheme != "http" && abs.Scheme != "https" {
		return "", false
	}
	return abs.String(), true
}

// attrValue returns the trimmed value of an attribute, matched case-insensitively.
func attrValue(tok html.Token, key string) string {
	for _, a := range tok.Attr {
		if strings.EqualFold(a.Key, key) {
			return strings.TrimSpace(a.Val)
		}
	}
	return ""
}

func isLDJSON(tok html.Token) bool {
	return strings.EqualFold(attrValue(tok, "type"), "application/ld+json")
}

func hasSelfClose(tok html.Token) bool {
	return tok.Type == html.SelfClosingTagToken
}

// collapse trims and turns runs of whitespace into single spaces.
func collapse(s string) string {
	return strings.Join(strings.Fields(s), " ")
}

// setFirst stores a collapsed value into dst the first time it is non-empty.
func setFirst(dst *string, v string) {
	if *dst == "" {
		*dst = collapse(v)
	}
}

// first returns the first non-empty value.
func first(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

func nilIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func truncateRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return strings.TrimSpace(string(r[:n]))
}
