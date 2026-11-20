package tmdb

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/pkg/limiter"
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
		case r.URL.Path == "/search/person":
			if r.URL.Query().Get("query") == "Christopher Nolan" {
				_, _ = w.Write([]byte(`{"results":[{"id":525,"name":"Christopher Nolan"},{"id":1,"name":"Another Nolan"}]}`))
				return
			}
			_, _ = w.Write([]byte(`{"results":[]}`))
		case strings.HasPrefix(r.URL.Path, "/movie/"):
			movieCalls.Add(1)
			switch r.URL.Path {
			case "/movie/27205":
				// Cast only when asked for, out of billing order, with a blank name.
				appended := ""
				if r.URL.Query().Get("append_to_response") == "credits,reviews,keywords" {
					appended = `,"credits":{"cast":[{"name":"Elliot Page","order":2},{"name":"Leonardo DiCaprio","order":0},{"name":"","order":1},{"name":"Joseph Gordon-Levitt","order":1},{"name":"Tom Hardy","order":3}]}` +
						`,"reviews":{"total_results":12},"keywords":{"keywords":[{"name":"dream"},{"name":"heist"}]}`
				}
				_, _ = w.Write([]byte(`{"runtime":148,"tagline":"Your mind is the scene of the crime.","original_language":"en","popularity":38.5,"budget":160000000,"revenue":839030630,"genres":[{"name":"Action"},{"name":"Science Fiction"}]` + appended + `}`))
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
	got, err := l.Resolve(context.Background(), " Christopher Nolan ")
	require.NoError(t, err, "a name resolves to TMDB's top match")
	assert.Equal(t, "525", got.ID)
	assert.Equal(t, "Christopher Nolan", got.Title)
	_, err = l.Resolve(context.Background(), "Nobody At All")
	assert.ErrorIs(t, err, domain.ErrNotFound)

	for _, ref := range []string{
		"https://evil.example/themoviedb.org/person/525",
		"https://themoviedb.org.evil.example/person/525",
		"https://www.themoviedb.org/person/525x",
	} {
		_, err := l.Resolve(context.Background(), ref)
		assert.ErrorIs(t, err, domain.ErrInvalidInput, ref)
	}
	_, err = l.Resolve(context.Background(), "999")
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
	assert.Equal(t, domain.ImportItemKindMovie, inception.Item.Facts.Kind)
	assert.Equal(t, "https://www.themoviedb.org/movie/27205", inception.Item.CanonicalURL)
	assert.Equal(t, 148*60, *inception.Item.Facts.DurationSeconds)
	assert.Equal(t, "Your mind is the scene of the crime.", *inception.Item.Facts.Summary, "tagline wins over the overview")
	assert.InDelta(t, 8.4, *inception.Item.Facts.Rating, 0.001)
	assert.Equal(t, 38000, *inception.Item.Facts.RatingCount)
	assert.Equal(t, "TMDB", *inception.Item.Facts.RatingSource)
	assert.Equal(t, "https://image.tmdb.org/t/p/w185/inception.jpg", *inception.Item.Facts.ThumbnailURL)
	assert.Equal(t, []string{"Action", "Science Fiction"}, inception.Details.Genres)
	assert.Equal(t, []string{"Action", "Science Fiction"}, inception.Item.Facts.Genres, "genres are a sheet column too")
	assert.Equal(t, []string{"Leonardo DiCaprio", "Joseph Gordon-Levitt", "Elliot Page"}, inception.Item.Facts.TopCast,
		"top 3 by billing order from the same /movie call, blank names skipped")
	assert.InDelta(t, 38.5, *inception.Item.Facts.Popularity, 0.001)
	assert.Equal(t, int64(160000000), *inception.Item.Facts.Budget)
	assert.Equal(t, int64(839030630), *inception.Item.Facts.Revenue)
	assert.Equal(t, 12, *inception.Item.Facts.ReviewCount)
	assert.Equal(t, []string{"dream", "heist"}, inception.Details.Tags, "TMDB keywords are the film's tags")
	assert.Equal(t, "Cobb steals secrets from dreams.", inception.Details.Description)
	assert.Equal(t, 1, inception.Item.Position)

	oppen := items[0]
	assert.Equal(t, "The story of J. Robert Oppenheimer.", *oppen.Item.Facts.Summary, "no tagline: the overview's first line")
	assert.Empty(t, oppen.Item.Facts.TopCast, "no credits in the response: no cast")
	assert.Nil(t, oppen.Item.Facts.Budget, "TMDB's 0 budget is unknown, not $0")
	assert.Nil(t, oppen.Item.Facts.Revenue)
	assert.Nil(t, oppen.Item.Facts.ReviewCount, "no reviews block: unknown")
	assert.Nil(t, oppen.Item.Facts.Popularity)

	untitled := items[2]
	assert.Nil(t, untitled.Item.Facts.Rating, "zero votes is no rating, not a score of 0")
	assert.Nil(t, untitled.Item.Facts.DurationSeconds, "failed lookup leaves runtime unknown")
	assert.Nil(t, untitled.Item.Facts.PublishedAt)
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

// filmographyHandler serves n directed films for person 525 and calls onMovie
// for every /movie/{id} request while that request is still open.
func filmographyHandler(n int, onMovie func(r *http.Request)) http.HandlerFunc {
	crew := make([]string, n)
	for i := range crew {
		crew[i] = fmt.Sprintf(`{"id":%d,"title":"Film %02d","release_date":"2000-01-%02d","job":"Director"}`, 3000+i, i, i%28+1)
	}
	credits := fmt.Sprintf(`{"cast":[],"crew":[%s]}`, strings.Join(crew, ","))
	return func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, "/movie_credits"):
			_, _ = w.Write([]byte(credits))
		case strings.HasPrefix(r.URL.Path, "/movie/"):
			onMovie(r)
			_, _ = w.Write([]byte(`{"runtime":90}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}
}

// concurrencyGauge counts how many requests are open at once and the most it has seen.
type concurrencyGauge struct {
	current, peak, total atomic.Int32
}

func (g *concurrencyGauge) enter() {
	g.total.Add(1)
	n := g.current.Add(1)
	for {
		p := g.peak.Load()
		if n <= p || g.peak.CompareAndSwap(p, n) {
			return
		}
	}
}

func (g *concurrencyGauge) exit() { g.current.Add(-1) }

// failingLimiter is an EnrichLimiter that never grants a slot.
type failingLimiter struct {
	err   error
	calls atomic.Int32
}

func (f *failingLimiter) Acquire(context.Context) (func(), error) {
	f.calls.Add(1)
	return nil, f.err
}

func listAll(l *PersonLister) error {
	return l.List(context.Background(), services.ResolvedImportSource{ID: "525"}, nil, func([]*domain.ImportItemWithDetails) error { return nil })
}

func TestPersonLister_SharedEnrichLimiter_CapsAcrossListings(t *testing.T) {
	const filmsPerListing = 6
	var g concurrencyGauge
	c1 := newTestClient(t, filmographyHandler(filmsPerListing, func(*http.Request) {
		g.enter()
		defer g.exit()
		// Hold each request so overlapping requests would be visible without the limiter.
		time.Sleep(10 * time.Millisecond)
	}))
	c2 := NewClient(testToken)
	c2.baseURL = c1.baseURL

	shared := limiter.New("tmdb_enrich_test", 1)
	listers := []*PersonLister{
		NewPersonLister(c1, WithEnrichLimiter(shared)),
		NewPersonLister(c2, WithEnrichLimiter(shared)),
	}
	errs := make([]error, len(listers))
	var wg sync.WaitGroup
	for i, l := range listers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs[i] = listAll(l)
		}()
	}
	wg.Wait()

	for _, err := range errs {
		require.NoError(t, err)
	}
	assert.EqualValues(t, 2*filmsPerListing, g.total.Load(), "every film of both listings was looked up")
	assert.EqualValues(t, 1, g.peak.Load(), "one slot shared by both listings: never two /movie requests at once")
	assert.Equal(t, limiter.Stats{}, shared.Stats(), "every slot was released")
}

func TestPersonLister_EnrichLimiterCancelledLeavesExtrasEmpty(t *testing.T) {
	var movieCalls atomic.Int32
	c := newTestClient(t, fakeTMDB(t, &movieCalls))
	c.token = "test-token"
	denied := &failingLimiter{err: context.Canceled}
	l := NewPersonLister(c, WithEnrichLimiter(denied))

	director := domain.ImportPersonRoleDirector
	items := collect(t, l, &director)

	require.Len(t, items, 3, "the batch still returns every film")
	assert.EqualValues(t, 3, denied.calls.Load(), "each film asked the limiter for a slot")
	assert.Zero(t, movieCalls.Load(), "no slot, no /movie lookup")
	for _, it := range items {
		assert.Nil(t, it.Item.Facts.DurationSeconds, it.Item.Title)
		assert.Empty(t, it.Item.Facts.Genres, it.Item.Title)
		assert.Empty(t, it.Item.Facts.TopCast, it.Item.Title)
		assert.Nil(t, it.Item.Facts.Budget, it.Item.Title)
	}
	// What the credits list already had is still there.
	assert.Equal(t, "Oppenheimer", items[0].Item.Title)
	assert.Equal(t, 9000, *items[0].Item.Facts.RatingCount)
}

// gatedListings starts listings concurrent List calls on one lister that has no
// injected limiter, each over 12 films, and holds every /movie request open.
// It returns the gauge and a function that opens the gate and waits for the
// listings to finish.
func gatedListings(t *testing.T, listings int) (g *concurrencyGauge, finish func()) {
	t.Helper()
	g = &concurrencyGauge{}
	gate := make(chan struct{})
	c := newTestClient(t, filmographyHandler(12, func(r *http.Request) {
		g.enter()
		defer g.exit()
		select {
		case <-gate:
		case <-r.Context().Done():
		}
	}))
	var once sync.Once
	openGate := func() { once.Do(func() { close(gate) }) }

	ctx, cancel := context.WithCancel(context.Background())
	// Registered after the server's cleanup, so these run first and a failed
	// assertion cannot leave requests parked and hang the server's Close.
	t.Cleanup(cancel)
	t.Cleanup(openGate)

	l := NewPersonLister(c)
	errs := make([]error, listings)
	var wg sync.WaitGroup
	for i := range errs {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs[i] = l.List(ctx, services.ResolvedImportSource{ID: "525"}, nil, func([]*domain.ImportItemWithDetails) error { return nil })
		}()
	}
	return g, func() {
		openGate()
		wg.Wait()
		for _, err := range errs {
			require.NoError(t, err)
		}
		assert.EqualValues(t, listings*12, g.total.Load(), "every film was still looked up once the gate opened")
	}
}

// The two tests below pin the figure 4 as a literal on purpose: changing
// PersonEnrichConcurrency should be a decision that touches them.

func TestPersonLister_DefaultEnrichCapIsFourPerCall(t *testing.T) {
	const tick = 5 * time.Millisecond
	g, finish := gatedListings(t, 1)

	require.Eventually(t, func() bool { return g.current.Load() == 4 }, 5*time.Second, tick,
		"the call fills its four slots")
	assert.Never(t, func() bool { return g.peak.Load() > 4 }, 300*time.Millisecond, tick,
		"a fifth lookup must wait: 12 films, 4 at a time")
	finish()
}

func TestPersonLister_DefaultEnrichCapIsPerCallNotPerLister(t *testing.T) {
	const tick = 5 * time.Millisecond
	g, finish := gatedListings(t, 2)

	require.Eventually(t, func() bool { return g.current.Load() == 8 }, 5*time.Second, tick,
		"without an injected limiter each call has four slots of its own")
	assert.Never(t, func() bool { return g.peak.Load() > 8 }, 300*time.Millisecond, tick)
	finish()
}
