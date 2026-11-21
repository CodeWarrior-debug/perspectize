package services_test

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

func okSite(t *testing.T) *mockWebPageClient {
	t.Helper()
	return &mockWebPageClient{fetchFn: func(_ context.Context, _ string) (domain.WebPageMeta, error) {
		return okWebPage("https://example.com/", "Example"), nil
	}}
}

// websiteParentRepo serves one stored row for GetByID and counts the lookups.
func websiteParentRepo(parent *domain.Content, getByIDCalls *int, inserts *int) *mockContentRepository {
	return &mockContentRepository{
		getByURLFn: func(_ context.Context, _ string) (*domain.Content, error) { return nil, domain.ErrNotFound },
		getByIDFn: func(_ context.Context, id int) (*domain.Content, error) {
			*getByIDCalls++
			if parent != nil && parent.ID == id {
				return parent, nil
			}
			return nil, domain.ErrNotFound
		},
		getOrCreateByURLFn: func(_ context.Context, c *domain.Content, _ bool) (*domain.Content, bool, error) {
			*inserts++
			return c, false, nil
		},
	}
}

func TestCreateFromWebsite_SavesSiteRootWithoutPageOnlyKeys(t *testing.T) {
	client := okSite(t)
	got, err := newWebPageService(&mockContentRepository{}, client).CreateFromWebsite(context.Background(), "https://www.Example.com/about", 3)
	require.NoError(t, err)

	assert.Equal(t, domain.ContentTypeWebsite, got.ContentType)
	require.NotNil(t, got.URL)
	assert.Equal(t, "https://example.com/", *got.URL)
	assert.Equal(t, "Example", got.Name)

	var keys map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(got.Response, &keys))
	assert.NotContains(t, keys, "publishedAt")
	assert.NotContains(t, keys, "webPageRoles")
	assert.Contains(t, keys, "fetch")
}

func TestCreateFromWebsite_BlockedFetchStillCreatesRowNamedForHost(t *testing.T) {
	client := &mockWebPageClient{fetchFn: func(_ context.Context, _ string) (domain.WebPageMeta, error) {
		meta := okWebPage("https://example.com/", "")
		meta.Fetch.Status = domain.FetchStatusBlocked
		return meta, nil
	}}
	got, err := newWebPageService(&mockContentRepository{}, client).CreateFromWebsite(context.Background(), "https://example.com/", 1)
	require.NoError(t, err)
	assert.Equal(t, "example.com", got.Name)
}

func TestCreateFromWebsite_ExistingReturnsAlreadyExists(t *testing.T) {
	client := okSite(t)
	existing := &domain.Content{ID: 5, ContentType: domain.ContentTypeWebsite}
	repo := &mockContentRepository{getByURLFn: func(_ context.Context, _ string) (*domain.Content, error) { return existing, nil }}
	got, err := newWebPageService(repo, client).CreateFromWebsite(context.Background(), "https://example.com/x", 1)
	require.ErrorIs(t, err, domain.ErrAlreadyExists)
	assert.Equal(t, 5, got.ID)
	assert.Equal(t, 0, client.calls)
}

func TestCreateFromWebPage_RootURLIsInvalidInput(t *testing.T) {
	client := okSite(t)
	_, err := newWebPageService(&mockContentRepository{}, client).CreateFromWebPage(context.Background(),
		portservices.CreateWebPageInput{URL: "https://example.com/?utm_source=x"}, 1)
	require.ErrorIs(t, err, domain.ErrInvalidInput)
	assert.Contains(t, err.Error(), "website")
	assert.Equal(t, 0, client.calls)
}

func TestCreateFromWebPage_ParentMustBeWebsiteOnSameHost(t *testing.T) {
	tests := []struct {
		name   string
		parent *domain.Content
	}{
		{"a webpage row", &domain.Content{ID: 9, ContentType: domain.ContentTypeWebPage, URL: strPtr("https://example.com/a")}},
		{"a missing row", nil},
		{"a website on another host", &domain.Content{ID: 9, ContentType: domain.ContentTypeWebsite, URL: strPtr("https://other.com/")}},
		{"a website with no URL", &domain.Content{ID: 9, ContentType: domain.ContentTypeWebsite}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := okSite(t)
			calls, inserts := 0, 0
			repo := websiteParentRepo(tt.parent, &calls, &inserts)
			id := 9
			_, err := newWebPageService(repo, client).CreateFromWebPage(context.Background(),
				portservices.CreateWebPageInput{URL: "https://example.com/post", ParentContentID: &id}, 1)
			require.ErrorIs(t, err, domain.ErrInvalidInput)
			assert.Equal(t, 0, inserts)
		})
	}
}

func TestCreateFromWebPage_ValidParentIsSavedAndCostsOneGetByID(t *testing.T) {
	client := okSite(t)
	parent := &domain.Content{ID: 9, ContentType: domain.ContentTypeWebsite, URL: strPtr("https://example.com/")}
	calls, inserts := 0, 0
	var saved *domain.Content
	repo := websiteParentRepo(parent, &calls, &inserts)
	repo.getOrCreateByURLFn = func(_ context.Context, c *domain.Content, _ bool) (*domain.Content, bool, error) {
		inserts++
		saved = c
		return c, false, nil
	}
	id := 9
	got, err := newWebPageService(repo, client).CreateFromWebPage(context.Background(),
		portservices.CreateWebPageInput{URL: "https://www.example.com/post", ParentContentID: &id}, 1)
	require.NoError(t, err)
	require.NotNil(t, got.ParentContentID)
	assert.Equal(t, 9, *got.ParentContentID)
	require.NotNil(t, saved)
	assert.Equal(t, 1, calls, "the parent is validated with exactly one GetByID")
	assert.Equal(t, 1, inserts)
}

func TestCreateFromWebPage_PrefetchedSkipsTheNetwork(t *testing.T) {
	client := okSite(t)
	meta := okWebPage("https://example.com/post", "Imported")
	meta.Fetch.Status = domain.FetchStatusImported
	got, err := newWebPageService(&mockContentRepository{}, client).CreateFromWebPage(context.Background(),
		portservices.CreateWebPageInput{URL: "https://example.com/post", Prefetched: &meta}, 1)
	require.NoError(t, err)
	assert.Equal(t, 0, client.calls)
	assert.Equal(t, "Imported", got.Name)
	assert.Equal(t, "IMPORTED", decodeStoredWebPage(t, got).FetchState.Status)
}

func TestCreateFromWebPage_RolesValidatedAndEmptyStoredAsEmptyList(t *testing.T) {
	t.Run("unknown role", func(t *testing.T) {
		_, err := newWebPageService(&mockContentRepository{}, okSite(t)).CreateFromWebPage(context.Background(),
			portservices.CreateWebPageInput{URL: "https://example.com/p", Roles: []domain.WebPageRole{"NEWS"}}, 1)
		require.ErrorIs(t, err, domain.ErrInvalidInput)
	})
	for _, in := range [][]domain.WebPageRole{nil, {}} {
		t.Run(fmt.Sprintf("empty %v", in), func(t *testing.T) {
			got, err := newWebPageService(&mockContentRepository{}, okSite(t)).CreateFromWebPage(context.Background(),
				portservices.CreateWebPageInput{URL: "https://example.com/p", Roles: in}, 1)
			require.NoError(t, err)
			stored := decodeStoredWebPage(t, got)
			assert.NotNil(t, stored.Roles)
			assert.Empty(t, stored.Roles)
		})
	}
}

func TestCreateFromWebPage_ExistingURLKeepsItsParent(t *testing.T) {
	client := okSite(t)
	existing := &domain.Content{ID: 5, ContentType: domain.ContentTypeWebPage}
	calls := 0
	repo := &mockContentRepository{
		getByURLFn: func(_ context.Context, _ string) (*domain.Content, error) { return existing, nil },
		getByIDFn: func(_ context.Context, _ int) (*domain.Content, error) {
			calls++
			return nil, domain.ErrNotFound
		},
	}
	id := 9
	got, err := newWebPageService(repo, client).CreateFromWebPage(context.Background(),
		portservices.CreateWebPageInput{URL: "https://example.com/post", ParentContentID: &id}, 1)
	require.ErrorIs(t, err, domain.ErrAlreadyExists)
	assert.Equal(t, 5, got.ID)
	assert.Nil(t, got.ParentContentID)
	assert.Equal(t, 0, calls)
	assert.Equal(t, 0, client.calls)
}
