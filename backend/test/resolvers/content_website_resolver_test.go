package resolvers_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

func websiteRow(id int, url string) *domain.Content {
	u := url
	return &domain.Content{ID: id, Name: "example.com", URL: &u, ContentType: domain.ContentTypeWebsite, AddedByUserID: 1, Privacy: domain.PrivacyPublic}
}

func TestCreateContentFromWebsite_Unauthenticated(t *testing.T) {
	server := setupTestServerNoAuth(&mockUserRepository{})
	defer server.Close()

	result := executeGraphQL(t, server, `mutation { createContentFromWebsite(input: { url: "https://example.com/" }) { alreadyExisted } }`)
	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "access denied: authentication required")
}

func TestCreateContentFromWebsite_CreatesAWebsiteRow(t *testing.T) {
	repo := &mockContentRepository{getOrCreateByURLFn: func(ctx context.Context, c *domain.Content) (*domain.Content, bool, error) {
		c.ID = 9
		return c, false, nil
	}}
	server := setupWebPageServer(repo, stubWebPageClient{meta: webPageMeta("Example", domain.FetchStatusOK, nil)})
	defer server.Close()

	result := executeGraphQL(t, server, `mutation { createContentFromWebsite(input: { url: "https://www.example.com/about" }) { alreadyExisted content { id contentType url parentContentID } } }`)
	require.Empty(t, result.Errors)
	var data struct {
		CreateContentFromWebsite struct {
			AlreadyExisted bool `json:"alreadyExisted"`
			Content        struct {
				ID              string `json:"id"`
				ContentType     string `json:"contentType"`
				URL             string `json:"url"`
				ParentContentID *int   `json:"parentContentID"`
			} `json:"content"`
		} `json:"createContentFromWebsite"`
	}
	require.NoError(t, json.Unmarshal(result.Data, &data))
	got := data.CreateContentFromWebsite
	assert.False(t, got.AlreadyExisted)
	assert.Equal(t, "9", got.Content.ID)
	assert.Equal(t, "WEBSITE", got.Content.ContentType)
	assert.Equal(t, "https://example.com/", got.Content.URL, "stored under the site root")
	assert.Nil(t, got.Content.ParentContentID)
}

func TestCreateContentFromWebPage_FilesUnderTheParentWebsite(t *testing.T) {
	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			if id == 9 {
				return websiteRow(9, "https://example.com/"), nil
			}
			return nil, domain.ErrNotFound
		},
		getOrCreateByURLFn: func(ctx context.Context, c *domain.Content) (*domain.Content, bool, error) {
			c.ID = 42
			return c, false, nil
		},
	}
	server := setupWebPageServer(repo, stubWebPageClient{meta: webPageMeta("A post", domain.FetchStatusOK, nil)})
	defer server.Close()

	result := executeGraphQL(t, server, `mutation { createContentFromWebPage(input: { url: "https://example.com/post", parentContentID: 9, webPageRoles: [BLOG_POST] }) { content { id parentContentID parentContent { id contentType url } } } }`)
	require.Empty(t, result.Errors)
	var data struct {
		CreateContentFromWebPage struct {
			Content struct {
				ID              string `json:"id"`
				ParentContentID int    `json:"parentContentID"`
				ParentContent   struct {
					ID          string `json:"id"`
					ContentType string `json:"contentType"`
					URL         string `json:"url"`
				} `json:"parentContent"`
			} `json:"content"`
		} `json:"createContentFromWebPage"`
	}
	require.NoError(t, json.Unmarshal(result.Data, &data))
	got := data.CreateContentFromWebPage.Content
	assert.Equal(t, "42", got.ID)
	assert.Equal(t, 9, got.ParentContentID)
	assert.Equal(t, "9", got.ParentContent.ID)
	assert.Equal(t, "WEBSITE", got.ParentContent.ContentType)
	assert.Equal(t, "https://example.com/", got.ParentContent.URL)
}

func TestCreateContentFromWebPage_ParentThatIsNotAWebsiteIsRefused(t *testing.T) {
	repo := &mockContentRepository{getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
		c := websiteRow(id, "https://example.com/")
		c.ContentType = domain.ContentTypeWebPage
		return c, nil
	}}
	server := setupWebPageServer(repo, stubWebPageClient{meta: webPageMeta("A post", domain.FetchStatusOK, nil)})
	defer server.Close()

	result := executeGraphQL(t, server, `mutation { createContentFromWebPage(input: { url: "https://example.com/post", parentContentID: 9 }) { alreadyExisted } }`)
	require.NotEmpty(t, result.Errors)
}

func TestContentParentContent_NullWithoutAParent(t *testing.T) {
	repo := &mockContentRepository{getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
		return websiteRow(id, "https://example.com/"), nil
	}}
	server := setupWebPageServer(repo, stubWebPageClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `query { contentByID(id: "9") { id parentContentID parentContent { id } } }`)
	require.Empty(t, result.Errors)
	assert.JSONEq(t, `{"contentByID":{"id":"9","parentContentID":null,"parentContent":null}}`, string(result.Data))
}

func TestContentParentContent_PrivateParentIsHiddenFromOthers(t *testing.T) {
	parentID := 9
	repo := &mockContentRepository{getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
		if id == 9 {
			c := websiteRow(9, "https://example.com/")
			c.AddedByUserID = 77 // not the signed-in viewer (1)
			c.Privacy = domain.PrivacyPrivate
			return c, nil
		}
		c := websiteRow(id, "https://example.com/post")
		c.ContentType = domain.ContentTypeWebPage
		c.ParentContentID = &parentID
		return c, nil
	}}
	server := setupWebPageServer(repo, stubWebPageClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `query { contentByID(id: "42") { id parentContentID parentContent { id } } }`)
	require.Empty(t, result.Errors)
	assert.JSONEq(t, `{"contentByID":{"id":"42","parentContentID":9,"parentContent":null}}`, string(result.Data))
}
