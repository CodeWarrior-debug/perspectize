package services

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestSanitizeReview_StripsScriptTags(t *testing.T) {
	in := `<p>hello</p><script>alert(1)</script>`
	got := sanitizeReview(in)
	assert.Equal(t, "<p>hello</p>", got)
}

func TestSanitizeReview_AllowsTablesAndImages(t *testing.T) {
	in := `<table><tr><td>a</td></tr></table><img src="https://x.com/y.png" alt="z">`
	got := sanitizeReview(in)
	assert.Contains(t, got, "<table>")
	assert.Contains(t, got, `<img src="https://x.com/y.png" alt="z"`)
}

func TestSanitizeReview_StripsJavascriptURLs(t *testing.T) {
	in := `<a href="javascript:alert(1)">click</a>`
	got := sanitizeReview(in)
	assert.NotContains(t, got, "javascript:")
}

func TestSanitizeReview_KeepsBlockquoteAndItsFormatting(t *testing.T) {
	in := `<blockquote><p>a <strong>quoted</strong> line</p></blockquote><p>my reply</p>`
	got := sanitizeReview(in)
	assert.Equal(t, in, got)
}

func TestSanitizeReview_BlockquoteGetsNoAttributesOrScripts(t *testing.T) {
	in := `<blockquote onclick="alert(1)" style="x:y"><p>q</p><script>alert(1)</script></blockquote>`
	got := sanitizeReview(in)
	assert.Equal(t, "<blockquote><p>q</p></blockquote>", got)
}
