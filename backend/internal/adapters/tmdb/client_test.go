package tmdb

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
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
