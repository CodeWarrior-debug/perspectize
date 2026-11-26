// Package assembly chooses the server's adapters for the outside world: real
// API clients, demo fixtures, or unconfigured clients that fail with a clear
// error. The choice depends only on Settings, so it can be tested without a
// database, a network or a running server.
package assembly

import (
	"log/slog"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/auth"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/openlibrary"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/tmdb"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/webpage"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/wikidata"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/youtube"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/config"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/demo"
	"github.com/CodeWarrior-debug/perspectize/backend/pkg/limiter"
)

// Settings is everything adapter selection reads, resolved once at startup.
type Settings struct {
	// Demo swaps YouTube, import listing and sign-in for offline demo
	// stand-ins, so the demo stack can record tours with no external accounts.
	// Other lookups behave as in a normal run.
	Demo                bool
	YouTubeAPIKey       string
	YouTubeCacheTTL     time.Duration
	YouTubeTrendingTTL  time.Duration
	TMDBReadAccessToken string
}

// SettingsFrom resolves Settings from the loaded config and demo flag.
func SettingsFrom(cfg *config.Config, demoCfg config.Demo) Settings {
	return Settings{
		Demo:                demoCfg.Enabled,
		YouTubeAPIKey:       cfg.YouTube.APIKey,
		YouTubeCacheTTL:     time.Duration(cfg.YouTube.CacheTTLSeconds) * time.Second,
		YouTubeTrendingTTL:  time.Duration(cfg.YouTube.TrendingCacheTTLSeconds) * time.Second,
		TMDBReadAccessToken: cfg.TMDBReadAccessToken,
	}
}

// Externals holds one adapter per outside-world port. A nil optional client
// means "not configured": the service reports that to the caller.
type Externals struct {
	YouTube         portservices.YouTubeClient
	YouTubeTrending portservices.YouTubeTrendingClient // optional
	Movie           portservices.MovieClient
	MovieSearch     portservices.MovieSearchClient
	MovieTrending   portservices.MovieTrendingClient
	BookSearch      portservices.BookSearchClient
	BookTrending    portservices.BookTrendingClient
	BookISBN        portservices.BookISBNClient
	BookWork        portservices.BookWorkClient
	WebPage         portservices.WebPageClient
	Wikidata        portservices.WikidataClient
	// ImportListers has one entry per import source type that can be staged.
	ImportListers  map[domain.ImportSourceType]portservices.ImportSourceLister
	ClerkDirectory portservices.ClerkDirectory
	TokenVerifier  portservices.TokenVerifier
}

// NewExternals picks every outside-world adapter for s. limiterOpts are
// applied to the limiters it creates (the TMDB enrichment limiter).
func NewExternals(s Settings, limiterOpts ...limiter.Option) Externals {
	if s.Demo {
		slog.Warn("DEMO MODE ENABLED — unsigned demo.<persona> tokens are accepted; never expose this instance publicly with real data")
	}

	// Open Library needs no key. One client backs search, the cached trending
	// feed, ISBN resolution and the work and edition records.
	books := openlibrary.NewClient()
	e := Externals{
		BookSearch:   books,
		BookTrending: openlibrary.NewTrendingCache(books, openlibrary.DefaultTrendingTTL),
		BookISBN:     books,
		BookWork:     books,
		// The reader is SSRF-safe on every connection; its address policy is
		// fixed, not environment-driven.
		WebPage:       webpage.NewClient(webpage.Options{}),
		Wikidata:      wikidata.NewClient(),
		ImportListers: map[domain.ImportSourceType]portservices.ImportSourceLister{},
	}
	e.ClerkDirectory, e.TokenVerifier = identityAdapters(s.Demo)
	setYouTube(&e, s)
	setMovies(&e, s, limiterOpts)
	return e
}

// identityAdapters returns the Clerk directory and token verifier. Demo mode
// wraps both so "demo.<persona>" tokens resolve to the seeded personas, while
// any other token still goes to Clerk.
func identityAdapters(isDemo bool) (portservices.ClerkDirectory, portservices.TokenVerifier) {
	var directory portservices.ClerkDirectory = auth.NewClerkDirectory()
	var verifier portservices.TokenVerifier = auth.NewClerkTokenVerifier()
	if isDemo {
		return demo.NewIdentityDirectory(directory), auth.NewDemoTokenVerifier(verifier)
	}
	return directory, verifier
}

// setYouTube picks video lookups, Discover's Trending feed and the channel
// lister. Demo mode uses offline fixtures and has no Trending feed.
func setYouTube(e *Externals, s Settings) {
	if s.Demo {
		e.YouTube = youtube.NewFixtureClient()
		e.ImportListers[domain.ImportSourceYouTubeChannel] = demo.NewImportLister(domain.ImportSourceYouTubeChannel)
		return
	}
	if s.YouTubeAPIKey == "" {
		slog.Warn("YOUTUBE_API_KEY is empty — YouTube metadata fetching will fail")
	}
	// One caching client serves video lookups and the Trending chart, so
	// repeat lookups don't spend API quota.
	cached := youtube.NewCachingClient(
		youtube.NewClient(s.YouTubeAPIKey),
		s.YouTubeCacheTTL,
		youtube.WithTrendingTTL(s.YouTubeTrendingTTL),
	)
	e.YouTube, e.YouTubeTrending = cached, cached
	slog.Info("YouTube API cache configured", "ttlSeconds", int(s.YouTubeCacheTTL.Seconds()), "trendingTTLSeconds", int(s.YouTubeTrendingTTL.Seconds()))
	if s.YouTubeAPIKey != "" {
		e.ImportListers[domain.ImportSourceYouTubeChannel] = youtube.NewChannelLister(youtube.NewClient(s.YouTubeAPIKey))
	}
}

// setMovies picks movie lookups, Discover's Movies search and trending, and
// the TMDB person lister. A TMDB token wins even in demo mode; without one,
// demo mode resolves its staged films offline and lists sample people.
func setMovies(e *Externals, s Settings, limiterOpts []limiter.Option) {
	unconfigured := tmdb.UnconfiguredClient{}
	e.Movie, e.MovieSearch, e.MovieTrending = unconfigured, unconfigured, unconfigured
	if s.Demo {
		e.ImportListers[domain.ImportSourceTMDBPerson] = demo.NewImportLister(domain.ImportSourceTMDBPerson)
	}
	switch {
	case s.TMDBReadAccessToken != "":
		client := tmdb.NewClient(s.TMDBReadAccessToken)
		e.Movie, e.MovieSearch = client, client
		// Trending is cached per window and page; search is not.
		e.MovieTrending = tmdb.NewTrendingCache(client, tmdb.DefaultTrendingTTL)
		// One enrichment limiter for every person listing, so concurrent
		// listings share TMDB's budget instead of each spending their own.
		enrich := limiter.New("tmdb_enrich", tmdb.PersonEnrichConcurrency, limiterOpts...)
		e.ImportListers[domain.ImportSourceTMDBPerson] = tmdb.NewPersonLister(client, tmdb.WithEnrichLimiter(enrich))
	case s.Demo:
		e.Movie = tmdb.NewDemoClient()
	default:
		slog.Warn("TMDB_API_READ_ACCESS_TOKEN is empty — movie lookups will fail")
	}
}

// ContentOptions wires e's optional content clients into ContentService.
func (e Externals) ContentOptions() []services.ContentServiceOption {
	return []services.ContentServiceOption{
		services.WithYouTubeTrending(e.YouTubeTrending),
		services.WithMovieSearch(e.MovieSearch),
		services.WithMovieTrending(e.MovieTrending),
		services.WithBookSearch(e.BookSearch),
		services.WithBookTrending(e.BookTrending),
		services.WithBookISBN(e.BookISBN),
		services.WithBookWork(e.BookWork),
		services.WithWebPageClient(e.WebPage),
	}
}
