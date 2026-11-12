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
		AuthorKey:  []string{"OL25788A"},
	}
}

// storedAuthor mirrors the stored response.authors element. The key is
// omitempty, so an absent key and a stored empty string both decode to "";
// absence is asserted on the raw map where it matters.
type storedAuthor struct {
	Name           string `json:"name"`
	OpenLibraryKey string `json:"openLibraryKey,omitempty"`
}

// createdBookResponse runs CreateFromBook for result and returns the stored
// response as a raw key map, so tests can assert both presence and absence.
func createdBookResponse(t *testing.T, result portservices.BookSearchResult) map[string]json.RawMessage {
	t.Helper()
	bs := singleResultSearch(t, result.WorkKey, result)
	var saved *domain.Content
	repo := &mockContentRepository{
		getByURLFn: func(ctx context.Context, url string) (*domain.Content, error) { return nil, domain.ErrNotFound },
		getOrCreateByURLFn: func(ctx context.Context, c *domain.Content, refresh bool) (*domain.Content, bool, error) {
			saved = c
			return c, false, nil
		},
	}
	svc := services.NewContentService(repo, nil, nil, services.WithBookSearch(bs))
	_, err := svc.CreateFromBook(context.Background(), "https://openlibrary.org/works/"+result.WorkKey, 1)
	require.NoError(t, err)
	var raw map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(saved.Response, &raw))
	return raw
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
		WorkKey string         `json:"workKey"`
		Authors []storedAuthor `json:"authors"`
	}
	require.NoError(t, json.Unmarshal(saved.Response, &shaped))
	assert.Equal(t, "OL23166W", shaped.WorkKey)
	assert.Equal(t, []storedAuthor{{Name: "John Steinbeck", OpenLibraryKey: "OL25788A"}}, shaped.Authors)

	var raw map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(saved.Response, &raw))
	assert.NotContains(t, raw, "authorName", "authorName is replaced by the structured authors list")
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

	var raw map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(saved.Response, &raw))
	assert.JSONEq(t, `[]`, string(raw["authors"]), "a missing author marshals to [], never null")
}

// TestCreateFromBook_AuthorKeysPairedByIndex: equal-length name and key lists
// pair up by index, so each author carries its own key.
func TestCreateFromBook_AuthorKeysPairedByIndex(t *testing.T) {
	result := portservices.BookSearchResult{
		WorkKey:    "OL9W",
		Title:      "Good Omens",
		AuthorName: []string{"Terry Pratchett", "Neil Gaiman"},
		AuthorKey:  []string{"OL1A", "OL2A"},
	}
	raw := createdBookResponse(t, result)
	var authors []storedAuthor
	require.NoError(t, json.Unmarshal(raw["authors"], &authors))
	assert.Equal(t, []storedAuthor{
		{Name: "Terry Pratchett", OpenLibraryKey: "OL1A"},
		{Name: "Neil Gaiman", OpenLibraryKey: "OL2A"},
	}, authors)
}

// TestCreateFromBook_MismatchedAuthorKeysDropped: when the key list is not the
// same length as the name list, names are kept and no key is attached (a key
// on the wrong author is worse than none).
func TestCreateFromBook_MismatchedAuthorKeysDropped(t *testing.T) {
	result := portservices.BookSearchResult{
		WorkKey:    "OL9W",
		Title:      "Good Omens",
		AuthorName: []string{"Terry Pratchett", "Neil Gaiman"},
		AuthorKey:  []string{"OL1A", "OL2A", "OL3A"},
	}
	raw := createdBookResponse(t, result)
	var authors []map[string]any
	require.NoError(t, json.Unmarshal(raw["authors"], &authors))
	require.Len(t, authors, 2)
	for _, a := range authors {
		assert.NotContains(t, a, "openLibraryKey")
	}
	assert.Equal(t, "Terry Pratchett", authors[0]["name"])
	assert.Equal(t, "Neil Gaiman", authors[1]["name"])
}

// TestCreateFromBook_NoAuthorKeysNamesOnly: a search result with no author_key
// at all still stores the names, with no openLibraryKey on any author.
func TestCreateFromBook_NoAuthorKeysNamesOnly(t *testing.T) {
	result := portservices.BookSearchResult{
		WorkKey:    "OL9W",
		Title:      "Good Omens",
		AuthorName: []string{"Terry Pratchett"},
	}
	raw := createdBookResponse(t, result)
	var authors []map[string]any
	require.NoError(t, json.Unmarshal(raw["authors"], &authors))
	require.Len(t, authors, 1)
	assert.Equal(t, map[string]any{"name": "Terry Pratchett"}, authors[0])
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

type mockBookWorkClient struct {
	fetchFn      func(ctx context.Context, workKey string) (*portservices.BookWork, error)
	editionFn    func(ctx context.Context, editionKey string) (string, error)
	fetchCalls   int
	editionCalls int
}

func (m *mockBookWorkClient) FetchWork(ctx context.Context, workKey string) (*portservices.BookWork, error) {
	m.fetchCalls++
	return m.fetchFn(ctx, workKey)
}

func (m *mockBookWorkClient) ResolveEdition(ctx context.Context, editionKey string) (string, error) {
	m.editionCalls++
	return m.editionFn(ctx, editionKey)
}

// storedBookRepo is an in-memory content repo: one row, found by URL, so a
// second add of the same work sees the first add's row.
func storedBookRepo(t *testing.T) (*mockContentRepository, **domain.Content) {
	t.Helper()
	var stored *domain.Content
	repo := &mockContentRepository{
		getByURLFn: func(ctx context.Context, url string) (*domain.Content, error) {
			if stored != nil && stored.URL != nil && *stored.URL == url {
				return stored, nil
			}
			return nil, domain.ErrNotFound
		},
		getOrCreateByURLFn: func(ctx context.Context, c *domain.Content, refresh bool) (*domain.Content, bool, error) {
			stored = c
			return c, false, nil
		},
	}
	return repo, &stored
}

func rawBookResponseOf(t *testing.T, c *domain.Content) map[string]json.RawMessage {
	t.Helper()
	require.NotNil(t, c)
	var raw map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(c.Response, &raw))
	return raw
}

func TestCreateFromBook_StoresWorkDescriptionAndRelatedWorks(t *testing.T) {
	bs := singleResultSearch(t, "OL23166W", eastOfEden())
	bw := &mockBookWorkClient{fetchFn: func(ctx context.Context, workKey string) (*portservices.BookWork, error) {
		assert.Equal(t, "OL23166W", workKey)
		return &portservices.BookWork{
			Description:  "Steinbeck considered East of Eden to be his masterpiece.",
			RelatedWorks: []portservices.BookRelatedWork{{Title: "East of Eden 1/2", URL: "https://openlibrary.org/works/OL17811975W"}},
		}, nil
	}}
	var saved *domain.Content
	repo := &mockContentRepository{
		getByURLFn: func(ctx context.Context, url string) (*domain.Content, error) { return nil, domain.ErrNotFound },
		getOrCreateByURLFn: func(ctx context.Context, c *domain.Content, refresh bool) (*domain.Content, bool, error) {
			saved = c
			return c, false, nil
		},
	}
	svc := services.NewContentService(repo, nil, nil, services.WithBookSearch(bs), services.WithBookWork(bw))

	_, err := svc.CreateFromBook(context.Background(), "https://openlibrary.org/works/OL23166W", 1)
	require.NoError(t, err)
	assert.Equal(t, 1, bw.fetchCalls)

	raw := rawBookResponseOf(t, saved)
	assert.JSONEq(t, `"Steinbeck considered East of Eden to be his masterpiece."`, string(raw["description"]))
	assert.JSONEq(t, `[{"title":"East of Eden 1/2","url":"https://openlibrary.org/works/OL17811975W"}]`, string(raw["relatedWorks"]))
}

func TestCreateFromBook_WorkURLOmitsResolvedFromISBN(t *testing.T) {
	bs := singleResultSearch(t, "OL23166W", eastOfEden())
	bw := &mockBookWorkClient{fetchFn: func(ctx context.Context, workKey string) (*portservices.BookWork, error) {
		return &portservices.BookWork{RelatedWorks: []portservices.BookRelatedWork{}}, nil
	}}
	repo, saved := storedBookRepo(t)
	svc := services.NewContentService(repo, nil, nil, services.WithBookSearch(bs), services.WithBookWork(bw))

	got, err := svc.CreateFromBook(context.Background(), "https://openlibrary.org/works/OL23166W", 1)
	require.NoError(t, err)
	assert.Same(t, *saved, got)
	assert.NotContains(t, rawBookResponseOf(t, got), "resolvedFromISBN")
}

func TestCreateFromBook_HyphenatedISBNStoresNormalisedValue(t *testing.T) {
	bi := &mockBookISBNClient{resolveFn: func(ctx context.Context, isbn string) (string, error) {
		assert.Equal(t, "9780434740024", isbn, "resolver receives the normalised ISBN")
		return "OL23166W", nil
	}}
	bs := singleResultSearch(t, "OL23166W", eastOfEden())
	repo, saved := storedBookRepo(t)
	svc := services.NewContentService(repo, nil, nil, services.WithBookSearch(bs), services.WithBookISBN(bi))

	_, err := svc.CreateFromBook(context.Background(), "978-0-434-74002-4", 1)
	require.NoError(t, err)
	raw := rawBookResponseOf(t, *saved)
	assert.JSONEq(t, `"9780434740024"`, string(raw["resolvedFromISBN"]))
	assert.Equal(t, "https://openlibrary.org/works/OL23166W", *(*saved).URL)
}

func TestCreateFromBook_EditionLinkResolvesThenDedupesOnWorkURL(t *testing.T) {
	bi := &mockBookISBNClient{resolveFn: func(ctx context.Context, isbn string) (string, error) {
		t.Fatal("an edition link must not call the ISBN resolver")
		return "", nil
	}}
	bw := &mockBookWorkClient{
		editionFn: func(ctx context.Context, editionKey string) (string, error) {
			assert.Equal(t, "OL22640535M", editionKey)
			return "OL23166W", nil
		},
		fetchFn: func(ctx context.Context, workKey string) (*portservices.BookWork, error) {
			return &portservices.BookWork{RelatedWorks: []portservices.BookRelatedWork{}}, nil
		},
	}
	bs := singleResultSearch(t, "OL23166W", eastOfEden())
	repo, saved := storedBookRepo(t)
	svc := services.NewContentService(repo, nil, nil, services.WithBookSearch(bs), services.WithBookWork(bw), services.WithBookISBN(bi))

	first, err := svc.CreateFromBook(context.Background(), "https://openlibrary.org/books/OL22640535M/East_of_Eden", 1)
	require.NoError(t, err)
	assert.Equal(t, "https://openlibrary.org/works/OL23166W", *(*saved).URL)
	assert.NotContains(t, rawBookResponseOf(t, first), "resolvedFromISBN", "an edition link is not an ISBN input")

	second, err := svc.CreateFromBook(context.Background(), "https://openlibrary.org/works/OL23166W", 1)
	assert.ErrorIs(t, err, domain.ErrAlreadyExists)
	assert.Same(t, first, second)
	assert.Equal(t, 1, bs.calls, "the duplicate costs no second search call")
	assert.Equal(t, 1, bw.editionCalls)
}

func TestCreateFromBook_EditionNotFound(t *testing.T) {
	bw := &mockBookWorkClient{editionFn: func(ctx context.Context, editionKey string) (string, error) {
		return "", domain.ErrNotFound
	}}
	svc := services.NewContentService(&mockContentRepository{}, nil, nil, services.WithBookSearch(&mockBookSearchClient{}), services.WithBookWork(bw))
	_, err := svc.CreateFromBook(context.Background(), "https://openlibrary.org/books/OL22640535M", 1)
	assert.ErrorIs(t, err, domain.ErrNotFound)
	assert.NotErrorIs(t, err, services.ErrBookClientUnavailable)
}

func TestCreateFromBook_EditionResolveErrorIsGeneric(t *testing.T) {
	bw := &mockBookWorkClient{editionFn: func(ctx context.Context, editionKey string) (string, error) {
		return "", errors.New("secret upstream detail Bearer abc")
	}}
	svc := services.NewContentService(&mockContentRepository{}, nil, nil, services.WithBookSearch(&mockBookSearchClient{}), services.WithBookWork(bw))
	_, err := svc.CreateFromBook(context.Background(), "https://openlibrary.org/books/OL22640535M", 1)
	require.Error(t, err)
	assert.Equal(t, "failed to resolve edition", err.Error())
}

func TestCreateFromBook_EditionLinkWithoutWorkClient(t *testing.T) {
	svc := services.NewContentService(&mockContentRepository{}, nil, nil, services.WithBookSearch(&mockBookSearchClient{}))
	_, err := svc.CreateFromBook(context.Background(), "https://openlibrary.org/books/OL22640535M", 1)
	assert.ErrorIs(t, err, services.ErrBookClientUnavailable)
}

// TestCreateFromBook_WorkFetchFailureStillCreates: the work record is best
// effort. A failing fetch never blocks the add; the row has no description
// and an empty relatedWorks list.
func TestCreateFromBook_WorkFetchFailureStillCreates(t *testing.T) {
	bw := &mockBookWorkClient{fetchFn: func(ctx context.Context, workKey string) (*portservices.BookWork, error) {
		return nil, errors.New("upstream 500")
	}}
	bs := singleResultSearch(t, "OL23166W", eastOfEden())
	repo, saved := storedBookRepo(t)
	svc := services.NewContentService(repo, nil, nil, services.WithBookSearch(bs), services.WithBookWork(bw))

	got, err := svc.CreateFromBook(context.Background(), "https://openlibrary.org/works/OL23166W", 1)
	require.NoError(t, err)
	assert.Equal(t, "East of Eden", got.Name)
	assert.NotNil(t, *saved)

	raw := rawBookResponseOf(t, got)
	assert.NotContains(t, raw, "description")
	assert.JSONEq(t, `[]`, string(raw["relatedWorks"]))
}

// TestCreateFromBook_NoWorkClientStillCreates: a service built without
// WithBookWork adds the book the same way as a failed work fetch, not as
// ErrBookClientUnavailable.
func TestCreateFromBook_NoWorkClientStillCreates(t *testing.T) {
	bs := singleResultSearch(t, "OL23166W", eastOfEden())
	repo, _ := storedBookRepo(t)
	svc := services.NewContentService(repo, nil, nil, services.WithBookSearch(bs))

	got, err := svc.CreateFromBook(context.Background(), "https://openlibrary.org/works/OL23166W", 1)
	require.NoError(t, err)
	raw := rawBookResponseOf(t, got)
	assert.NotContains(t, raw, "description")
	assert.JSONEq(t, `[]`, string(raw["relatedWorks"]))
}

func TestResolveBookISBN_HyphenatedISBN(t *testing.T) {
	bi := &mockBookISBNClient{resolveFn: func(ctx context.Context, isbn string) (string, error) {
		assert.Equal(t, "9780434740024", isbn)
		return "OL23166W", nil
	}}
	bs := singleResultSearch(t, "OL23166W", eastOfEden())
	svc := services.NewContentService(&mockContentRepository{}, nil, nil, services.WithBookSearch(bs), services.WithBookISBN(bi))

	result, err := svc.ResolveBookISBN(context.Background(), "978-0-434-74002-4")
	require.NoError(t, err)
	assert.Equal(t, "East of Eden", result.Title)
}

func TestResolveBookISBN_NotFound(t *testing.T) {
	bi := &mockBookISBNClient{resolveFn: func(ctx context.Context, isbn string) (string, error) {
		return "", domain.ErrNotFound
	}}
	svc := services.NewContentService(&mockContentRepository{}, nil, nil, services.WithBookSearch(&mockBookSearchClient{}), services.WithBookISBN(bi))
	_, err := svc.ResolveBookISBN(context.Background(), "9780434740024")
	assert.ErrorIs(t, err, domain.ErrNotFound)
}
