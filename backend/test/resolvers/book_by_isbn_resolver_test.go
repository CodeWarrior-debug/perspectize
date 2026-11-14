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

type stubBookISBNResolver struct {
	workKey string
	err     error
	isbn    string
}

func (s *stubBookISBNResolver) ResolveISBN(ctx context.Context, isbn string) (string, error) {
	s.isbn = isbn
	return s.workKey, s.err
}

func setupBookByISBNServer(isbn *stubBookISBNResolver, search portservices.BookSearchClient) *httptest.Server {
	repo := &mockContentRepository{}
	contentService := services.NewContentService(repo, &mockYouTubeClient{}, nil, services.WithBookISBN(isbn), services.WithBookSearch(search))
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

func TestBookByISBN_Success(t *testing.T) {
	isbn := &stubBookISBNResolver{workKey: "OL23166W"}
	search := stubBookSearchClient{page: &portservices.BookSearchPage{Items: []portservices.BookSearchResult{
		{WorkKey: "OL23166W", Title: "The Hobbit"},
	}}}
	server := setupBookByISBNServer(isbn, search)
	defer server.Close()

	resp := executeGraphQL(t, server, `{ bookByISBN(isbn: "9780434740024") { workKey title url } }`)
	require.Empty(t, resp.Errors)
	assert.Equal(t, "9780434740024", isbn.isbn)
	assert.JSONEq(t, `{"bookByISBN": {"workKey": "OL23166W", "title": "The Hobbit", "url": "https://openlibrary.org/works/OL23166W"}}`, string(resp.Data))
}

func TestBookByISBN_HyphenatedISBNNormalized(t *testing.T) {
	isbn := &stubBookISBNResolver{workKey: "OL23166W"}
	search := stubBookSearchClient{page: &portservices.BookSearchPage{Items: []portservices.BookSearchResult{
		{WorkKey: "OL23166W", Title: "The Hobbit"},
	}}}
	server := setupBookByISBNServer(isbn, search)
	defer server.Close()

	resp := executeGraphQL(t, server, `{ bookByISBN(isbn: "978-0-434-74002-4") { workKey } }`)
	require.Empty(t, resp.Errors)
	assert.Equal(t, "9780434740024", isbn.isbn, "hyphens must be stripped before reaching the service")
}

func TestBookByISBN_NotFoundReturnsNull(t *testing.T) {
	isbn := &stubBookISBNResolver{err: domain.ErrNotFound}
	server := setupBookByISBNServer(isbn, stubBookSearchClient{})
	defer server.Close()

	resp := executeGraphQL(t, server, `{ bookByISBN(isbn: "9780434740024") { workKey } }`)
	require.Empty(t, resp.Errors)
	assert.JSONEq(t, `{"bookByISBN": null}`, string(resp.Data))
}

func TestBookByISBN_UpstreamFailureIsGeneric(t *testing.T) {
	isbn := &stubBookISBNResolver{err: assert.AnError}
	server := setupBookByISBNServer(isbn, stubBookSearchClient{})
	defer server.Close()

	resp := executeGraphQL(t, server, `{ bookByISBN(isbn: "9780434740024") { workKey } }`)
	require.NotEmpty(t, resp.Errors)
	assert.Equal(t, "book lookup is unavailable right now", resp.Errors[0].Message)
}
