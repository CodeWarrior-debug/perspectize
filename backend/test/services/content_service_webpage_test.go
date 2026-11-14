package services_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
)

// mockWebPageClient implements portservices.WebPageClient for testing.
type mockWebPageClient struct {
	fetchFn func(ctx context.Context, url string) (domain.WebPageMeta, error)
	calls   int
	lastURL string
}

func (m *mockWebPageClient) Fetch(ctx context.Context, url string) (domain.WebPageMeta, error) {
	m.calls++
	m.lastURL = url
	return m.fetchFn(ctx, url)
}

func okWebPage(finalURL, title string) domain.WebPageMeta {
	meta := domain.WebPageMeta{
		SchemaVersion: domain.WebPageSchemaVersion,
		FinalURL:      finalURL,
		Domain:        "example.com",
		Fetch:         domain.WebPageFetch{Status: domain.FetchStatusOK},
	}
	if title != "" {
		meta.Title = &title
	}
	return meta
}

func newWebPageService(repo *mockContentRepository, client *mockWebPageClient) *services.ContentService {
	return services.NewContentService(repo, nil, nil, services.WithWebPageClient(client))
}

// storedWebPage decodes the webpage response a row was saved with.
type storedWebPage struct {
	Title      *string  `json:"title"`
	Roles      []string `json:"webPageRoles"`
	FetchState struct {
		Status string `json:"status"`
	} `json:"fetch"`
}

func decodeStoredWebPage(t *testing.T, content *domain.Content) storedWebPage {
	t.Helper()
	var stored storedWebPage
	require.NoError(t, json.Unmarshal(content.Response, &stored))
	return stored
}

func TestCreateFromWebPage_HappyPathStoresTitleCanonicalURLAndMeta(t *testing.T) {
	client := &mockWebPageClient{fetchFn: func(_ context.Context, _ string) (domain.WebPageMeta, error) {
		return okWebPage("https://arxiv.org/abs/1706.03762", "Attention Is All You Need"), nil
	}}
	var saved *domain.Content
	lookups, writes := 0, 0
	repo := &mockContentRepository{
		getByURLFn: func(_ context.Context, _ string) (*domain.Content, error) {
			lookups++
			return nil, domain.ErrNotFound
		},
		getOrCreateByURLFn: func(_ context.Context, c *domain.Content, refresh bool) (*domain.Content, bool, error) {
			writes++
			assert.False(t, refresh, "first write wins: a concurrent insert must not overwrite stored roles")
			saved = c
			return c, false, nil
		},
	}

	svc := newWebPageService(repo, client)
	got, err := svc.CreateFromWebPage(context.Background(), "https://www.arxiv.org/abs/1706.03762?utm_source=x", nil, 7)
	require.NoError(t, err)
	// Query budget: one dedupe lookup and one upsert, nothing repeated.
	assert.Equal(t, 1, lookups)
	assert.Equal(t, 1, writes)
	assert.Equal(t, 1, client.calls)

	assert.Equal(t, "https://arxiv.org/abs/1706.03762", client.lastURL, "the fetch uses the canonical URL")
	assert.Equal(t, domain.ContentTypeWebPage, got.ContentType)
	assert.Equal(t, "Attention Is All You Need", got.Name)
	require.NotNil(t, got.URL)
	assert.Equal(t, "https://arxiv.org/abs/1706.03762", *got.URL)
	assert.Equal(t, 7, got.AddedByUserID)

	require.NotNil(t, saved)
	stored := decodeStoredWebPage(t, saved)
	require.NotNil(t, stored.Title)
	assert.Equal(t, "Attention Is All You Need", *stored.Title)
	assert.Equal(t, "OK", stored.FetchState.Status)
}

func TestCreateFromWebPage_BlockedFetchStillCreatesRowWithHostPathName(t *testing.T) {
	client := &mockWebPageClient{fetchFn: func(_ context.Context, _ string) (domain.WebPageMeta, error) {
		meta := okWebPage("https://example.com/private/post", "")
		meta.Fetch.Status = domain.FetchStatusBlocked
		code := 403
		meta.Fetch.HTTPStatus = &code
		return meta, nil
	}}
	repo := &mockContentRepository{}

	got, err := newWebPageService(repo, client).CreateFromWebPage(context.Background(), "https://example.com/private/post", nil, 1)
	require.NoError(t, err)

	assert.Equal(t, "example.com/private/post", got.Name, "no title falls back to host + path")
	stored := decodeStoredWebPage(t, got)
	assert.Equal(t, "BLOCKED", stored.FetchState.Status)
}

func TestCreateFromWebPage_BlockedAddressOrInvalidURLCreatesNoRow(t *testing.T) {
	t.Run("blocked address", func(t *testing.T) {
		client := &mockWebPageClient{fetchFn: func(_ context.Context, _ string) (domain.WebPageMeta, error) {
			return domain.WebPageMeta{}, fmt.Errorf("%w: refused", domain.ErrInvalidInput)
		}}
		inserts := 0
		repo := &mockContentRepository{getOrCreateByURLFn: func(_ context.Context, c *domain.Content, _ bool) (*domain.Content, bool, error) {
			inserts++
			return c, false, nil
		}}

		_, err := newWebPageService(repo, client).CreateFromWebPage(context.Background(), "http://127.0.0.1/", nil, 1)
		assert.ErrorIs(t, err, domain.ErrInvalidInput)
		assert.Equal(t, 0, inserts)
	})

	t.Run("invalid URL never reaches the fetch", func(t *testing.T) {
		client := &mockWebPageClient{fetchFn: func(_ context.Context, _ string) (domain.WebPageMeta, error) {
			t.Fatal("fetch must not run for an invalid URL")
			return domain.WebPageMeta{}, nil
		}}
		inserts := 0
		repo := &mockContentRepository{getOrCreateByURLFn: func(_ context.Context, c *domain.Content, _ bool) (*domain.Content, bool, error) {
			inserts++
			return c, false, nil
		}}

		_, err := newWebPageService(repo, client).CreateFromWebPage(context.Background(), "ftp://example.com/x", nil, 1)
		assert.ErrorIs(t, err, domain.ErrInvalidInput)
		assert.Equal(t, 0, client.calls)
		assert.Equal(t, 0, inserts)
	})
}

func TestCreateFromWebPage_ExistingCanonicalURLSkipsFetchAndInsert(t *testing.T) {
	client := &mockWebPageClient{fetchFn: func(_ context.Context, _ string) (domain.WebPageMeta, error) {
		t.Fatal("an existing URL must not be fetched again")
		return domain.WebPageMeta{}, nil
	}}
	inserts := 0
	repo := &mockContentRepository{
		getByURLFn: func(_ context.Context, url string) (*domain.Content, error) {
			assert.Equal(t, "https://example.com/post", url)
			return &domain.Content{ID: 42, ContentType: domain.ContentTypeWebPage}, nil
		},
		getOrCreateByURLFn: func(_ context.Context, c *domain.Content, _ bool) (*domain.Content, bool, error) {
			inserts++
			return c, false, nil
		},
	}

	got, err := newWebPageService(repo, client).CreateFromWebPage(context.Background(), "https://example.com/post/", nil, 1)
	assert.ErrorIs(t, err, domain.ErrAlreadyExists)
	require.NotNil(t, got)
	assert.Equal(t, 42, got.ID)
	assert.Equal(t, 0, client.calls)
	assert.Equal(t, 0, inserts)
}

func TestCreateFromWebPage_DeclaredSameDomainCanonicalExistingReturnsThatRow(t *testing.T) {
	t.Run("same registrable domain: the declared URL is the key", func(t *testing.T) {
		client := &mockWebPageClient{fetchFn: func(_ context.Context, _ string) (domain.WebPageMeta, error) {
			meta := okWebPage("https://blog.example.com/post", "Post")
			meta.DeclaredCanonical = "https://example.com/post"
			return meta, nil
		}}
		var keyed string
		repo := &mockContentRepository{getOrCreateByURLFn: func(_ context.Context, c *domain.Content, _ bool) (*domain.Content, bool, error) {
			keyed = *c.URL
			return &domain.Content{ID: 9, URL: c.URL, ContentType: domain.ContentTypeWebPage}, true, nil
		}}

		got, err := newWebPageService(repo, client).CreateFromWebPage(context.Background(), "https://blog.example.com/post", nil, 1)
		assert.ErrorIs(t, err, domain.ErrAlreadyExists)
		assert.Equal(t, "https://example.com/post", keyed)
		require.NotNil(t, got)
		assert.Equal(t, 9, got.ID)
	})

	t.Run("cross-domain declared canonical is ignored", func(t *testing.T) {
		client := &mockWebPageClient{fetchFn: func(_ context.Context, _ string) (domain.WebPageMeta, error) {
			meta := okWebPage("https://example.com/a", "A")
			meta.DeclaredCanonical = "https://evil.test/a"
			return meta, nil
		}}
		var keyed string
		repo := &mockContentRepository{getOrCreateByURLFn: func(_ context.Context, c *domain.Content, _ bool) (*domain.Content, bool, error) {
			keyed = *c.URL
			return c, false, nil
		}}

		_, err := newWebPageService(repo, client).CreateFromWebPage(context.Background(), "https://example.com/a", nil, 1)
		require.NoError(t, err)
		assert.Equal(t, "https://example.com/a", keyed)
	})
}

func TestCreateFromWebPage_PageRolesStoredInOrderAndDeduped(t *testing.T) {
	tests := []struct {
		name  string
		input []domain.WebPageRole
		want  []string
	}{
		{"omitted is empty", nil, []string{}},
		{"empty list is empty", []domain.WebPageRole{}, []string{}},
		{"first pick is primary and keeps its place", []domain.WebPageRole{domain.WebPageRoleSessionTranscript, domain.WebPageRoleBlogPost}, []string{"SESSION_TRANSCRIPT", "BLOG_POST"}},
		{"duplicates collapse to first seen", []domain.WebPageRole{domain.WebPageRoleBlogPost, domain.WebPageRoleBlogPost, domain.WebPageRoleSessionTranscript, domain.WebPageRoleBlogPost}, []string{"BLOG_POST", "SESSION_TRANSCRIPT"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := &mockWebPageClient{fetchFn: func(_ context.Context, _ string) (domain.WebPageMeta, error) {
				return okWebPage("https://example.com/p", "P"), nil
			}}
			got, err := newWebPageService(&mockContentRepository{}, client).CreateFromWebPage(context.Background(), "https://example.com/p", tt.input, 1)
			require.NoError(t, err)
			assert.Equal(t, tt.want, decodeStoredWebPage(t, got).Roles)
		})
	}
}

func TestCreateFromWebPage_UnknownRoleIsInvalidInput(t *testing.T) {
	client := &mockWebPageClient{fetchFn: func(_ context.Context, _ string) (domain.WebPageMeta, error) {
		t.Fatal("an unknown role must be rejected before any fetch")
		return domain.WebPageMeta{}, nil
	}}

	_, err := newWebPageService(&mockContentRepository{}, client).CreateFromWebPage(context.Background(), "https://example.com/p",
		[]domain.WebPageRole{domain.WebPageRole("ARTICLE")}, 1)
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
	assert.Equal(t, 0, client.calls)
}

func TestPreviewWebPage_ReadsWithoutWriting(t *testing.T) {
	client := &mockWebPageClient{fetchFn: func(_ context.Context, _ string) (domain.WebPageMeta, error) {
		return okWebPage("https://example.com/p", "Preview me"), nil
	}}
	writes := 0
	repo := &mockContentRepository{
		createFn: func(_ context.Context, c *domain.Content) (*domain.Content, error) {
			writes++
			return c, nil
		},
		getOrCreateByURLFn: func(_ context.Context, c *domain.Content, _ bool) (*domain.Content, bool, error) {
			writes++
			return c, false, nil
		},
	}

	preview, err := newWebPageService(repo, client).PreviewWebPage(context.Background(), "https://example.com/p")
	require.NoError(t, err)
	require.NotNil(t, preview.Meta.Title)
	assert.Equal(t, "Preview me", *preview.Meta.Title)
	assert.Nil(t, preview.AlreadyExistsContentID)
	assert.Equal(t, 0, writes, "a preview never writes")
}

func TestPreviewWebPage_ReportsExistingRow(t *testing.T) {
	client := &mockWebPageClient{fetchFn: func(_ context.Context, _ string) (domain.WebPageMeta, error) {
		return okWebPage("https://example.com/p", "P"), nil
	}}
	repo := &mockContentRepository{getByURLFn: func(_ context.Context, url string) (*domain.Content, error) {
		if url == "https://example.com/p" {
			return &domain.Content{ID: 5, ContentType: domain.ContentTypeWebPage}, nil
		}
		return nil, domain.ErrNotFound
	}}

	preview, err := newWebPageService(repo, client).PreviewWebPage(context.Background(), "https://example.com/p")
	require.NoError(t, err)
	require.NotNil(t, preview.AlreadyExistsContentID)
	assert.Equal(t, 5, *preview.AlreadyExistsContentID)
}

func TestPreviewWebPage_InvalidAndBlockedErrors(t *testing.T) {
	blocked := &mockWebPageClient{fetchFn: func(_ context.Context, _ string) (domain.WebPageMeta, error) {
		return domain.WebPageMeta{}, fmt.Errorf("%w: refused", domain.ErrInvalidInput)
	}}
	_, err := newWebPageService(&mockContentRepository{}, blocked).PreviewWebPage(context.Background(), "https://example.com/p")
	assert.ErrorIs(t, err, domain.ErrInvalidInput)

	_, err = newWebPageService(&mockContentRepository{}, blocked).PreviewWebPage(context.Background(), "ftp://example.com/p")
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
}

func TestWebPage_UnconfiguredClientIsUnavailable(t *testing.T) {
	svc := services.NewContentService(&mockContentRepository{}, nil, nil)

	_, err := svc.CreateFromWebPage(context.Background(), "https://example.com/p", nil, 1)
	assert.True(t, errors.Is(err, services.ErrWebPageClientUnavailable))

	_, err = svc.PreviewWebPage(context.Background(), "https://example.com/p")
	assert.True(t, errors.Is(err, services.ErrWebPageClientUnavailable))
}
