package services_test

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
)

type mockBookSearchClient struct {
	searchFn func(ctx context.Context, query string, page int) (*portservices.BookSearchPage, error)
	calls    int
}

func (m *mockBookSearchClient) SearchBooks(ctx context.Context, query string, page int) (*portservices.BookSearchPage, error) {
	m.calls++
	return m.searchFn(ctx, query, page)
}

type mockBookTrendingClient struct {
	trendingFn func(ctx context.Context, window domain.TrendingWindow, page int) (*portservices.BookSearchPage, error)
}

func (m *mockBookTrendingClient) TrendingBooks(ctx context.Context, window domain.TrendingWindow, page int) (*portservices.BookSearchPage, error) {
	return m.trendingFn(ctx, window, page)
}

type mockBookISBNClient struct {
	resolveFn func(ctx context.Context, isbn string) (string, error)
}

func (m *mockBookISBNClient) ResolveISBN(ctx context.Context, isbn string) (string, error) {
	return m.resolveFn(ctx, isbn)
}

func eastOfEden() portservices.BookSearchResult {
	return portservices.BookSearchResult{
		WorkKey:    "OL23166W",
		Title:      "East of Eden",
		AuthorName: []string{"John Steinbeck"},
	}
}

func singleResultSearch(t *testing.T, workKey string, result portservices.BookSearchResult) *mockBookSearchClient {
	return &mockBookSearchClient{searchFn: func(ctx context.Context, query string, page int) (*portservices.BookSearchPage, error) {
		assert.Equal(t, `key:"/works/`+workKey+`"`, query)
		assert.Equal(t, 1, page)
		return &portservices.BookSearchPage{Items: []portservices.BookSearchResult{result}}, nil
	}}
}

func TestCreateFromBook_Success(t *testing.T) {
	bs := singleResultSearch(t, "OL23166W", eastOfEden())
	var saved *domain.Content
	repo := &mockContentRepository{
		getByURLFn: func(ctx context.Context, url string) (*domain.Content, error) {
			assert.Equal(t, "https://openlibrary.org/works/OL23166W", url)
			return nil, domain.ErrNotFound
		},
		getOrCreateByURLFn: func(ctx context.Context, c *domain.Content, refresh bool) (*domain.Content, bool, error) {
			assert.True(t, refresh)
			saved = c
			return c, false, nil
		},
	}
	svc := services.NewContentService(repo, nil, nil, services.WithBookSearch(bs))

	got, err := svc.CreateFromBook(context.Background(), "https://openlibrary.org/works/OL23166W", 7)
	require.NoError(t, err)
	assert.Equal(t, domain.ContentTypeBook, got.ContentType)
	assert.Equal(t, "East of Eden", got.Name)
	require.NotNil(t, saved.URL)
	assert.Equal(t, "https://openlibrary.org/works/OL23166W", *saved.URL)
	assert.Equal(t, 7, saved.AddedByUserID)

	var shaped struct {
		WorkKey    string   `json:"workKey"`
		AuthorName []string `json:"authorName"`
	}
	require.NoError(t, json.Unmarshal(saved.Response, &shaped))
	assert.Equal(t, "OL23166W", shaped.WorkKey)
	assert.Equal(t, []string{"John Steinbeck"}, shaped.AuthorName)
}

func TestCreateFromBook_DuplicateSkipsFetch(t *testing.T) {
	existing := &domain.Content{ID: 5, Name: "East of Eden"}
	bs := &mockBookSearchClient{searchFn: func(ctx context.Context, query string, page int) (*portservices.BookSearchPage, error) {
		t.Fatal("must not search for existing book")
		return nil, nil
	}}
	repo := &mockContentRepository{getByURLFn: func(ctx context.Context, url string) (*domain.Content, error) {
		assert.Equal(t, "https://openlibrary.org/works/OL23166W", url)
		return existing, nil
	}}
	svc := services.NewContentService(repo, nil, nil, services.WithBookSearch(bs))
	got, err := svc.CreateFromBook(context.Background(), "https://openlibrary.org/works/OL23166W", 1)
	assert.ErrorIs(t, err, domain.ErrAlreadyExists)
	assert.Same(t, existing, got)
	assert.Equal(t, 0, bs.calls)
}

func TestCreateFromBook_DistinctWorkKeysNeverCollide(t *testing.T) {
	eastOfEdenKey := "OL23166W"
	waywardBusKey := "OL82563W"
	results := map[string]portservices.BookSearchResult{
		eastOfEdenKey: eastOfEden(),
		waywardBusKey: {WorkKey: waywardBusKey, Title: "The Wayward Bus", AuthorName: []string{"John Steinbeck"}},
	}
	bs := &mockBookSearchClient{searchFn: func(ctx context.Context, query string, page int) (*portservices.BookSearchPage, error) {
		for key, r := range results {
			if query == `key:"/works/`+key+`"` {
				return &portservices.BookSearchPage{Items: []portservices.BookSearchResult{r}}, nil
			}
		}
		return &portservices.BookSearchPage{}, nil
	}}

	seenGetByURL := map[string]bool{}
	var savedURLs []string
	repo := &mockContentRepository{
		getByURLFn: func(ctx context.Context, url string) (*domain.Content, error) {
			if seenGetByURL[url] {
				t.Fatalf("GetByURL called twice for %s", url)
			}
			seenGetByURL[url] = true
			return nil, domain.ErrNotFound
		},
		getOrCreateByURLFn: func(ctx context.Context, c *domain.Content, refresh bool) (*domain.Content, bool, error) {
			savedURLs = append(savedURLs, *c.URL)
			return c, false, nil
		},
	}
	svc := services.NewContentService(repo, nil, nil, services.WithBookSearch(bs))

	got1, err := svc.CreateFromBook(context.Background(), "https://openlibrary.org/works/"+eastOfEdenKey, 1)
	require.NoError(t, err)
	got2, err := svc.CreateFromBook(context.Background(), "https://openlibrary.org/works/"+waywardBusKey, 1)
	require.NoError(t, err)

	assert.Equal(t, "East of Eden", got1.Name)
	assert.Equal(t, "The Wayward Bus", got2.Name)
	require.Len(t, savedURLs, 2)
	assert.Equal(t, "https://openlibrary.org/works/OL23166W", savedURLs[0])
	assert.Equal(t, "https://openlibrary.org/works/OL82563W", savedURLs[1])
	assert.NotEqual(t, savedURLs[0], savedURLs[1])
}

func TestCreateFromBook_RawISBNResolvesThenFollowsWorkKeyPath(t *testing.T) {
	bi := &mockBookISBNClient{resolveFn: func(ctx context.Context, isbn string) (string, error) {
		assert.Equal(t, "9780434740024", isbn)
		return "OL23166W", nil
	}}
	bs := singleResultSearch(t, "OL23166W", eastOfEden())
	repo := &mockContentRepository{
		getByURLFn: func(ctx context.Context, url string) (*domain.Content, error) {
			assert.Equal(t, "https://openlibrary.org/works/OL23166W", url)
			return nil, domain.ErrNotFound
		},
	}
	svc := services.NewContentService(repo, nil, nil, services.WithBookSearch(bs), services.WithBookISBN(bi))

	got, err := svc.CreateFromBook(context.Background(), "9780434740024", 1)
	require.NoError(t, err)
	assert.Equal(t, "East of Eden", got.Name)
	require.NotNil(t, got.URL)
	assert.Equal(t, "https://openlibrary.org/works/OL23166W", *got.URL)
}

func TestCreateFromBook_UnknownISBN(t *testing.T) {
	bi := &mockBookISBNClient{resolveFn: func(ctx context.Context, isbn string) (string, error) {
		return "", domain.ErrNotFound
	}}
	svc := services.NewContentService(&mockContentRepository{}, nil, nil, services.WithBookSearch(&mockBookSearchClient{}), services.WithBookISBN(bi))
	_, err := svc.CreateFromBook(context.Background(), "9780434740024", 1)
	assert.ErrorIs(t, err, domain.ErrNotFound)
}

func TestCreateFromBook_AdapterErrorIsGeneric(t *testing.T) {
	bs := &mockBookSearchClient{searchFn: func(ctx context.Context, query string, page int) (*portservices.BookSearchPage, error) {
		return nil, errors.New("secret upstream detail Bearer abc")
	}}
	repo := &mockContentRepository{getByURLFn: func(ctx context.Context, url string) (*domain.Content, error) { return nil, domain.ErrNotFound }}
	svc := services.NewContentService(repo, nil, nil, services.WithBookSearch(bs))
	_, err := svc.CreateFromBook(context.Background(), "https://openlibrary.org/works/OL23166W", 1)
	require.Error(t, err)
	assert.Equal(t, "failed to fetch book metadata", err.Error())
}

func TestCreateFromBook_NilBookSearchClient(t *testing.T) {
	svc := services.NewContentService(&mockContentRepository{}, nil, nil)
	_, err := svc.CreateFromBook(context.Background(), "https://openlibrary.org/works/OL23166W", 1)
	require.Error(t, err)
	assert.ErrorIs(t, err, services.ErrBookClientUnavailable)
	assert.NotEqual(t, "failed to fetch book metadata", err.Error())
}

func TestCreateFromBook_InvalidInput(t *testing.T) {
	svc := services.NewContentService(&mockContentRepository{}, nil, nil, services.WithBookSearch(&mockBookSearchClient{}))
	_, err := svc.CreateFromBook(context.Background(), "https://example.com/nope", 1)
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
}

func TestCreateFromBook_MissingAuthorNameNoPanic(t *testing.T) {
	result := portservices.BookSearchResult{WorkKey: "OL1W", Title: "Mystery Book"} // AuthorName is nil
	bs := singleResultSearch(t, "OL1W", result)
	var saved *domain.Content
	repo := &mockContentRepository{
		getByURLFn: func(ctx context.Context, url string) (*domain.Content, error) { return nil, domain.ErrNotFound },
		getOrCreateByURLFn: func(ctx context.Context, c *domain.Content, refresh bool) (*domain.Content, bool, error) {
			saved = c
			return c, false, nil
		},
	}
	svc := services.NewContentService(repo, nil, nil, services.WithBookSearch(bs))

	got, err := svc.CreateFromBook(context.Background(), "https://openlibrary.org/works/OL1W", 1)
	require.NoError(t, err)
	assert.Equal(t, "Mystery Book", got.Name)

	var shaped struct {
		AuthorName []string `json:"authorName"`
	}
	require.NoError(t, json.Unmarshal(saved.Response, &shaped))
	assert.NotNil(t, shaped.AuthorName)
	assert.Empty(t, shaped.AuthorName)
}

func TestSearchBooks(t *testing.T) {
	bs := &mockBookSearchClient{searchFn: func(ctx context.Context, query string, page int) (*portservices.BookSearchPage, error) {
		assert.Equal(t, "steinbeck", query)
		assert.Equal(t, 1, page)
		return &portservices.BookSearchPage{Items: []portservices.BookSearchResult{eastOfEden()}}, nil
	}}
	svc := services.NewContentService(&mockContentRepository{}, nil, nil, services.WithBookSearch(bs))
	page, err := svc.SearchBooks(context.Background(), "  steinbeck  ", 0)
	require.NoError(t, err)
	require.Len(t, page.Items, 1)
}

func TestSearchBooks_NilClient(t *testing.T) {
	svc := services.NewContentService(&mockContentRepository{}, nil, nil)
	_, err := svc.SearchBooks(context.Background(), "steinbeck", 1)
	assert.ErrorIs(t, err, services.ErrBookClientUnavailable)
}

func TestSearchBooks_InvalidQuery(t *testing.T) {
	svc := services.NewContentService(&mockContentRepository{}, nil, nil, services.WithBookSearch(&mockBookSearchClient{}))
	_, err := svc.SearchBooks(context.Background(), "   ", 1)
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
}

func TestSearchBooks_InvalidPage(t *testing.T) {
	svc := services.NewContentService(&mockContentRepository{}, nil, nil, services.WithBookSearch(&mockBookSearchClient{}))
	_, err := svc.SearchBooks(context.Background(), "steinbeck", 501)
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
}

func TestTrendingBooks(t *testing.T) {
	bt := &mockBookTrendingClient{trendingFn: func(ctx context.Context, window domain.TrendingWindow, page int) (*portservices.BookSearchPage, error) {
		assert.Equal(t, domain.TrendingWindowWeek, window)
		assert.Equal(t, 1, page)
		return &portservices.BookSearchPage{Items: []portservices.BookSearchResult{eastOfEden()}}, nil
	}}
	svc := services.NewContentService(&mockContentRepository{}, nil, nil, services.WithBookTrending(bt))
	page, err := svc.TrendingBooks(context.Background(), "", 0)
	require.NoError(t, err)
	require.Len(t, page.Items, 1)
}

func TestTrendingBooks_NilClient(t *testing.T) {
	svc := services.NewContentService(&mockContentRepository{}, nil, nil)
	_, err := svc.TrendingBooks(context.Background(), domain.TrendingWindowDay, 1)
	assert.ErrorIs(t, err, services.ErrBookClientUnavailable)
}

func TestTrendingBooks_InvalidWindow(t *testing.T) {
	svc := services.NewContentService(&mockContentRepository{}, nil, nil, services.WithBookTrending(&mockBookTrendingClient{}))
	_, err := svc.TrendingBooks(context.Background(), domain.TrendingWindow("MONTH"), 1)
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
}

func TestResolveBookISBN(t *testing.T) {
	bi := &mockBookISBNClient{resolveFn: func(ctx context.Context, isbn string) (string, error) {
		assert.Equal(t, "9780434740024", isbn)
		return "OL23166W", nil
	}}
	bs := singleResultSearch(t, "OL23166W", eastOfEden())
	svc := services.NewContentService(&mockContentRepository{}, nil, nil, services.WithBookSearch(bs), services.WithBookISBN(bi))

	result, err := svc.ResolveBookISBN(context.Background(), "9780434740024")
	require.NoError(t, err)
	assert.Equal(t, "East of Eden", result.Title)
}

func TestResolveBookISBN_InvalidShape(t *testing.T) {
	svc := services.NewContentService(&mockContentRepository{}, nil, nil)
	_, err := svc.ResolveBookISBN(context.Background(), "not-an-isbn")
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
}

func TestResolveBookISBN_NotFound(t *testing.T) {
	bi := &mockBookISBNClient{resolveFn: func(ctx context.Context, isbn string) (string, error) {
		return "", domain.ErrNotFound
	}}
	svc := services.NewContentService(&mockContentRepository{}, nil, nil, services.WithBookSearch(&mockBookSearchClient{}), services.WithBookISBN(bi))
	_, err := svc.ResolveBookISBN(context.Background(), "9780434740024")
	assert.ErrorIs(t, err, domain.ErrNotFound)
}
