package resolvers_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"testing"

	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/directives"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/generated"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/resolvers"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
)

type stubMovieClient struct {
	get func(ctx context.Context, id int) (*portservices.MovieMetadata, error)
}

func (s stubMovieClient) GetMovie(ctx context.Context, id int) (*portservices.MovieMetadata, error) {
	return s.get(ctx, id)
}
func (s stubMovieClient) FindMovieByIMDbID(ctx context.Context, imdbID string) (int, error) {
	return 603, nil
}

func setupMovieServer(repo *mockContentRepository, mc portservices.MovieClient) *httptest.Server {
	userRepo := &mockUserRepository{}
	perspectiveRepo := &mockPerspectiveRepository{}
	contentService := services.NewContentService(repo, nil, mc)
	userService := services.NewUserService(userRepo, repo, perspectiveRepo)
	perspectiveService := services.NewPerspectiveService(perspectiveRepo, userRepo)
	categoryService := services.NewCategoryService(&mockCategoryRepository{}, repo, &mockWikidataClient{})
	resolver := resolvers.NewResolver(contentService, userService, perspectiveService, categoryService, nil, nil, nil)
	directiveRoot := directives.NewDirectiveRoot(contentService, perspectiveService)
	srv := handler.NewDefaultServer(generated.NewExecutableSchema(generated.Config{
		Resolvers:  resolver,
		Directives: generated.DirectiveRoot{Auth: directiveRoot.Auth, Owner: directiveRoot.Owner},
	}))
	return httptest.NewServer(injectAuthMiddleware(srv))
}

const movieMutation = `mutation { createContentFromMovie(input: { url: "https://www.themoviedb.org/movie/603" }) { id name contentType } }`

func TestCreateContentFromMovie_Success(t *testing.T) {
	repo := &mockContentRepository{getOrCreateByURLFn: func(ctx context.Context, c *domain.Content) (*domain.Content, bool, error) {
		c.ID = 42
		return c, false, nil
	}}
	mc := stubMovieClient{get: func(ctx context.Context, id int) (*portservices.MovieMetadata, error) {
		return &portservices.MovieMetadata{TMDBID: 603, Title: "The Matrix", Response: json.RawMessage(`{}`)}, nil
	}}
	server := setupMovieServer(repo, mc)
	defer server.Close()

	result := executeGraphQL(t, server, movieMutation)
	require.Empty(t, result.Errors)
	var data struct {
		CreateContentFromMovie struct {
			ID, Name, ContentType string
		} `json:"createContentFromMovie"`
	}
	require.NoError(t, json.Unmarshal(result.Data, &data))
	assert.Equal(t, "42", data.CreateContentFromMovie.ID)
	assert.Equal(t, "MOVIE", data.CreateContentFromMovie.ContentType)
	assert.Equal(t, "The Matrix", data.CreateContentFromMovie.Name)
}

func TestCreateContentFromMovie_DuplicateReturnsExisting(t *testing.T) {
	url := "https://www.themoviedb.org/movie/603"
	repo := &mockContentRepository{getByURLFn: func(ctx context.Context, u string) (*domain.Content, error) {
		return &domain.Content{ID: 7, Name: "The Matrix", URL: &url, ContentType: domain.ContentTypeMovie}, nil
	}}
	server := setupMovieServer(repo, stubMovieClient{})
	defer server.Close()

	result := executeGraphQL(t, server, movieMutation)
	require.Empty(t, result.Errors)
	assert.Contains(t, string(result.Data), `"id":"7"`)
}

func TestCreateContentFromMovie_InvalidURL(t *testing.T) {
	server := setupMovieServer(&mockContentRepository{}, stubMovieClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `mutation { createContentFromMovie(input: { url: "https://example.com/x" }) { id } }`)
	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "invalid movie URL")
}

func TestCreateContentFromMovie_Unauthenticated(t *testing.T) {
	server := setupTestServerNoAuth(&mockUserRepository{})
	defer server.Close()

	result := executeGraphQL(t, server, movieMutation)
	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "access denied: authentication required")
}

func TestCreateContentFromMovie_NotFoundMapsToMovieNotFound(t *testing.T) {
	mc := stubMovieClient{get: func(ctx context.Context, id int) (*portservices.MovieMetadata, error) {
		return nil, domain.ErrNotFound
	}}
	server := setupMovieServer(&mockContentRepository{}, mc)
	defer server.Close()

	result := executeGraphQL(t, server, movieMutation)
	require.NotEmpty(t, result.Errors)
	assert.Equal(t, "movie not found", result.Errors[0].Message)
}

func TestCreateContentFromMovie_GenericErrorMessage(t *testing.T) {
	mc := stubMovieClient{get: func(ctx context.Context, id int) (*portservices.MovieMetadata, error) {
		return nil, errors.New("upstream blew up Bearer secret")
	}}
	server := setupMovieServer(&mockContentRepository{}, mc)
	defer server.Close()

	result := executeGraphQL(t, server, movieMutation)
	require.NotEmpty(t, result.Errors)
	assert.Equal(t, "failed to create content from movie", result.Errors[0].Message)
}

func TestCreateContentFromMovie_NC17MapsToContentNotAllowed(t *testing.T) {
	writes := 0
	repo := &mockContentRepository{getOrCreateByURLFn: func(ctx context.Context, c *domain.Content) (*domain.Content, bool, error) {
		writes++
		return c, false, nil
	}}
	mc := stubMovieClient{get: func(ctx context.Context, id int) (*portservices.MovieMetadata, error) {
		return &portservices.MovieMetadata{TMDBID: 603, Title: "X", Response: json.RawMessage(`{"certification":"NC-17"}`)}, nil
	}}
	server := setupMovieServer(repo, mc)
	defer server.Close()

	result := executeGraphQL(t, server, movieMutation)
	require.Len(t, result.Errors, 1)
	assert.Equal(t, domain.ErrContentNotAllowed.Error(), result.Errors[0].Message)
	assert.Equal(t, "While Perspectize does not intend to act as censor, adding NSFW content is not enabled until traffic necessitates a long-term decision about content access policies.", result.Errors[0].Message)
	assert.Equal(t, "CONTENT_NOT_ALLOWED", result.Errors[0].Extensions["code"])
	assert.Equal(t, 0, writes)
}
