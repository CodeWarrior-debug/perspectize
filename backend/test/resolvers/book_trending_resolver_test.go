package resolvers_test

import (
	"context"
	"net/http/httptest"
	"testing"

	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/directives"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/generated"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/resolvers"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type stubBookTrending struct {
	page   *portservices.BookSearchPage
	err    error
	window domain.TrendingWindow
	pageN  int
	calls  int
}

func (s *stubBookTrending) TrendingBooks(ctx context.Context, window domain.TrendingWindow, page int) (*portservices.BookSearchPage, error) {
	s.calls++
	s.window, s.pageN = window, page
	return s.page, s.err
}

func setupBookTrendingServer(trending *stubBookTrending) *httptest.Server {
	repo := &mockContentRepository{}
	contentService := services.NewContentService(repo, &mockYouTubeClient{}, nil, services.WithBookTrending(trending))
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

func TestBookTrending_MapsResultAndCanonicalURL(t *testing.T) {
	trending := &stubBookTrending{page: &portservices.BookSearchPage{
		Items: []portservices.BookSearchResult{
			{WorkKey: "OL23166W", Title: "The Hobbit"},
			{WorkKey: "OL1W", Title: "Bare"},
		},
		Page: 2, TotalPages: 5, TotalResults: 93,
	}}
	server := setupBookTrendingServer(trending)
	defer server.Close()

	resp := executeGraphQL(t, server, `{ bookTrending(window: DAY, page: 2) { items { workKey title url } page totalPages totalResults } }`)
	require.Empty(t, resp.Errors)
	assert.Equal(t, domain.TrendingWindowDay, trending.window)
	assert.Equal(t, 2, trending.pageN)

	assert.JSONEq(t, `{"bookTrending": {
		"items": [
			{"workKey": "OL23166W", "title": "The Hobbit", "url": "https://openlibrary.org/works/OL23166W"},
			{"workKey": "OL1W", "title": "Bare", "url": "https://openlibrary.org/works/OL1W"}
		],
		"page": 2, "totalPages": 5, "totalResults": 93
	}}`, string(resp.Data))
}

func TestBookTrending_DefaultsWindowToWeekAndPageToOne(t *testing.T) {
	trending := &stubBookTrending{page: &portservices.BookSearchPage{Page: 1, TotalPages: 0, TotalResults: 0}}
	server := setupBookTrendingServer(trending)
	defer server.Close()

	resp := executeGraphQL(t, server, `{ bookTrending { items { workKey } page totalPages totalResults } }`)
	require.Empty(t, resp.Errors)
	assert.Equal(t, domain.TrendingWindowWeek, trending.window, "omitted window defaults to WEEK")
	assert.Equal(t, 1, trending.pageN, "omitted page reaches the service as page 1")
	assert.JSONEq(t, `{"bookTrending": {"items": [], "page": 1, "totalPages": 0, "totalResults": 0}}`, string(resp.Data))
}

func TestBookTrending_InvalidPageIsClientError(t *testing.T) {
	trending := &stubBookTrending{page: &portservices.BookSearchPage{}}
	server := setupBookTrendingServer(trending)
	defer server.Close()

	resp := executeGraphQL(t, server, `{ bookTrending(page: 501) { items { workKey } } }`)
	require.NotEmpty(t, resp.Errors)
	assert.Contains(t, resp.Errors[0].Message, "between 1 and 500")
	assert.Equal(t, 0, trending.calls, "invalid input must not reach the client")
}

func TestBookTrending_UpstreamFailureIsGeneric(t *testing.T) {
	server := setupBookTrendingServer(&stubBookTrending{err: assert.AnError})
	defer server.Close()

	resp := executeGraphQL(t, server, `{ bookTrending(window: WEEK) { items { workKey } } }`)
	require.NotEmpty(t, resp.Errors)
	assert.Equal(t, "trending books are unavailable right now", resp.Errors[0].Message)
}
