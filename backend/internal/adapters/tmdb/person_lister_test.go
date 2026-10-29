package tmdb

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// nolanCredits mimics /person/525/movie_credits: a cameo in the cast list,
// Inception both directed and in the crew twice (Director, Writer), an
// unrated announced film, and an adult title that must be dropped.
const nolanCredits = `{
 "cast":[{"id":900,"title":"Cameo Film","release_date":"2005-06-01","overview":"A cameo.","vote_average":6.1,"vote_count":300,"character":"Man in crowd"}],
 "crew":[
  {"id":27205,"title":"Inception","release_date":"2010-07-15","overview":"Cobb steals secrets from dreams.","vote_average":8.4,"vote_count":38000,"poster_path":"/inception.jpg","job":"Director"},
  {"id":27205,"title":"Inception","release_date":"2010-07-15","job":"Writer"},
  {"id":872585,"title":"Oppenheimer","release_date":"2023-07-19","overview":"The story of J. Robert Oppenheimer.","vote_average":8.1,"vote_count":9000,"job":"Director"},
  {"id":1,"title":"Untitled Project","release_date":"","overview":"","vote_average":0,"vote_count":0,"job":"Director"},
  {"id":2,"title":"Adult Title","release_date":"2001-01-01","adult":true,"job":"Director"}
 ]}`

func fakeTMDB(t *testing.T, movieCalls *atomic.Int32) http.HandlerFunc {
	t.Helper()
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-token" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		switch {
		case r.URL.Path == "/person/525":
			_, _ = w.Write([]byte(`{"id":525,"name":"Christopher Nolan"}`))
		case r.URL.Path == "/person/525/movie_credits":
			_, _ = w.Write([]byte(nolanCredits))
		case strings.HasPrefix(r.URL.Path, "/movie/"):
			movieCalls.Add(1)
			switch r.URL.Path {
			case "/movie/27205":
				// Cast only when asked for, out of billing order, with a blank name.
				credits := ""
				if r.URL.Query().Get("append_to_response") == "credits" {
					credits = `,"credits":{"cast":[{"name":"Elliot Page","order":2},{"name":"Leonardo DiCaprio","order":0},{"name":"","order":1},{"name":"Joseph Gordon-Levitt","order":1},{"name":"Tom Hardy","order":3}]}`
				}
				_, _ = w.Write([]byte(`{"runtime":148,"tagline":"Your mind is the scene of the crime.","original_language":"en","genres":[{"name":"Action"},{"name":"Science Fiction"}]` + credits + `}`))
			case "/movie/872585":
				_, _ = w.Write([]byte(`{"runtime":181,"tagline":"","genres":[{"name":"Drama"}]}`))
			case "/movie/1":
				w.WriteHeader(http.StatusInternalServerError)
			default:
				_, _ = w.Write([]byte(`{"runtime":0}`))
			}
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}
}

func newTestPersonLister(t *testing.T, movieCalls *atomic.Int32) *PersonLister {
	t.Helper()
	c := newTestClient(t, fakeTMDB(t, movieCalls))
	c.token = "test-token"
	l := NewPersonLister(c)
	l.now = func() time.Time { return time.Date(2026, 10, 27, 0, 0, 0, 0, time.UTC) }
	return l
}

func TestPersonLister_Resolve(t *testing.T) {
	var calls atomic.Int32
	l := newTestPersonLister(t, &calls)
	for _, ref := range []string{
		"525", " 525 ",
		"https://www.themoviedb.org/person/525-christopher-nolan",
		"themoviedb.org/person/525",
		"https://www.themoviedb.org/person/525?language=en-US",
	} {
		got, err := l.Resolve(context.Background(), ref)
		require.NoError(t, err, ref)
		assert.Equal(t, "525", got.ID)
		assert.Equal(t, "Christopher Nolan", got.Title)
		assert.Equal(t, "https://www.themoviedb.org/person/525", got.URL)
	}
	for _, ref := range []string{
		"nolan",
		"https://evil.example/themoviedb.org/person/525",
		"https://themoviedb.org.evil.example/person/525",
		"https://www.themoviedb.org/person/525x",
	} {
		_, err := l.Resolve(context.Background(), ref)
		assert.ErrorIs(t, err, domain.ErrInvalidInput, ref)
	}
	_, err := l.Resolve(context.Background(), "999")
	assert.ErrorIs(t, err, domain.ErrNotFound)
}

func collect(t *testing.T, l *PersonLister, role *domain.ImportPersonRole) []*domain.ImportItemWithDetails {
	t.Helper()
	var all []*domain.ImportItemWithDetails
	require.NoError(t, l.List(context.Background(), services.ResolvedImportSource{ID: "525"}, role, func(b []*domain.ImportItemWithDetails) error {
		all = append(all, b...)
		return nil
	}))
	return all
}

func TestPersonLister_ListDirector(t *testing.T) {
	var calls atomic.Int32
	l := newTestPersonLister(t, &calls)
	director := domain.ImportPersonRoleDirector
	items := collect(t, l, &director)

	titles := make([]string, len(items))
	for i, it := range items {
		titles[i] = it.Item.Title
	}
	assert.Equal(t, []string{"Oppenheimer", "Inception", "Untitled Project"}, titles, "newest first, undated last, no cast, no adult, no duplicate")
	assert.EqualValues(t, 3, calls.Load(), "one /movie lookup per film")

	inception := items[1]
	assert.Equal(t, domain.ContentTypeMovie, inception.Item.DestinationType)
	assert.Equal(t, domain.ImportItemKindMovie, inception.Item.Kind)
	assert.Equal(t, "https://www.themoviedb.org/movie/27205", inception.Item.CanonicalURL)
	assert.Equal(t, 148*60, *inception.Item.DurationSeconds)
	assert.Equal(t, "Your mind is the scene of the crime.", *inception.Item.Summary, "tagline wins over the overview")
	assert.InDelta(t, 8.4, *inception.Item.Rating, 0.001)
	assert.Equal(t, 38000, *inception.Item.RatingCount)
	assert.Equal(t, "TMDB", *inception.Item.RatingSource)
	assert.Equal(t, "https://image.tmdb.org/t/p/w185/inception.jpg", *inception.Item.ThumbnailURL)
	assert.Equal(t, []string{"Action", "Science Fiction"}, inception.Details.Genres)
	assert.Equal(t, []string{"Action", "Science Fiction"}, inception.Item.Genres, "genres are a sheet column too")
	assert.Equal(t, []string{"Leonardo DiCaprio", "Joseph Gordon-Levitt", "Elliot Page"}, inception.Item.TopCast,
		"top 3 by billing order from the same /movie call, blank names skipped")
	assert.Equal(t, "Cobb steals secrets from dreams.", inception.Details.Description)
	assert.Equal(t, 1, inception.Item.Position)

	oppen := items[0]
	assert.Equal(t, "The story of J. Robert Oppenheimer.", *oppen.Item.Summary, "no tagline: the overview's first line")
	assert.Empty(t, oppen.Item.TopCast, "no credits in the response: no cast")

	untitled := items[2]
	assert.Nil(t, untitled.Item.Rating, "zero votes is no rating, not a score of 0")
	assert.Nil(t, untitled.Item.DurationSeconds, "failed lookup leaves runtime unknown")
	assert.Nil(t, untitled.Item.PublishedAt)
}

func TestPersonLister_ListAllRolesMergesCredits(t *testing.T) {
	var calls atomic.Int32
	l := newTestPersonLister(t, &calls)
	items := collect(t, l, nil)
	require.Len(t, items, 4)
	assert.Equal(t, "Cameo Film", items[2].Item.Title)
	assert.Equal(t, []domain.ImportPerson{{Name: "Man in crowd", Role: "Cast"}}, items[2].Details.People)

	cast := domain.ImportPersonRoleCast
	items = collect(t, l, &cast)
	require.Len(t, items, 1)
	assert.Equal(t, "Cameo Film", items[0].Item.Title)
}

func TestPersonLister_ListBatches(t *testing.T) {
	var crew []string
	for i := 1; i <= 45; i++ {
		crew = append(crew, fmt.Sprintf(`{"id":%d,"title":"Film %02d","release_date":"2000-01-%02d","vote_count":0,"job":"Director"}`, 1000+i, i, (i%28)+1))
	}
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/movie_credits") {
			fmt.Fprintf(w, `{"cast":[],"crew":[%s]}`, strings.Join(crew, ","))
			return
		}
		_, _ = w.Write([]byte(`{"runtime":90}`))
	})
	l := NewPersonLister(c)
	var sizes []int
	require.NoError(t, l.List(context.Background(), services.ResolvedImportSource{ID: "1"}, nil, func(b []*domain.ImportItemWithDetails) error {
		sizes = append(sizes, len(b))
		return nil
	}))
	assert.Equal(t, []int{20, 20, 5}, sizes)
}
