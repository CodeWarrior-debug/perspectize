package tmdb

import (
	"encoding/json"
	"os"
	"testing"
)

func TestParseMovieInput(t *testing.T) {
	tests := []struct {
		name     string
		in       string
		wantTMDB int
		wantIMDb string
		wantErr  bool
	}{
		{"slug url", "https://www.themoviedb.org/movie/603-the-matrix", 603, "", false},
		{"bare url", "https://www.themoviedb.org/movie/603", 603, "", false},
		{"no scheme", "themoviedb.org/movie/603", 603, "", false},
		{"imdb url", "https://www.imdb.com/title/tt0133093/", 0, "tt0133093", false},
		{"imdb url no scheme", "imdb.com/title/tt0133093", 0, "tt0133093", false},
		{"tt id alone", "tt0133093", 0, "tt0133093", false},
		{"tv url", "https://www.themoviedb.org/tv/1396-breaking-bad", 0, "", true},
		{"garbage", "not a movie", 0, "", true},
		{"empty", "", 0, "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			id, imdb, err := ParseMovieInput(tt.in)
			if (err != nil) != tt.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
			}
			if id != tt.wantTMDB || imdb != tt.wantIMDb {
				t.Errorf("got (%d, %q), want (%d, %q)", id, imdb, tt.wantTMDB, tt.wantIMDb)
			}
		})
	}
}

func TestCanonicalMovieURL(t *testing.T) {
	if got := CanonicalMovieURL(603); got != "https://www.themoviedb.org/movie/603" {
		t.Errorf("got %q", got)
	}
}

func readFixture(t *testing.T, name string) []byte {
	t.Helper()
	b, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestShapeMovie_Full(t *testing.T) {
	meta, err := ShapeMovie(readFixture(t, "movie_603.json"))
	if err != nil {
		t.Fatal(err)
	}
	if meta.TMDBID != 603 || meta.Title != "The Matrix" {
		t.Errorf("id/title = %d/%q", meta.TMDBID, meta.Title)
	}
	if meta.RuntimeSeconds == nil || *meta.RuntimeSeconds != 136*60 {
		t.Errorf("RuntimeSeconds = %v", meta.RuntimeSeconds)
	}

	var out struct {
		TMDBID              int      `json:"tmdbId"`
		IMDbID              string   `json:"imdbId"`
		Year                int      `json:"year"`
		Genres              []string `json:"genres"`
		Certification       string   `json:"certification"`
		RuntimeMinutes      int      `json:"runtimeMinutes"`
		RuntimeSecondsKnown bool     `json:"runtimeSecondsKnown"`
		Budget              *int64   `json:"budget"`
		Revenue             *int64   `json:"revenue"`
		Keywords            []string `json:"keywords"`
		Cast                []struct {
			ID    int `json:"id"`
			Order int `json:"order"`
		} `json:"cast"`
		Directors []struct {
			ID   int    `json:"id"`
			Name string `json:"name"`
		} `json:"directors"`
		Collection json.RawMessage `json:"collection"`
	}
	if err := json.Unmarshal(meta.Response, &out); err != nil {
		t.Fatal(err)
	}
	if out.TMDBID != 603 || out.IMDbID != "tt0133093" || out.Year != 1999 {
		t.Errorf("ids/year: %+v", out)
	}
	if out.Certification != "R" {
		t.Errorf("certification = %q", out.Certification)
	}
	if out.RuntimeMinutes != 136 || out.RuntimeSecondsKnown {
		t.Errorf("runtime: %d known=%v", out.RuntimeMinutes, out.RuntimeSecondsKnown)
	}
	if out.Budget == nil || *out.Budget != 63000000 || out.Revenue == nil || *out.Revenue != 463517383 {
		t.Errorf("budget/revenue: %v %v", out.Budget, out.Revenue)
	}
	if len(out.Genres) != 2 || out.Genres[0] != "Action" {
		t.Errorf("genres = %v", out.Genres)
	}
	if len(out.Keywords) != 3 {
		t.Errorf("keywords = %v", out.Keywords)
	}
	if len(out.Cast) != 15 {
		t.Fatalf("cast len = %d, want 15", len(out.Cast))
	}
	for i, c := range out.Cast {
		if c.Order != i {
			t.Errorf("cast[%d].order = %d", i, c.Order)
		}
	}
	if out.Cast[0].ID != 6384 {
		t.Errorf("cast[0].id = %d", out.Cast[0].ID)
	}
	if len(out.Directors) != 2 || out.Directors[0].Name != "Lana Wachowski" {
		t.Errorf("directors = %+v", out.Directors)
	}
	if len(out.Collection) == 0 || string(out.Collection) == "null" {
		t.Errorf("collection missing: %s", out.Collection)
	}
}

func TestShapeMovie_NoBudget(t *testing.T) {
	meta, err := ShapeMovie(readFixture(t, "movie_no_budget.json"))
	if err != nil {
		t.Fatal(err)
	}
	if meta.RuntimeSeconds != nil {
		t.Errorf("RuntimeSeconds = %v, want nil", *meta.RuntimeSeconds)
	}
	var out map[string]json.RawMessage
	if err := json.Unmarshal(meta.Response, &out); err != nil {
		t.Fatal(err)
	}
	for _, k := range []string{"budget", "revenue"} {
		v, ok := out[k]
		if !ok || string(v) != "null" {
			t.Errorf("%s = %s (present=%v), want null", k, v, ok)
		}
	}
	if string(out["cast"]) != "[]" || string(out["directors"]) != "[]" {
		t.Errorf("empty lists should marshal as []: cast=%s directors=%s", out["cast"], out["directors"])
	}
}

func TestShapeMovie_InvalidJSON(t *testing.T) {
	if _, err := ShapeMovie([]byte("{")); err == nil {
		t.Error("expected error")
	}
}
