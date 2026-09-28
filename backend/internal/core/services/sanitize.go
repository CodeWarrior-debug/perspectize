package services

import "github.com/microcosm-cc/bluemonday"

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

// sanitizeReview strips any HTML outside the perspective editor's supported
// tag set, mirroring frontend/src/lib/utils/sanitize.ts's DOMPurify config.
// This is defense-in-depth: the API must not trust HTML from non-browser
// clients that bypass the frontend's DOMPurify pass.
func sanitizeReview(html string) string {
	return reviewPolicy.Sanitize(html)
}
