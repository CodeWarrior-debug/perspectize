package tmdb

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testToken = "SECRET-TOKEN-XYZ"

func newTestClient(t *testing.T, h http.HandlerFunc) *Client {
	t.Helper()
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	c := NewClient(testToken)
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

func TestGetMovie_Success(t *testing.T) {
	var gotAuth, gotPath, gotAppend string
	fixture := serveFixture(t, "movie_603.json")
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotPath = r.URL.Path
		gotAppend = r.URL.Query().Get("append_to_response")
		fixture(w, r)
	})
	meta, err := c.GetMovie(context.Background(), 603)
	if err != nil {
		t.Fatal(err)
	}
	if meta.TMDBID != 603 || meta.Title != "The Matrix" {
		t.Errorf("meta = %+v", meta)
	}
	if gotAuth != "Bearer "+testToken {
		t.Errorf("auth header = %q", gotAuth)
	}
	if gotPath != "/movie/603" {
		t.Errorf("path = %q", gotPath)
	}
	if gotAppend != "credits,release_dates,external_ids,keywords" {
		t.Errorf("append_to_response = %q", gotAppend)
	}
}

func TestGetMovie_Errors(t *testing.T) {
	for _, status := range []int{401, 404, 500} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(status)
				_, _ = w.Write([]byte(`{"status_message":"upstream says ` + testToken + `"}`))
			})
			_, err := c.GetMovie(context.Background(), 1)
			if err == nil {
				t.Fatal("expected error")
			}
			if status == 404 {
				if !errors.Is(err, domain.ErrNotFound) {
					t.Errorf("want ErrNotFound, got %v", err)
				}
			} else if errors.Is(err, domain.ErrNotFound) {
				t.Errorf("status %d must not map to ErrNotFound", status)
			}
			if strings.Contains(err.Error(), testToken) || strings.Contains(err.Error(), "upstream says") {
				t.Errorf("error leaks token or upstream body: %v", err)
			}
		})
	}
}

func TestGetMovie_TransportErrorSanitized(t *testing.T) {
	c := NewClient(testToken)
	c.baseURL = "http://127.0.0.1:1/3?api_key=" + testToken
	_, err := c.GetMovie(context.Background(), 1)
	if err == nil {
		t.Fatal("expected error")
	}
	if strings.Contains(err.Error(), testToken) {
		t.Errorf("error leaks token: %v", err)
	}
}

func TestFindMovieByIMDbID(t *testing.T) {
	var gotPath, gotSource string
	fixture := serveFixture(t, "find_imdb.json")
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotSource = r.URL.Query().Get("external_source")
		fixture(w, r)
	})
	id, err := c.FindMovieByIMDbID(context.Background(), "tt0133093")
	if err != nil {
		t.Fatal(err)
	}
	if id != 603 {
		t.Errorf("id = %d", id)
	}
	if gotPath != "/find/tt0133093" || gotSource != "imdb_id" {
		t.Errorf("path=%q source=%q", gotPath, gotSource)
	}
}

func TestFindMovieByIMDbID_NoMatch(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"movie_results":[],"tv_results":[{"id":1}]}`))
	})
	_, err := c.FindMovieByIMDbID(context.Background(), "tt0000001")
	if !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("want ErrNotFound, got %v", err)
	}
}

func TestFindMovieByIMDbID_RejectsBadID(t *testing.T) {
	c := NewClient(testToken)
	if _, err := c.FindMovieByIMDbID(context.Background(), "../x"); err == nil {
		t.Error("expected error for malformed imdb id")
	}
}

func TestGetMovie_OversizedBodyIsSanitizedAPIError(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		chunk := []byte(strings.Repeat("x", 1<<20))
		for i := 0; i < 7; i++ {
			if _, err := w.Write(chunk); err != nil {
				return
			}
		}
	})
	_, err := c.GetMovie(context.Background(), 1)
	if !errors.Is(err, ErrTMDBAPI) {
		t.Fatalf("want ErrTMDBAPI, got %v", err)
	}
}

func TestGetMovie_CancelledContextPreserved(t *testing.T) {
	release := make(chan struct{})
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-release:
		case <-r.Context().Done():
		}
	})
	t.Cleanup(func() { close(release) })
	ctx, cancel := context.WithCancel(context.Background())
	go func() { time.Sleep(50 * time.Millisecond); cancel() }()
	_, err := c.GetMovie(ctx, 1)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("want context.Canceled, got %v", err)
	}
	if strings.Contains(err.Error(), testToken) || strings.Contains(err.Error(), "http://") {
		t.Errorf("error leaks URL/token: %v", err)
	}
}

func TestGetMovie_DeadlinePreserved(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	})
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	_, err := c.GetMovie(ctx, 1)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("want DeadlineExceeded, got %v", err)
	}
}

func TestFindMovieByIMDbID_RejectsShortID(t *testing.T) {
	c := NewClient(testToken)
	if _, err := c.FindMovieByIMDbID(context.Background(), "tt123"); !errors.Is(err, ErrInvalidMovieInput) {
		t.Errorf("want ErrInvalidMovieInput, got %v", err)
	}
}

func TestSearchMovies_SendsParamsAndParses(t *testing.T) {
	var gotPath, gotAuth string
	var gotParams url.Values
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotParams = r.URL.Query()
		gotAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"page":2,"total_pages":5,"total_results":93,"results":[
			{"id":603,"title":"The Matrix","release_date":"1999-03-30","overview":"A hacker.","poster_path":"/m.jpg","vote_average":8.2,"vote_count":25000}]}`))
	})

	page, err := c.SearchMovies(context.Background(), "matrix", 2)
	require.NoError(t, err)

	assert.Equal(t, "/search/movie", gotPath)
	assert.Equal(t, "Bearer "+testToken, gotAuth)
	assert.Equal(t, "matrix", gotParams.Get("query"))
	assert.Equal(t, "2", gotParams.Get("page"))
	assert.Equal(t, "false", gotParams.Get("include_adult"))
	assert.Equal(t, "en-US", gotParams.Get("language"))

	assert.Equal(t, 2, page.Page)
	assert.Equal(t, 5, page.TotalPages)
	assert.Equal(t, 93, page.TotalResults)
	require.Len(t, page.Items, 1)
	item := page.Items[0]
	assert.Equal(t, 603, item.TMDBID)
	assert.Equal(t, "The Matrix", item.Title)
	assert.Equal(t, "A hacker.", item.Overview)
	require.NotNil(t, item.ReleaseDate)
	assert.Equal(t, "1999-03-30", *item.ReleaseDate)
	require.NotNil(t, item.PosterPath)
	assert.Equal(t, "/m.jpg", *item.PosterPath)
	require.NotNil(t, item.VoteAverage)
	assert.InDelta(t, 8.2, *item.VoteAverage, 0.001)
}

func TestSearchMovies_UnknownValuesAreNil(t *testing.T) {
	tests := []struct {
		name, body                      string
		wantDate, wantPoster, wantScore bool
	}{
		{
			name: "no date, null poster, no votes",
			body: `{"results":[{"id":1,"title":"T","release_date":"","overview":"","poster_path":null,"vote_average":0,"vote_count":0}]}`,
		},
		{
			name:       "date, poster and votes present",
			body:       `{"results":[{"id":2,"title":"U","release_date":"2001-01-01","overview":"o","poster_path":"/p.jpg","vote_average":7.5,"vote_count":3}]}`,
			wantDate:   true,
			wantPoster: true,
			wantScore:  true,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
				_, _ = w.Write([]byte(tc.body))
			})
			page, err := c.SearchMovies(context.Background(), "x", 1)
			require.NoError(t, err)
			require.Len(t, page.Items, 1)
			item := page.Items[0]
			assert.Equal(t, tc.wantDate, item.ReleaseDate != nil)
			assert.Equal(t, tc.wantPoster, item.PosterPath != nil)
			assert.Equal(t, tc.wantScore, item.VoteAverage != nil)
		})
	}
}

func TestSearchMovies_NoResultsIsEmptyNotNil(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"page":1,"total_pages":0,"total_results":0,"results":[]}`))
	})
	page, err := c.SearchMovies(context.Background(), "nothing", 1)
	require.NoError(t, err)
	assert.NotNil(t, page.Items)
	assert.Empty(t, page.Items)
	assert.Equal(t, 0, page.TotalResults)
}

func TestSearchMovies_ErrorsSanitized(t *testing.T) {
	tests := []struct {
		status   int
		notFound bool
	}{
		{401, false},
		{500, false},
		{404, true},
	}
	for _, tc := range tests {
		t.Run(http.StatusText(tc.status), func(t *testing.T) {
			c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(`{"status_message":"upstream says ` + testToken + `"}`))
			})
			_, err := c.SearchMovies(context.Background(), "matrix", 1)
			require.Error(t, err)
			assert.Equal(t, tc.notFound, errors.Is(err, domain.ErrNotFound))
			if !tc.notFound {
				assert.ErrorIs(t, err, ErrTMDBAPI)
			}
			assert.NotContains(t, err.Error(), testToken)
			assert.NotContains(t, err.Error(), "upstream says")
		})
	}
}

func TestSearchMovies_TransportErrorSanitized(t *testing.T) {
	c := NewClient(testToken)
	c.baseURL = "http://127.0.0.1:1/3?api_key=" + testToken
	_, err := c.SearchMovies(context.Background(), "matrix", 1)
	require.Error(t, err)
	assert.NotContains(t, err.Error(), testToken)
	assert.NotContains(t, err.Error(), "http://")
}

func TestSearchMovies_MalformedBodyIsSanitizedAPIError(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"results": "not-a-list ` + testToken + `"}`))
	})
	_, err := c.SearchMovies(context.Background(), "matrix", 1)
	require.ErrorIs(t, err, ErrTMDBAPI)
	assert.NotContains(t, err.Error(), testToken)
}
