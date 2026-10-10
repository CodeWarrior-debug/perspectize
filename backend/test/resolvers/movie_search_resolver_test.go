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

type stubMovieSearch struct {
	page  *portservices.MovieSearchPage
	err   error
	query string
	pageN int
}

func (s *stubMovieSearch) SearchMovies(ctx context.Context, query string, page int) (*portservices.MovieSearchPage, error) {
	s.query, s.pageN = query, page
	return s.page, s.err
}

func setupMovieSearchServer(search *stubMovieSearch) *httptest.Server {
	repo := &mockContentRepository{}
	contentService := services.NewContentService(repo, &mockYouTubeClient{}, nil, services.WithMovieSearch(search))
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

func TestMovieSearch_MapsResultAndCanonicalURL(t *testing.T) {
	date, poster, score := "1999-03-30", "/m.jpg", 8.2
	search := &stubMovieSearch{page: &portservices.MovieSearchPage{
		Items: []portservices.MovieSearchResult{
			{TMDBID: 603, Title: "The Matrix", ReleaseDate: &date, Overview: "A hacker.", PosterPath: &poster, VoteAverage: &score},
			{TMDBID: 7, Title: "Bare", Overview: ""},
		},
		Page: 2, TotalPages: 5, TotalResults: 93,
	}}
	server := setupMovieSearchServer(search)
	defer server.Close()

	resp := executeGraphQL(t, server, `{ movieSearch(query: "matrix", page: 2) { items { tmdbId title releaseDate overview posterPath voteAverage url } page totalPages totalResults } }`)
	require.Empty(t, resp.Errors)
	assert.Equal(t, "matrix", search.query)
	assert.Equal(t, 2, search.pageN)

	assert.JSONEq(t, `{"movieSearch": {
		"items": [
			{"tmdbId": 603, "title": "The Matrix", "releaseDate": "1999-03-30", "overview": "A hacker.", "posterPath": "/m.jpg", "voteAverage": 8.2, "url": "https://www.themoviedb.org/movie/603"},
			{"tmdbId": 7, "title": "Bare", "releaseDate": null, "overview": "", "posterPath": null, "voteAverage": null, "url": "https://www.themoviedb.org/movie/7"}
		],
		"page": 2, "totalPages": 5, "totalResults": 93
	}}`, string(resp.Data))
}

func TestMovieSearch_DefaultsPageAndEmptyItemsIsNotNull(t *testing.T) {
	search := &stubMovieSearch{page: &portservices.MovieSearchPage{Page: 1, TotalPages: 0, TotalResults: 0}}
	server := setupMovieSearchServer(search)
	defer server.Close()

	resp := executeGraphQL(t, server, `{ movieSearch(query: "nothing") { items { tmdbId } page totalPages totalResults } }`)
	require.Empty(t, resp.Errors)
	assert.Equal(t, 1, search.pageN, "omitted page reaches the service as page 1")
	assert.JSONEq(t, `{"movieSearch": {"items": [], "page": 1, "totalPages": 0, "totalResults": 0}}`, string(resp.Data))
}

func TestMovieSearch_InvalidInputIsClientError(t *testing.T) {
	server := setupMovieSearchServer(&stubMovieSearch{page: &portservices.MovieSearchPage{}})
	defer server.Close()

	resp := executeGraphQL(t, server, `{ movieSearch(query: "   ") { items { tmdbId } } }`)
	require.NotEmpty(t, resp.Errors)
	assert.Contains(t, resp.Errors[0].Message, "1-100 characters")
}

func TestMovieSearch_UpstreamFailureIsGeneric(t *testing.T) {
	server := setupMovieSearchServer(&stubMovieSearch{err: assert.AnError})
	defer server.Close()

	resp := executeGraphQL(t, server, `{ movieSearch(query: "matrix") { items { tmdbId } } }`)
	require.NotEmpty(t, resp.Errors)
	assert.Equal(t, "movie search is unavailable right now", resp.Errors[0].Message)
}
