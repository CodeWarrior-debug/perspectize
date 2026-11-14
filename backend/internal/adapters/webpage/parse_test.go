package webpage

import (
	"bytes"
	"fmt"
	"net/url"
	"os"
	"strings"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func strPtr(s string) *string { return &s }

func parseFixture(t *testing.T, name, base string) domain.WebPageMeta {
	t.Helper()
	data, err := os.ReadFile("testdata/" + name)
	require.NoError(t, err)
	baseURL, err := url.Parse(base)
	require.NoError(t, err)
	return ParseHead(bytes.NewReader(data), baseURL)
}

func TestParseHead_Fixtures(t *testing.T) {
	tests := []struct {
		name    string
		fixture string
		base    string
		want    domain.WebPageMeta
	}{
		{
			name:    "arxiv: citation_date, no og:site_name, declared canonical",
			fixture: "arxiv.html",
			base:    "https://arxiv.org/abs/1706.03762",
			want: domain.WebPageMeta{
				Title:             strPtr("[1706.03762] Attention Is All You Need"),
				Description:       strPtr("The dominant sequence transduction models are based on complex recurrent or convolutional neural networks."),
				PublishedAt:       strPtr("2017-06-12"),
				Lang:              strPtr("en"),
				FaviconURL:        strPtr("https://arxiv.org/static/favicon.ico"),
				DeclaredCanonical: "https://arxiv.org/abs/1706.03762",
			},
		},
		{
			name:    "og_full: og tags win, article:published_time beats citation_date and JSON-LD",
			fixture: "og_full.html",
			base:    "https://blog.example.com/posts/hello",
			want: domain.WebPageMeta{
				Title:       strPtr("Og Title"),
				Description: strPtr("Og description"),
				SiteName:    strPtr("Jordan's Journey"),
				ImageURL:    strPtr("https://cdn.example.com/hero.jpg"),
				PublishedAt: strPtr("2026-03-04"),
				Lang:        strPtr("en-GB"),
				FaviconURL:  strPtr("https://blog.example.com/favicon.ico"),
			},
		},
		{
			name:    "bare: title only, every other field nil, favicon falls back to origin",
			fixture: "bare.html",
			base:    "https://example.org/",
			want: domain.WebPageMeta{
				Title:      strPtr("Just a Title"),
				FaviconURL: strPtr("https://example.org/favicon.ico"),
			},
		},
		{
			name:    "relative_image: og:image and icon resolve against the page URL",
			fixture: "relative_image.html",
			base:    "https://news.example.org/articles/one",
			want: domain.WebPageMeta{
				Title:      strPtr("Relative"),
				ImageURL:   strPtr("https://news.example.org/images/cover.png"),
				FaviconURL: strPtr("https://news.example.org/articles/icons/fav.png"),
				Lang:       strPtr("fr"),
			},
		},
		{
			name:    "author_jsonld: author object name",
			fixture: "author_jsonld.html",
			base:    "https://example.com/post",
			want: domain.WebPageMeta{
				Title:      strPtr("Post"),
				Author:     strPtr("Jane Doe"),
				Lang:       strPtr("en"),
				FaviconURL: strPtr("https://example.com/favicon.ico"),
			},
		},
		{
			name:    "author_jsonld_graph: first author of an array inside @graph, date from the graph node",
			fixture: "author_jsonld_graph.html",
			base:    "https://example.com/graph",
			want: domain.WebPageMeta{
				Title:       strPtr("Post"),
				Author:      strPtr("First Author"),
				PublishedAt: strPtr("2024-02-29"),
				Lang:        strPtr("en"),
				FaviconURL:  strPtr("https://example.com/favicon.ico"),
			},
		},
		{
			name:    "author_meta: meta[name=author] when there is no JSON-LD",
			fixture: "author_meta.html",
			base:    "https://example.com/meta",
			want: domain.WebPageMeta{
				Title:      strPtr("Post"),
				Author:     strPtr("Ada Lovelace (guest)"),
				Lang:       strPtr("en"),
				FaviconURL: strPtr("https://example.com/favicon.ico"),
			},
		},
		{
			name:    "malformed_jsonld: no author or date from the broken block, the rest intact",
			fixture: "malformed_jsonld.html",
			base:    "https://example.com/bad",
			want: domain.WebPageMeta{
				Title:       strPtr("Still here"),
				Description: strPtr("Intact description"),
				Lang:        strPtr("en"),
				FaviconURL:  strPtr("https://example.com/favicon.ico"),
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parseFixture(t, tt.fixture, tt.base)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestParseHead_NeverSetsRoles(t *testing.T) {
	// og:type=article, BlogPosting JSON-LD, and a BlogPosting author page: none of
	// them sets roles. The adder picks roles (spec section 9).
	for _, name := range []string{"og_full.html", "author_jsonld.html", "author_jsonld_graph.html"} {
		t.Run(name, func(t *testing.T) {
			got := parseFixture(t, name, "https://example.com/post")
			assert.Nil(t, got.Roles)
		})
	}
}

func TestParseHead_AuthorCappedAt200Runes(t *testing.T) {
	long := strings.Repeat("é", 250)
	html := fmt.Sprintf(`<html><head><title>x</title><meta name="author" content="%s"></head>`, long)
	base, _ := url.Parse("https://example.com/")

	got := ParseHead(strings.NewReader(html), base)
	require.NotNil(t, got.Author)
	assert.Equal(t, 200, len([]rune(*got.Author)))
	assert.Equal(t, strings.Repeat("é", 200), *got.Author)
}

func TestParseHead_StopsAtHeadEnd(t *testing.T) {
	// A title placed after </head> belongs to the body, not the metadata.
	html := `<html><head><meta name="description" content="kept"></head><body><title>ignored</title></body>`
	base, _ := url.Parse("https://example.com/")

	got := ParseHead(strings.NewReader(html), base)
	assert.Nil(t, got.Title)
	require.NotNil(t, got.Description)
	assert.Equal(t, "kept", *got.Description)
}

func TestParseHead_DeclaredCanonicalIsAbsolute(t *testing.T) {
	html := `<html><head><link rel="canonical" href="/clean/path"></head>`
	base, _ := url.Parse("https://example.com/messy?utm_source=x")

	got := ParseHead(strings.NewReader(html), base)
	assert.Equal(t, "https://example.com/clean/path", got.DeclaredCanonical)
}
