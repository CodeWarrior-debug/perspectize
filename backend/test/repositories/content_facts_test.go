package repositories

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// publishedAtExpr is the one published-date expression. Sort and the
// publishedAfter/Before filters must both read it, or a web page sorts by one date
// and filters by another.
const publishedAtExpr = "CASE WHEN content_type = 'web_page' THEN response->>'publishedAt' ELSE response->'items'->0->'snippet'->>'publishedAt' END"

func TestPublishedSortAndDateFiltersShareOneExpression(t *testing.T) {
	n := 10
	sortSQL := listSQL(t, domain.ContentListParams{
		First: &n, SortBy: domain.ContentSortByPublishedAt, SortOrder: domain.SortOrderAsc,
	})
	assert.Contains(t, sortSQL, publishedAtExpr)

	after := "2026-01-01"
	before := "2026-12-31"
	filterSQL := listSQL(t, pageOf(10, &domain.ContentFilter{PublishedAfter: &after, PublishedBefore: &before}))
	assert.Contains(t, filterSQL, publishedAtExpr+" >= ")
	assert.Contains(t, filterSQL, publishedAtExpr+" <= ")
}

func TestWebPageSiteAndAuthorFiltersReadTheWebPageFact(t *testing.T) {
	site := "example"
	siteSQL := listSQL(t, pageOf(10, &domain.ContentFilter{WebPageSiteContains: &site}))
	assert.Contains(t, siteSQL, "response->>'siteName' ILIKE")

	author := "jane"
	authorSQL := listSQL(t, pageOf(10, &domain.ContentFilter{WebPageAuthorContains: &author}))
	assert.Contains(t, authorSQL, "response->>'author' ILIKE")
}
