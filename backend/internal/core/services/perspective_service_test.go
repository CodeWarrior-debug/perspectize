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
