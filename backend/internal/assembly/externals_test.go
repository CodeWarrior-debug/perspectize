package assembly_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/auth"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/openlibrary"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/tmdb"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/webpage"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/wikidata"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/youtube"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/assembly"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/config"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/demo"
)

func TestSettingsFrom_ConvertsSecondsAndDemoFlag(t *testing.T) {
	cfg := &config.Config{TMDBReadAccessToken: "tok"}
	cfg.YouTube.APIKey = "yt"
	cfg.YouTube.CacheTTLSeconds = 90
	cfg.YouTube.TrendingCacheTTLSeconds = 30

	s := assembly.SettingsFrom(cfg, config.Demo{Enabled: true})

	assert.Equal(t, assembly.Settings{
		Demo:                true,
		YouTubeAPIKey:       "yt",
		YouTubeCacheTTL:     90 * time.Second,
		YouTubeTrendingTTL:  30 * time.Second,
		TMDBReadAccessToken: "tok",
	}, s)
}

func TestNewExternals_LiveWithKeysUsesRealClients(t *testing.T) {
	e := assembly.NewExternals(assembly.Settings{YouTubeAPIKey: "yt", TMDBReadAccessToken: "tok"})

	assert.IsType(t, &youtube.CachingClient{}, e.YouTube)
	assert.Same(t, e.YouTube, e.YouTubeTrending, "one caching client serves lookups and trending")
	assert.IsType(t, &tmdb.Client{}, e.Movie)
	assert.Same(t, e.Movie, e.MovieSearch)
	assert.IsType(t, &tmdb.TrendingCache{}, e.MovieTrending)
	assertLiveSharedAdapters(t, e)
	assert.IsType(t, &auth.ClerkDirectory{}, e.ClerkDirectory)
	assert.IsType(t, &auth.ClerkTokenVerifier{}, e.TokenVerifier)
	require.Len(t, e.ImportListers, 2)
	assert.IsType(t, &youtube.ChannelLister{}, e.ImportListers[domain.ImportSourceYouTubeChannel])
	assert.IsType(t, &tmdb.PersonLister{}, e.ImportListers[domain.ImportSourceTMDBPerson])
}

func TestNewExternals_LiveWithoutKeysIsUnconfigured(t *testing.T) {
	e := assembly.NewExternals(assembly.Settings{})

	assert.IsType(t, &youtube.CachingClient{}, e.YouTube, "YouTube calls fail at request time, not at startup")
	assert.Equal(t, tmdb.UnconfiguredClient{}, e.Movie)
	assert.Equal(t, tmdb.UnconfiguredClient{}, e.MovieSearch)
	assert.Equal(t, tmdb.UnconfiguredClient{}, e.MovieTrending)
	assert.Empty(t, e.ImportListers, "no key, nothing to list")
	assertLiveSharedAdapters(t, e)
}

func TestNewExternals_DemoUsesFixturesForYouTubeImportsAndSignIn(t *testing.T) {
	e := assembly.NewExternals(assembly.Settings{Demo: true, YouTubeAPIKey: "ignored in demo"})

	assert.IsType(t, &youtube.FixtureClient{}, e.YouTube)
	assert.Nil(t, e.YouTubeTrending, "no Trending fixture: Discover reports not configured")
	assert.IsType(t, tmdb.DemoClient{}, e.Movie)
	assert.Equal(t, tmdb.UnconfiguredClient{}, e.MovieSearch)
	assert.Equal(t, tmdb.UnconfiguredClient{}, e.MovieTrending)
	assert.IsType(t, &demo.IdentityDirectory{}, e.ClerkDirectory)
	assert.IsType(t, &auth.DemoTokenVerifier{}, e.TokenVerifier)
	require.Len(t, e.ImportListers, 2)
	assert.IsType(t, &demo.ImportLister{}, e.ImportListers[domain.ImportSourceYouTubeChannel])
	assert.IsType(t, &demo.ImportLister{}, e.ImportListers[domain.ImportSourceTMDBPerson])
	// Books, web pages and categories behave as in a normal run.
	assertLiveSharedAdapters(t, e)
}

func TestNewExternals_DemoWithTMDBTokenUsesRealTMDB(t *testing.T) {
	e := assembly.NewExternals(assembly.Settings{Demo: true, TMDBReadAccessToken: "tok"})

	assert.IsType(t, &tmdb.Client{}, e.Movie)
	assert.IsType(t, &tmdb.PersonLister{}, e.ImportListers[domain.ImportSourceTMDBPerson])
	assert.IsType(t, &demo.ImportLister{}, e.ImportListers[domain.ImportSourceYouTubeChannel])
}

// TestContentOptions_ConfigureBookClients proves the Open Library clients reach
// ContentService. A configured client validates its input before any network
// call, so an unconfigured service (ErrBookClientUnavailable) is
// distinguishable from a configured one (ErrInvalidInput) without I/O.
func TestContentOptions_ConfigureBookClients(t *testing.T) {
	e := assembly.NewExternals(assembly.Settings{})
	svc := services.NewContentService(nil, e.YouTube, e.Movie, e.ContentOptions()...)

	_, err := svc.SearchBooks(context.Background(), "", 1)
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
	assert.NotErrorIs(t, err, services.ErrBookClientUnavailable)

	_, err = svc.TrendingBooks(context.Background(), domain.TrendingWindow("BAD"), 1)
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
	assert.NotErrorIs(t, err, services.ErrBookClientUnavailable)
}

// assertLiveSharedAdapters checks the adapters every mode shares: Open Library
// for books, the web page reader and Wikidata.
func assertLiveSharedAdapters(t *testing.T, e assembly.Externals) {
	t.Helper()
	assert.IsType(t, &openlibrary.Client{}, e.BookSearch)
	assert.IsType(t, &openlibrary.TrendingCache{}, e.BookTrending)
	assert.Same(t, e.BookSearch, e.BookISBN)
	assert.Same(t, e.BookSearch, e.BookWork)
	assert.IsType(t, &webpage.Client{}, e.WebPage)
	assert.IsType(t, &wikidata.Client{}, e.Wikidata)
}
