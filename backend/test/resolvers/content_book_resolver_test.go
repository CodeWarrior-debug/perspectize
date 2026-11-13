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

// stubBookSearchClient and stubBookISBNClient back CreateContentFromBook's
// two Open Library dependencies (search-by-work-key, and ISBN resolution).
type stubBookSearchClient struct {
	page *portservices.BookSearchPage
	err  error
}

func (s stubBookSearchClient) SearchBooks(ctx context.Context, query string, page int) (*portservices.BookSearchPage, error) {
	return s.page, s.err
}

type stubBookISBNClient struct {
	workKey string
	err     error
}

func (s stubBookISBNClient) ResolveISBN(ctx context.Context, isbn string) (string, error) {
	return s.workKey, s.err
}

func setupBookServer(repo *mockContentRepository, search portservices.BookSearchClient, isbn portservices.BookISBNClient) *httptest.Server {
	userRepo := &mockUserRepository{}
	perspectiveRepo := &mockPerspectiveRepository{}
	opts := []services.ContentServiceOption{}
	if search != nil {
		opts = append(opts, services.WithBookSearch(search))
	}
	if isbn != nil {
		opts = append(opts, services.WithBookISBN(isbn))
	}
	contentService := services.NewContentService(repo, nil, nil, opts...)
	userService := services.NewUserService(userRepo, repo, perspectiveRepo, nil, nil, nil)
	perspectiveService := services.NewPerspectiveService(perspectiveRepo, userRepo)
	categoryService := services.NewCategoryService(&mockCategoryRepository{}, repo, &mockWikidataClient{})
	resolver := resolvers.NewResolver(contentService, userService, perspectiveService, categoryService, nil, nil, nil, nil)
	directiveRoot := directives.NewDirectiveRoot(contentService, perspectiveService)
	srv := handler.NewDefaultServer(generated.NewExecutableSchema(generated.Config{
		Resolvers:  resolver,
		Directives: generated.DirectiveRoot{Auth: directiveRoot.Auth, Owner: directiveRoot.Owner},
	}))
	return httptest.NewServer(injectAuthMiddleware(srv))
}

const bookMutation = `mutation { createContentFromBook(input: { url: "https://openlibrary.org/works/OL23166W" }) { id name contentType } }`

func TestCreateContentFromBook_Success(t *testing.T) {
	repo := &mockContentRepository{getOrCreateByURLFn: func(ctx context.Context, c *domain.Content) (*domain.Content, bool, error) {
		c.ID = 42
		return c, false, nil
	}}
	search := stubBookSearchClient{page: &portservices.BookSearchPage{Items: []portservices.BookSearchResult{
		{WorkKey: "OL23166W", Title: "The Hobbit"},
	}}}
	server := setupBookServer(repo, search, nil)
	defer server.Close()

	result := executeGraphQL(t, server, bookMutation)
	require.Empty(t, result.Errors)
	var data struct {
		CreateContentFromBook struct {
			ID, Name, ContentType string
		} `json:"createContentFromBook"`
	}
	require.NoError(t, json.Unmarshal(result.Data, &data))
	assert.Equal(t, "42", data.CreateContentFromBook.ID)
	assert.Equal(t, "BOOK", data.CreateContentFromBook.ContentType)
	assert.Equal(t, "The Hobbit", data.CreateContentFromBook.Name)
}

func TestCreateContentFromBook_HyphenatedISBNNormalized(t *testing.T) {
	repo := &mockContentRepository{getOrCreateByURLFn: func(ctx context.Context, c *domain.Content) (*domain.Content, bool, error) {
		c.ID = 7
		return c, false, nil
	}}
	search := stubBookSearchClient{page: &portservices.BookSearchPage{Items: []portservices.BookSearchResult{
		{WorkKey: "OL23166W", Title: "The Hobbit"},
	}}}
	isbn := stubBookISBNClient{workKey: "OL23166W"}
	server := setupBookServer(repo, search, isbn)
	defer server.Close()

	result := executeGraphQL(t, server, `mutation { createContentFromBook(input: { url: "978-0-434-74002-4" }) { id name } }`)
	require.Empty(t, result.Errors)
	assert.Contains(t, string(result.Data), `"id":"7"`)
}

func TestCreateContentFromBook_DuplicateReturnsExisting(t *testing.T) {
	url := "https://openlibrary.org/works/OL23166W"
	repo := &mockContentRepository{getByURLFn: func(ctx context.Context, u string) (*domain.Content, error) {
		return &domain.Content{ID: 7, Name: "The Hobbit", URL: &url, ContentType: domain.ContentTypeBook}, nil
	}}
	server := setupBookServer(repo, stubBookSearchClient{}, nil)
	defer server.Close()

	result := executeGraphQL(t, server, bookMutation)
	require.Empty(t, result.Errors)
	assert.Contains(t, string(result.Data), `"id":"7"`)
}

func TestCreateContentFromBook_InvalidInput(t *testing.T) {
	server := setupBookServer(&mockContentRepository{}, stubBookSearchClient{}, nil)
	defer server.Close()

	result := executeGraphQL(t, server, `mutation { createContentFromBook(input: { url: "https://example.com/x" }) { id } }`)
	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "invalid book URL or ISBN")
}

func TestCreateContentFromBook_Unauthenticated(t *testing.T) {
	server := setupTestServerNoAuth(&mockUserRepository{})
	defer server.Close()

	result := executeGraphQL(t, server, bookMutation)
	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "access denied: authentication required")
}

func TestCreateContentFromBook_NotFoundMapsToBookNotFound(t *testing.T) {
	search := stubBookSearchClient{err: domain.ErrNotFound}
	server := setupBookServer(&mockContentRepository{}, search, nil)
	defer server.Close()

	result := executeGraphQL(t, server, bookMutation)
	require.NotEmpty(t, result.Errors)
	assert.Equal(t, "book not found", result.Errors[0].Message)
}

func TestCreateContentFromBook_GenericErrorMessage(t *testing.T) {
	search := stubBookSearchClient{err: errors.New("upstream blew up Bearer secret")}
	server := setupBookServer(&mockContentRepository{}, search, nil)
	defer server.Close()

	result := executeGraphQL(t, server, bookMutation)
	require.NotEmpty(t, result.Errors)
	assert.Equal(t, "failed to create content from book", result.Errors[0].Message)
}
