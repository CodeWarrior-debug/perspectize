package openlibrary

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
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

// TestClient_SearchBooks_ParsesAuthorKey: the work's author_key list is parsed
// parallel to author_name, so the service can attach a key to each author.
func TestClient_SearchBooks_ParsesAuthorKey(t *testing.T) {
	c := newTestClient(t, serveFixture(t, "search_by_key_east_of_eden.json"))

	page, err := c.SearchBooks(context.Background(), `key:"/works/OL23166W"`, 1)
	require.NoError(t, err)
	require.NotEmpty(t, page.Items)
	item := page.Items[0]
	assert.Equal(t, []string{"John Steinbeck"}, item.AuthorName)
	assert.Equal(t, []string{"OL25788A"}, item.AuthorKey)
}

// TestClient_SearchBooks_NoAuthorKeyLeavesNil: fixtures recorded before
// author_key was requested still parse, with AuthorKey nil (not an empty slice
// that could be mistaken for a key-per-author list).
func TestClient_SearchBooks_NoAuthorKeyLeavesNil(t *testing.T) {
	c := newTestClient(t, serveFixture(t, "search_east_of_eden.json"))

	page, err := c.SearchBooks(context.Background(), "East of Eden Steinbeck", 1)
	require.NoError(t, err)
	require.NotEmpty(t, page.Items)
	assert.Nil(t, page.Items[0].AuthorKey)
}

// TestClient_RequestsAuthorKeyField: every search asks for author_key, using
// the exported Fields constant so the requested list and the test cannot drift.
func TestClient_RequestsAuthorKeyField(t *testing.T) {
	var gotFields string
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotFields = r.URL.Query().Get("fields")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"docs":[]}`))
	})

	_, err := c.SearchBooks(context.Background(), "x", 1)
	require.NoError(t, err)
	assert.Equal(t, Fields, gotFields)
	assert.Contains(t, strings.Split(gotFields, ","), "author_key")
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

// TestClient_ResolveISBN_EscapesPathInput asserts that reserved characters in
// the caller's ISBN string cannot add path segments, query params or fragments
// to the upstream request. The server records the raw (still-escaped) path.
func TestClient_ResolveISBN_EscapesPathInput(t *testing.T) {
	tests := []struct {
		name     string
		isbn     string
		wantPath string
	}{
		{"slash adds no segment", "978/evil", "/isbn/978%2Fevil.json"},
		{"traversal stays in one segment", "../search", "/isbn/..%2Fsearch.json"},
		{"question mark stays in path", "978?x=1", "/isbn/978%3Fx=1.json"},
		{"hash stays in path", "978#frag", "/isbn/978%23frag.json"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var gotRaw, gotQuery string
			c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
				gotRaw = r.URL.EscapedPath()
				gotQuery = r.URL.RawQuery
				w.WriteHeader(http.StatusNotFound)
			})

			_, err := c.ResolveISBN(context.Background(), tt.isbn)
			require.ErrorIs(t, err, domain.ErrNotFound)

			assert.Equal(t, tt.wantPath, gotRaw)
			assert.True(t, strings.HasPrefix(gotRaw, "/isbn/"))
			assert.Equal(t, 2, strings.Count(gotRaw, "/"), "path must keep exactly /isbn/<one segment>.json")
			assert.Empty(t, gotQuery)
		})
	}
}

func TestClient_TransportErrorSanitized(t *testing.T) {
	c := NewClient()
	c.baseURL = "http://127.0.0.1:1"
	_, err := c.SearchBooks(context.Background(), "x", 1)
	require.Error(t, err)
	assert.NotContains(t, err.Error(), "http://")
}

// TestClient_RequestsReadingLogFields: every search and trending call asks for
// the four reading-log counts, on the same single request (no extra HTTP call).
func TestClient_RequestsReadingLogFields(t *testing.T) {
	calls := 0
	var gotFields string
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		gotFields = r.URL.Query().Get("fields")
		serveFixture(t, "search_reading_log.json")(w, r)
	})
	_, err := c.SearchBooks(context.Background(), "east of eden", 1)
	require.NoError(t, err)

	assert.Equal(t, 1, calls, "reading-log counts ride the existing search call")
	fields := strings.Split(gotFields, ",")
	for _, f := range []string{"want_to_read_count", "currently_reading_count", "already_read_count", "readinglog_count"} {
		assert.Contains(t, fields, f)
	}
}

// TestClient_SearchBooks_ReadingLogNilVersusZero: a count Open Library reports
// as 0 stays a pointer to 0; a count it omits stays nil.
func TestClient_SearchBooks_ReadingLogNilVersusZero(t *testing.T) {
	c := newTestClient(t, serveFixture(t, "search_reading_log.json"))
	page, err := c.SearchBooks(context.Background(), "x", 1)
	require.NoError(t, err)
	require.Len(t, page.Items, 3)

	full := page.Items[0]
	require.NotNil(t, full.WantToReadCount)
	require.NotNil(t, full.CurrentlyReadingCount)
	require.NotNil(t, full.AlreadyReadCount)
	require.NotNil(t, full.ReadingLogCount)
	assert.Equal(t, []int{1189, 79, 153, 1421},
		[]int{*full.WantToReadCount, *full.CurrentlyReadingCount, *full.AlreadyReadCount, *full.ReadingLogCount})

	zero := page.Items[1]
	require.NotNil(t, zero.CurrentlyReadingCount, "an explicit 0 is a real value")
	assert.Equal(t, 0, *zero.CurrentlyReadingCount)
	require.NotNil(t, zero.AlreadyReadCount)
	assert.Equal(t, 0, *zero.AlreadyReadCount)

	missing := page.Items[2]
	assert.Nil(t, missing.WantToReadCount)
	assert.Nil(t, missing.CurrentlyReadingCount)
	assert.Nil(t, missing.AlreadyReadCount)
	assert.Nil(t, missing.ReadingLogCount)
}

// TestClient_TrendingBooks_ReadingLogMissingIsNil: trending shares the work shape, so
// an old trending fixture with no reading-log fields maps to nil, not 0.
func TestClient_TrendingBooks_ReadingLogMissingIsNil(t *testing.T) {
	c := newTestClient(t, serveFixture(t, "trending_weekly.json"))
	page, err := c.TrendingBooks(context.Background(), domain.TrendingWindowWeek, 1)
	require.NoError(t, err)
	require.NotEmpty(t, page.Items)
	assert.Nil(t, page.Items[0].WantToReadCount)
}
