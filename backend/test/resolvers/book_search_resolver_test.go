package resolvers_test

import (
	"context"
	"net/http/httptest"
	"testing"

	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/directives"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/generated"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/resolvers"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type stubBookSearch struct {
	page  *portservices.BookSearchPage
	err   error
	query string
	pageN int
}

func (s *stubBookSearch) SearchBooks(ctx context.Context, query string, page int) (*portservices.BookSearchPage, error) {
	s.query, s.pageN = query, page
	return s.page, s.err
}

func setupBookSearchServer(search *stubBookSearch) *httptest.Server {
	repo := &mockContentRepository{}
	contentService := services.NewContentService(repo, &mockYouTubeClient{}, nil, services.WithBookSearch(search))
	userService := services.NewUserService(&mockUserRepository{}, repo, &mockPerspectiveRepository{}, nil, nil, nil)
	perspectiveService := services.NewPerspectiveService(&mockPerspectiveRepository{}, &mockUserRepository{})
	categoryService := services.NewCategoryService(&mockCategoryRepository{}, repo, &mockWikidataClient{})
	resolver := resolvers.NewResolver(contentService, userService, perspectiveService, categoryService, nil, nil, nil, nil)
	directiveRoot := directives.NewDirectiveRoot(contentService, perspectiveService)
	srv := handler.NewDefaultServer(generated.NewExecutableSchema(generated.Config{
		Resolvers:  resolver,
		Directives: generated.DirectiveRoot{Auth: directiveRoot.Auth, Owner: directiveRoot.Owner},
	}))
	return httptest.NewServer(srv) // no auth middleware: the query is public
}

func TestBookSearch_MapsResultAndCanonicalURL(t *testing.T) {
	year, cover, pages, rating, count, editions := 1937, 258027, 310, 4.3, 1200, 50
	search := &stubBookSearch{page: &portservices.BookSearchPage{
		Items: []portservices.BookSearchResult{
			{WorkKey: "OL23166W", Title: "The Hobbit", AuthorName: []string{"J.R.R. Tolkien"}, CoverID: &cover, FirstPublishYear: &year, PageCountMedian: &pages, Subjects: []string{"Fantasy"}, RatingsAverage: &rating, RatingsCount: &count, EditionCount: &editions},
			{WorkKey: "OL1W", Title: "Bare"},
		},
		Page: 2, TotalPages: 5, TotalResults: 93,
	}}
	server := setupBookSearchServer(search)
	defer server.Close()

	resp := executeGraphQL(t, server, `{ bookSearch(query: "hobbit", page: 2) { items { workKey title authorName coverId firstPublishYear pageCountMedian subjects ratingsAverage ratingsCount editionCount url } page totalPages totalResults } }`)
	require.Empty(t, resp.Errors)
	assert.Equal(t, "hobbit", search.query)
	assert.Equal(t, 2, search.pageN)

	assert.JSONEq(t, `{"bookSearch": {
		"items": [
			{"workKey": "OL23166W", "title": "The Hobbit", "authorName": ["J.R.R. Tolkien"], "coverId": 258027, "firstPublishYear": 1937, "pageCountMedian": 310, "subjects": ["Fantasy"], "ratingsAverage": 4.3, "ratingsCount": 1200, "editionCount": 50, "url": "https://openlibrary.org/works/OL23166W"},
			{"workKey": "OL1W", "title": "Bare", "authorName": [], "coverId": null, "firstPublishYear": null, "pageCountMedian": null, "subjects": [], "ratingsAverage": null, "ratingsCount": null, "editionCount": null, "url": "https://openlibrary.org/works/OL1W"}
		],
		"page": 2, "totalPages": 5, "totalResults": 93
	}}`, string(resp.Data))
}

func TestBookSearch_DefaultsPageAndEmptyItemsIsNotNull(t *testing.T) {
	search := &stubBookSearch{page: &portservices.BookSearchPage{Page: 1, TotalPages: 0, TotalResults: 0}}
	server := setupBookSearchServer(search)
	defer server.Close()

	resp := executeGraphQL(t, server, `{ bookSearch(query: "nothing") { items { workKey } page totalPages totalResults } }`)
	require.Empty(t, resp.Errors)
	assert.Equal(t, 1, search.pageN, "omitted page reaches the service as page 1")
	assert.JSONEq(t, `{"bookSearch": {"items": [], "page": 1, "totalPages": 0, "totalResults": 0}}`, string(resp.Data))
}

func TestBookSearch_InvalidInputIsClientError(t *testing.T) {
	server := setupBookSearchServer(&stubBookSearch{page: &portservices.BookSearchPage{}})
	defer server.Close()

	resp := executeGraphQL(t, server, `{ bookSearch(query: "   ") { items { workKey } } }`)
	require.NotEmpty(t, resp.Errors)
	assert.Contains(t, resp.Errors[0].Message, "1-100 characters")
}

func TestBookSearch_UpstreamFailureIsGeneric(t *testing.T) {
	server := setupBookSearchServer(&stubBookSearch{err: assert.AnError})
	defer server.Close()

	resp := executeGraphQL(t, server, `{ bookSearch(query: "hobbit") { items { workKey } } }`)
	require.NotEmpty(t, resp.Errors)
	assert.Equal(t, "book search is unavailable right now", resp.Errors[0].Message)
}
