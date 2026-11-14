package services

import (
	"html"
	"strings"

	"github.com/microcosm-cc/bluemonday"
)

func newReviewPolicy() *bluemonday.Policy {
	p := bluemonday.NewPolicy()
	p.AllowElements("p", "br", "strong", "b", "em", "i", "u", "span", "ul", "ol", "li")
	p.AllowElements("h2", "h3")
	p.AllowElements("table", "thead", "tbody", "tr", "th", "td")

	p.AllowAttrs("href").OnElements("a")
	p.AllowAttrs("target").OnElements("a")
	p.AllowAttrs("rel").OnElements("a")
	p.RequireNoFollowOnLinks(false) // frontend already sets rel explicitly; don't fight it
	p.AllowStandardURLs()

	p.AllowAttrs("src", "alt", "width", "height").OnElements("img")
	p.AllowURLSchemes("http", "https")

	return p
}

var reviewPolicy = newReviewPolicy()

// textOnlyPolicy keeps no tags at all. It is used only to read what a reader
// sees, never to store anything.
var textOnlyPolicy = bluemonday.StrictPolicy()

// sanitizeReview strips any HTML outside the perspective editor's supported
// tag set, mirroring frontend/src/lib/utils/sanitize.ts's DOMPurify config.
// This is defense-in-depth: the API must not trust HTML from non-browser
// clients that bypass the frontend's DOMPurify pass.
func sanitizeReview(html string) string {
	return reviewPolicy.Sanitize(html)
}

// visibleText is the text a reader sees of sanitized HTML: tags removed,
// entities decoded, spaces and no-break spaces trimmed. Empty means there is
// nothing to read (an empty editor's <p></p>, <p><br></p>, <p>&nbsp;</p>).
func visibleText(sanitized string) string {
	text := html.UnescapeString(textOnlyPolicy.Sanitize(sanitized))
	return strings.Trim(text, " \t\r\n ")
}
