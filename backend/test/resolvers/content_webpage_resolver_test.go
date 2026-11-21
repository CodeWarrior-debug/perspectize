package resolvers_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/directives"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/generated"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/resolvers"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
)

// stubWebPageClient stands in for the SSRF-safe page reader.
type stubWebPageClient struct {
	meta domain.WebPageMeta
	err  error
}

func (s stubWebPageClient) Fetch(ctx context.Context, url string) (domain.WebPageMeta, error) {
	return s.meta, s.err
}

func setupWebPageServer(repo *mockContentRepository, client stubWebPageClient) *httptest.Server {
	userRepo := &mockUserRepository{}
	perspectiveRepo := &mockPerspectiveRepository{}
	contentService := services.NewContentService(repo, nil, nil, services.WithWebPageClient(client))
	userService := services.NewUserService(userRepo, repo, perspectiveRepo, nil, nil, nil)
	perspectiveService := services.NewPerspectiveService(perspectiveRepo, userRepo)
	categoryService := services.NewCategoryService(&mockCategoryRepository{}, repo, &mockWikidataClient{})
	resolver := resolvers.NewResolver(contentService, userService, perspectiveService, categoryService, nil, nil, nil, nil, nil)
	directiveRoot := directives.NewDirectiveRoot(contentService, perspectiveService)
	srv := handler.NewDefaultServer(generated.NewExecutableSchema(generated.Config{
		Resolvers:  resolver,
		Directives: generated.DirectiveRoot{Auth: directiveRoot.Auth, Owner: directiveRoot.Owner},
	}))
	return httptest.NewServer(injectAuthMiddleware(srv))
}

func webPageMeta(title string, status domain.FetchStatus, httpStatus *int) domain.WebPageMeta {
	meta := domain.WebPageMeta{
		SchemaVersion: domain.WebPageSchemaVersion,
		FinalURL:      "https://example.com/post",
		Domain:        "example.com",
		Fetch:         domain.WebPageFetch{Status: status, HTTPStatus: httpStatus},
	}
	if title != "" {
		meta.Title = &title
	}
	return meta
}

func TestCreateContentFromWebPage_Unauthenticated(t *testing.T) {
	server := setupTestServerNoAuth(&mockUserRepository{})
	defer server.Close()

	result := executeGraphQL(t, server, `mutation { createContentFromWebPage(input: { url: "https://example.com/post" }) { alreadyExisted } }`)
	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "access denied: authentication required")
}

func TestCreateContentFromWebPage_CreatesRowWithRoles(t *testing.T) {
	var savedResponse string
	repo := &mockContentRepository{getOrCreateByURLFn: func(ctx context.Context, c *domain.Content) (*domain.Content, bool, error) {
		c.ID = 42
		savedResponse = string(c.Response)
		return c, false, nil
	}}
	server := setupWebPageServer(repo, stubWebPageClient{meta: webPageMeta("Attention Is All You Need", domain.FetchStatusOK, nil)})
	defer server.Close()

	result := executeGraphQL(t, server, `mutation { createContentFromWebPage(input: { url: "https://example.com/post", webPageRoles: [BLOG_POST] }) { alreadyExisted content { id name contentType } } }`)
	require.Empty(t, result.Errors)
	var data struct {
		CreateContentFromWebPage struct {
			AlreadyExisted bool `json:"alreadyExisted"`
			Content        struct {
				ID          string `json:"id"`
				Name        string `json:"name"`
				ContentType string `json:"contentType"`
			} `json:"content"`
		} `json:"createContentFromWebPage"`
	}
	require.NoError(t, json.Unmarshal(result.Data, &data))
	assert.False(t, data.CreateContentFromWebPage.AlreadyExisted)
	assert.Equal(t, "42", data.CreateContentFromWebPage.Content.ID)
	assert.Equal(t, "Attention Is All You Need", data.CreateContentFromWebPage.Content.Name)
	assert.Equal(t, "WEB_PAGE", data.CreateContentFromWebPage.Content.ContentType)
	assert.Contains(t, savedResponse, `"webPageRoles":["BLOG_POST"]`)
}

func TestCreateContentFromWebPage_BlockedAddressGivesGenericMessage(t *testing.T) {
	repo := &mockContentRepository{}
	refused := fmt.Errorf("%w: webpage address is not public (10.0.0.1)", domain.ErrInvalidInput)
	server := setupWebPageServer(repo, stubWebPageClient{err: refused})
	defer server.Close()

	result := executeGraphQL(t, server, `mutation { createContentFromWebPage(input: { url: "https://internal.example/page" }) { alreadyExisted } }`)
	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "invalid webpage URL")
	assert.NotContains(t, result.Errors[0].Message, "10.0.0.1", "the blocked address must not reach the client")
}

func TestPreviewWebPage_WritesNothingAndReturnsMetadata(t *testing.T) {
	writes := 0
	repo := &mockContentRepository{
		createFn: func(ctx context.Context, c *domain.Content) (*domain.Content, error) {
			writes++
			return c, nil
		},
		getOrCreateByURLFn: func(ctx context.Context, c *domain.Content) (*domain.Content, bool, error) {
			writes++
			return c, false, nil
		},
	}
	server := setupWebPageServer(repo, stubWebPageClient{meta: webPageMeta("Preview title", domain.FetchStatusOK, intPtr(200))})
	defer server.Close()

	before := writes
	result := executeGraphQL(t, server, `query { previewWebPage(url: "https://example.com/post") { title fetch { status httpStatus } alreadyExistsContentId } }`)
	require.Empty(t, result.Errors)
	assert.Equal(t, before, writes, "a preview never writes")
	assert.Contains(t, string(result.Data), `"title":"Preview title"`)
	assert.Contains(t, string(result.Data), `"status":"OK"`)
	assert.Contains(t, string(result.Data), `"httpStatus":200`)
	assert.Contains(t, string(result.Data), `"alreadyExistsContentId":null`)
}

func TestPreviewWebPage_BlockedCarriesStatusAndHTTPCode(t *testing.T) {
	repo := &mockContentRepository{}
	server := setupWebPageServer(repo, stubWebPageClient{meta: webPageMeta("", domain.FetchStatusBlocked, intPtr(403))})
	defer server.Close()

	result := executeGraphQL(t, server, `query { previewWebPage(url: "https://example.com/post") { title fetch { status httpStatus } } }`)
	require.Empty(t, result.Errors)
	assert.Contains(t, string(result.Data), `"title":null`)
	assert.Contains(t, string(result.Data), `"status":"BLOCKED"`)
	assert.Contains(t, string(result.Data), `"httpStatus":403`)
}

func TestPreviewWebPage_ExistingRowReturnsItsID(t *testing.T) {
	repo := &mockContentRepository{getByURLFn: func(ctx context.Context, url string) (*domain.Content, error) {
		return &domain.Content{ID: 5, ContentType: domain.ContentTypeWebPage}, nil
	}}
	server := setupWebPageServer(repo, stubWebPageClient{meta: webPageMeta("Saved", domain.FetchStatusOK, nil)})
	defer server.Close()

	result := executeGraphQL(t, server, `query { previewWebPage(url: "https://example.com/post") { alreadyExistsContentId } }`)
	require.Empty(t, result.Errors)
	var data struct {
		PreviewWebPage struct {
			AlreadyExistsContentID any `json:"alreadyExistsContentId"`
		} `json:"previewWebPage"`
	}
	require.NoError(t, json.Unmarshal(result.Data, &data))
	// IntID marshals as a string; accept either form so the test pins the value, not the encoding.
	assert.True(t, strings.Contains(fmt.Sprint(data.PreviewWebPage.AlreadyExistsContentID), "5"))
}

// The grid payload is built from the stored row already loaded by the list, so the
// list costs one repository call however many webpages it returns.
func TestContentList_WebPagePayloadRolesNeverNullAndNoExtraLoad(t *testing.T) {
	calls := 0
	repo := &mockContentRepository{listFn: func(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error) {
		calls++
		url := "https://example.com/post"
		return &domain.PaginatedContent{Items: []*domain.Content{
			{ID: 1, Name: "Post", URL: &url, ContentType: domain.ContentTypeWebPage,
				Response: json.RawMessage(`{"siteName":"Jordan's Journey","domain":"example.com","imageUrl":"https://example.com/i.png","webPageRoles":["BLOG_POST"]}`)},
			{ID: 2, Name: "Plain", URL: &url, ContentType: domain.ContentTypeWebPage,
				Response: json.RawMessage(`{"domain":"example.com","webPageRoles":[]}`)},
			{ID: 3, Name: "Video", URL: &url, ContentType: domain.ContentTypeYouTubeVideo,
				Response: json.RawMessage(`{"items":[]}`)},
		}}, nil
	}}
	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ content { items { id webPage } } }`)
	require.Empty(t, result.Errors)
	var data struct {
		Content struct {
			Items []struct {
				ID      string         `json:"id"`
				WebPage map[string]any `json:"webPage"`
			} `json:"items"`
		} `json:"content"`
	}
	require.NoError(t, json.Unmarshal(result.Data, &data))
	require.Len(t, data.Content.Items, 3)

	withRoles := data.Content.Items[0].WebPage
	assert.Equal(t, "Jordan's Journey", withRoles["siteName"])
	assert.Equal(t, "example.com", withRoles["domain"])
	assert.Equal(t, []any{"BLOG_POST"}, withRoles["webPageRoles"])

	plain := data.Content.Items[1].WebPage
	assert.Equal(t, []any{}, plain["webPageRoles"], "roles are an empty list, never null")

	assert.Nil(t, data.Content.Items[2].WebPage, "other content types have no webPage payload")
	assert.Equal(t, 1, calls, "the list is one repository call; the payload adds none")
}
