package openlibrary

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func readFixture(t *testing.T, name string) []byte {
	t.Helper()
	b, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func newTestClient(t *testing.T, h http.HandlerFunc) *Client {
	t.Helper()
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	c := NewClient()
	c.baseURL = srv.URL
	return c
}

func serveFixture(t *testing.T, name string) http.HandlerFunc {
	body := readFixture(t, name)
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}
}

func TestClient_SearchBooks_EastOfEden(t *testing.T) {
	var gotPath string
	var gotParams url.Values
	fixture := serveFixture(t, "search_east_of_eden.json")
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotParams = r.URL.Query()
		fixture(w, r)
	})

	page, err := c.SearchBooks(context.Background(), "East of Eden Steinbeck", 1)
	require.NoError(t, err)

	assert.Equal(t, "/search.json", gotPath)
	assert.Equal(t, "East of Eden Steinbeck", gotParams.Get("q"))
	assert.Equal(t, "25", gotParams.Get("limit"))
	assert.Equal(t, "1", gotParams.Get("page"))
	assert.Equal(t, Fields, gotParams.Get("fields"))

	require.NotEmpty(t, page.Items)
	item := page.Items[0]
	assert.Equal(t, "OL23166W", item.WorkKey)
	assert.Equal(t, "East of Eden", item.Title)
	assert.Equal(t, []string{"John Steinbeck"}, item.AuthorName)
	require.NotNil(t, item.FirstPublishYear)
	assert.Equal(t, 1952, *item.FirstPublishYear)
	require.NotNil(t, item.PageCountMedian)
	assert.Equal(t, 611, *item.PageCountMedian)
}

func TestClient_TrendingBooks_Weekly(t *testing.T) {
	var gotPath string
	var gotParams url.Values
	fixture := serveFixture(t, "trending_weekly.json")
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotParams = r.URL.Query()
		fixture(w, r)
	})

	page, err := c.TrendingBooks(context.Background(), domain.TrendingWindowWeek, 1)
	require.NoError(t, err)

	assert.Equal(t, "/trending/weekly.json", gotPath)
	assert.Equal(t, "25", gotParams.Get("limit"))
	assert.Equal(t, "1", gotParams.Get("page"))
	assert.Equal(t, Fields, gotParams.Get("fields"))

	require.NotEmpty(t, page.Items)
	item := page.Items[0]
	assert.Equal(t, "OL17930368W", item.WorkKey)
	assert.Equal(t, "Atomic Habits", item.Title)
}

func TestClient_TrendingBooks_Daily(t *testing.T) {
	var gotPath string
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"works":[]}`))
	})

	_, err := c.TrendingBooks(context.Background(), domain.TrendingWindowDay, 1)
	require.NoError(t, err)
	assert.Equal(t, "/trending/daily.json", gotPath)
}

func TestClient_AcceptHeaderSet(t *testing.T) {
	var gotAccept string
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotAccept = r.Header.Get("Accept")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"docs":[]}`))
	})
	_, err := c.SearchBooks(context.Background(), "x", 1)
	require.NoError(t, err)
	assert.Equal(t, "application/json", gotAccept)
}

func TestClient_SearchBooks_ErrorsSanitized(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error":"boom"}`))
	})
	_, err := c.SearchBooks(context.Background(), "x", 1)
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrOpenLibraryAPI)
}

func TestClient_ResolveISBN_Found(t *testing.T) {
	var gotPath string
	fixture := serveFixture(t, "isbn_east_of_eden.json")
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		fixture(w, r)
	})

	workKey, err := c.ResolveISBN(context.Background(), "9780434740024")
	require.NoError(t, err)

	assert.Equal(t, "/isbn/9780434740024.json", gotPath)
	assert.Equal(t, "OL23166W", workKey)
}

func TestClient_ResolveISBN_NotFound(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	})

	_, err := c.ResolveISBN(context.Background(), "9780000000001")
	require.Error(t, err)
	assert.ErrorIs(t, err, domain.ErrNotFound)
}

func TestClient_TransportErrorSanitized(t *testing.T) {
	c := NewClient()
	c.baseURL = "http://127.0.0.1:1"
	_, err := c.SearchBooks(context.Background(), "x", 1)
	require.Error(t, err)
	assert.NotContains(t, err.Error(), "http://")
}
