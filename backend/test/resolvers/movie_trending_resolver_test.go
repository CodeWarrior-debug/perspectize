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

type stubMovieTrending struct {
	page   *portservices.MovieSearchPage
	err    error
	window domain.TrendingWindow
	pageN  int
	calls  int
}

func (s *stubMovieTrending) TrendingMovies(ctx context.Context, window domain.TrendingWindow, page int) (*portservices.MovieSearchPage, error) {
	s.calls++
	s.window, s.pageN = window, page
	return s.page, s.err
}

func setupMovieTrendingServer(trending *stubMovieTrending) *httptest.Server {
	repo := &mockContentRepository{}
	contentService := services.NewContentService(repo, &mockYouTubeClient{}, nil, services.WithMovieTrending(trending))
	userService := services.NewUserService(&mockUserRepository{}, repo, &mockPerspectiveRepository{})
	perspectiveService := services.NewPerspectiveService(&mockPerspectiveRepository{}, &mockUserRepository{})
	categoryService := services.NewCategoryService(&mockCategoryRepository{}, repo, &mockWikidataClient{})
	resolver := resolvers.NewResolver(contentService, userService, perspectiveService, categoryService, nil, nil, nil)
	directiveRoot := directives.NewDirectiveRoot(contentService, perspectiveService)
	srv := handler.NewDefaultServer(generated.NewExecutableSchema(generated.Config{
		Resolvers:  resolver,
		Directives: generated.DirectiveRoot{Auth: directiveRoot.Auth, Owner: directiveRoot.Owner},
	}))
	return httptest.NewServer(srv) // no auth middleware: the query is public
}

func TestMovieTrending_MapsResultAndCanonicalURL(t *testing.T) {
	date, poster, score := "1999-03-30", "/m.jpg", 8.2
	trending := &stubMovieTrending{page: &portservices.MovieSearchPage{
		Items: []portservices.MovieSearchResult{
			{TMDBID: 603, Title: "The Matrix", ReleaseDate: &date, Overview: "A hacker.", PosterPath: &poster, VoteAverage: &score},
			{TMDBID: 7, Title: "Bare", Overview: ""},
		},
		Page: 2, TotalPages: 5, TotalResults: 93,
	}}
	server := setupMovieTrendingServer(trending)
	defer server.Close()

	resp := executeGraphQL(t, server, `{ movieTrending(window: DAY, page: 2) { items { tmdbId title releaseDate overview posterPath voteAverage url } page totalPages totalResults } }`)
	require.Empty(t, resp.Errors)
	assert.Equal(t, domain.TrendingWindowDay, trending.window)
	assert.Equal(t, 2, trending.pageN)

	assert.JSONEq(t, `{"movieTrending": {
		"items": [
			{"tmdbId": 603, "title": "The Matrix", "releaseDate": "1999-03-30", "overview": "A hacker.", "posterPath": "/m.jpg", "voteAverage": 8.2, "url": "https://www.themoviedb.org/movie/603"},
			{"tmdbId": 7, "title": "Bare", "releaseDate": null, "overview": "", "posterPath": null, "voteAverage": null, "url": "https://www.themoviedb.org/movie/7"}
		],
		"page": 2, "totalPages": 5, "totalResults": 93
	}}`, string(resp.Data))
}

func TestMovieTrending_DefaultsWindowToWeekAndPageToOne(t *testing.T) {
	trending := &stubMovieTrending{page: &portservices.MovieSearchPage{Page: 1, TotalPages: 0, TotalResults: 0}}
	server := setupMovieTrendingServer(trending)
	defer server.Close()

	resp := executeGraphQL(t, server, `{ movieTrending { items { tmdbId } page totalPages totalResults } }`)
	require.Empty(t, resp.Errors)
	assert.Equal(t, domain.TrendingWindowWeek, trending.window, "omitted window defaults to WEEK")
	assert.Equal(t, 1, trending.pageN, "omitted page reaches the service as page 1")
	assert.JSONEq(t, `{"movieTrending": {"items": [], "page": 1, "totalPages": 0, "totalResults": 0}}`, string(resp.Data))
}

func TestMovieTrending_InvalidPageIsClientError(t *testing.T) {
	trending := &stubMovieTrending{page: &portservices.MovieSearchPage{}}
	server := setupMovieTrendingServer(trending)
	defer server.Close()

	resp := executeGraphQL(t, server, `{ movieTrending(page: 501) { items { tmdbId } } }`)
	require.NotEmpty(t, resp.Errors)
	assert.Contains(t, resp.Errors[0].Message, "between 1 and 500")
	assert.Equal(t, 0, trending.calls, "invalid input must not reach the client")
}

func TestMovieTrending_UpstreamFailureIsGeneric(t *testing.T) {
	server := setupMovieTrendingServer(&stubMovieTrending{err: assert.AnError})
	defer server.Close()

	resp := executeGraphQL(t, server, `{ movieTrending(window: WEEK) { items { tmdbId } } }`)
	require.NotEmpty(t, resp.Errors)
	assert.Equal(t, "trending movies are unavailable right now", resp.Errors[0].Message)
}
