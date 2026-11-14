package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/tmdb"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/youtube"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// ContentService implements business logic for content operations
type ContentService struct {
	repo          repositories.ContentRepository
	youtubeClient portservices.YouTubeClient
	bibleRepo     repositories.BibleReferenceRepository
	trending      portservices.YouTubeTrendingClient
	movieClient   portservices.MovieClient
	movieSearch   portservices.MovieSearchClient
	movieTrending portservices.MovieTrendingClient
	bookSearch    portservices.BookSearchClient
	bookTrending  portservices.BookTrendingClient
	bookISBN      portservices.BookISBNClient
	bookWork      portservices.BookWorkClient
	// now stamps a book's reading-log snapshot; tests inject a fixed clock.
	now func() time.Time
}

// ContentServiceOption configures optional ContentService dependencies.
type ContentServiceOption func(*ContentService)

// WithClock overrides the time source used to stamp snapshots (tests only).
func WithClock(now func() time.Time) ContentServiceOption {
	return func(s *ContentService) { s.now = now }
}

// WithBibleReference enables BIBLE_PASSAGE creation by supplying the reference-data repository.
func WithBibleReference(repo repositories.BibleReferenceRepository) ContentServiceOption {
	return func(s *ContentService) { s.bibleRepo = repo }
}

// WithYouTubeTrending enables the Discover page's Trending feed. Pass the
// caching client so every caller shares its cache.
func WithYouTubeTrending(client portservices.YouTubeTrendingClient) ContentServiceOption {
	return func(s *ContentService) { s.trending = client }
}

// WithMovieSearch enables the Discover page's Movies source (TMDB title search).
// Searches are not cached server-side; each call reaches TMDB.
func WithMovieSearch(client portservices.MovieSearchClient) ContentServiceOption {
	return func(s *ContentService) { s.movieSearch = client }
}

// WithMovieTrending enables the Discover page's trending movies list. Pass the
// caching client so every caller shares its cache.
func WithMovieTrending(client portservices.MovieTrendingClient) ContentServiceOption {
	return func(s *ContentService) { s.movieTrending = client }
}

// WithBookSearch enables the Discover page's Books source (Open Library title
// search) and backs CreateFromBook's work-key lookup. Searches are not cached
// server-side; each call reaches Open Library.
func WithBookSearch(client portservices.BookSearchClient) ContentServiceOption {
	return func(s *ContentService) { s.bookSearch = client }
}

// WithBookTrending enables the Discover page's trending books list. Pass the
// caching client so every caller shares its cache.
func WithBookTrending(client portservices.BookTrendingClient) ContentServiceOption {
	return func(s *ContentService) { s.bookTrending = client }
}

// WithBookISBN enables ISBN-based book lookup (the ISBN tab's resolve-before-add
// and CreateFromBook's raw-ISBN input path).
func WithBookISBN(client portservices.BookISBNClient) ContentServiceOption {
	return func(s *ContentService) { s.bookISBN = client }
}

// WithBookWork enables the Open Library work record (description and related
// works) read at add and refresh time, and edition-link resolution. Its
// failures never block a book from being added.
func WithBookWork(client portservices.BookWorkClient) ContentServiceOption {
	return func(s *ContentService) { s.bookWork = client }
}

// NewContentService creates a new content service
func NewContentService(repo repositories.ContentRepository, yt portservices.YouTubeClient, movie portservices.MovieClient, opts ...ContentServiceOption) *ContentService {
	s := &ContentService{
		repo:          repo,
		youtubeClient: yt,
		movieClient:   movie,
	}
	for _, opt := range opts {
		opt(s)
	}
	return s
}

// CreateFromYouTube creates content from a YouTube URL, attributed to the given user.
// If the URL (after normalization) already exists, returns the existing content
// along with ErrAlreadyExists so callers can distinguish new vs existing.
func (s *ContentService) CreateFromYouTube(ctx context.Context, url string, userID int) (*domain.Content, error) {
	// 1. Extract video ID first (validates URL format)
	videoID, err := s.youtubeClient.ExtractVideoID(url)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", domain.ErrInvalidURL, err)
	}

	// 2. Normalize to canonical URL — this is the key for deduplication
	canonicalURL := youtube.NormalizeYouTubeURL(videoID)

	// 3. Check if already exists (avoids unnecessary YouTube API call)
	existing, err := s.repo.GetByURL(ctx, canonicalURL)
	if err == nil && existing != nil {
		return existing, domain.ErrAlreadyExists
	}
	if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return nil, fmt.Errorf("failed to check existing content: %w", err)
	}

	// 4. Fetch metadata from YouTube API (only for new videos)
	metadata, err := s.youtubeClient.GetVideoMetadata(ctx, videoID)
	if err != nil {
		// Log with context, but don't expose YouTube API details to GraphQL clients
		slog.Error("failed to fetch YouTube metadata",
			"videoID", videoID,
			"userID", userID,
			"error", err) // err is already sanitized by youtube client

		// Generic error for GraphQL response
		return nil, fmt.Errorf("failed to fetch video metadata")
	}

	// 5. Build content with canonical URL
	lengthUnits := "seconds"
	content := &domain.Content{
		Name:          metadata.Title,
		URL:           &canonicalURL,
		ContentType:   domain.ContentTypeYouTubeVideo,
		AddedByUserID: userID,
		Length:        &metadata.Duration,
		LengthUnits:   &lengthUnits,
		LengthDisplay: domain.YouTubeLengthDisplay(),
		Response:      metadata.Response,
	}

	if jobID, ok := importJobIDFrom(ctx); ok {
		content.ImportJobID = &jobID
	}

	// 6. Atomic upsert — handles concurrent race condition
	// refreshOnConflict=true: update response/updated_at if URL already exists (refreshes metadata)
	created, alreadyExisted, err := s.repo.GetOrCreateByURL(ctx, content, true)
	if err != nil {
		return nil, fmt.Errorf("failed to save content: %w", err)
	}

	if alreadyExisted {
		return created, domain.ErrAlreadyExists
	}

	return created, nil
}

// GetByID retrieves content by ID
func (s *ContentService) GetByID(ctx context.Context, id int) (*domain.Content, error) {
	if id <= 0 {
		return nil, fmt.Errorf("%w: content id must be a positive integer", domain.ErrInvalidInput)
	}

	content, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("failed to get content: %w", err)
	}
	return content, nil
}

// GetByIDs loads many content rows in one query (backs the content dataloader).
// Non-positive ids are dropped rather than queried.
func (s *ContentService) GetByIDs(ctx context.Context, ids []int) ([]*domain.Content, error) {
	valid := make([]int, 0, len(ids))
	for _, id := range ids {
		if id > 0 {
			valid = append(valid, id)
		}
	}
	items, err := s.repo.GetByIDs(ctx, valid)
	if err != nil {
		return nil, fmt.Errorf("failed to get content: %w", err)
	}
	return items, nil
}

// UpdateSourceData refreshes an existing content item's metadata by re-fetching it from
// the source (YouTube) and performing a direct UPDATE of the stored row. Unlike
// CreateFromYouTube's upsert path, this always operates on a known existing row by ID —
// it never inserts, and it never touches created_at or added_by_user_id.
func (s *ContentService) UpdateSourceData(ctx context.Context, contentID int) (*domain.Content, error) {
	if contentID <= 0 {
		return nil, fmt.Errorf("%w: content id must be a positive integer", domain.ErrInvalidInput)
	}

	existing, err := s.repo.GetByID(ctx, contentID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("%w: content not found", domain.ErrNotFound)
		}
		return nil, fmt.Errorf("failed to get content: %w", err)
	}
	if existing.URL == nil {
		return nil, fmt.Errorf("%w: content has no source URL to refresh", domain.ErrInvalidInput)
	}

	switch existing.ContentType {
	case domain.ContentTypeBook:
		return s.refreshBook(ctx, existing)
	case "", domain.ContentTypeYouTubeVideo:
		// YouTube rows (and rows loaded without a type, as in older tests) take the path below.
	default:
		// Movie refresh is out of scope; other types have no refresh source yet.
		return nil, fmt.Errorf("%w: content type %s cannot be refreshed", domain.ErrInvalidInput, existing.ContentType)
	}

	videoID, err := s.youtubeClient.ExtractVideoID(*existing.URL)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", domain.ErrInvalidURL, err)
	}

	metadata, err := s.youtubeClient.GetVideoMetadata(ctx, videoID)
	if err != nil {
		slog.Error("failed to fetch YouTube metadata for refresh",
			"videoID", videoID,
			"contentID", contentID,
			"error", err)
		return nil, fmt.Errorf("failed to fetch video metadata")
	}

	updated, err := s.repo.UpdateMetadata(ctx, contentID, metadata.Title, metadata.Response, &metadata.Duration)
	if err != nil {
		return nil, fmt.Errorf("failed to update content metadata: %w", err)
	}

	return updated, nil
}

// refreshBook re-reads a BOOK row's work from Open Library. The work id comes
// from the stored URL, the search record gives fresh metadata, and the work
// record is best effort. The existing description, related works and
// resolvedFromISBN are carried over, so a refresh never wipes them: the
// description and related works are replaced only by a successful fetch.
func (s *ContentService) refreshBook(ctx context.Context, existing *domain.Content) (*domain.Content, error) {
	kind, workKey, err := parseBookInput(*existing.URL)
	if err != nil || kind != bookInputWorkID {
		return nil, fmt.Errorf("%w: content has no Open Library work URL to refresh", domain.ErrInvalidInput)
	}
	if s.bookSearch == nil {
		return nil, ErrBookClientUnavailable
	}

	result, err := s.lookupBookByWorkKey(ctx, workKey)
	if err != nil {
		return nil, err
	}

	// Stored values to keep. A corrupt payload only loses them, so it is logged, not fatal.
	var prev struct {
		Description      string              `json:"description"`
		RelatedWorks     []shapedRelatedWork `json:"relatedWorks"`
		ResolvedFromISBN string              `json:"resolvedFromISBN"`
	}
	if len(existing.Response) > 0 {
		if err := json.Unmarshal(existing.Response, &prev); err != nil {
			slog.Warn("stored book payload is not parseable; refreshing without its description", "contentID", existing.ID, "error", err)
		}
	}

	shaped := shapeBookResult(*result, s.clock())
	shaped.Description = prev.Description
	if prev.RelatedWorks != nil {
		shaped.RelatedWorks = prev.RelatedWorks
	}
	shaped.ResolvedFromISBN = prev.ResolvedFromISBN
	if work := s.fetchBookWork(ctx, workKey); work != nil {
		shaped.Description = work.Description
		shaped.RelatedWorks = shapeRelatedWorks(work.RelatedWorks)
	}

	responseJSON, err := json.Marshal(shaped)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal book response: %w", err)
	}

	updated, err := s.repo.UpdateMetadata(ctx, existing.ID, result.Title, responseJSON, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to update content metadata: %w", err)
	}
	return updated, nil
}

// CreateClaim creates a new claim content entry associated with a parent content item.
// The claim text is stored raw (preserving @this/@here tokens for display-time resolution).
// The parent content ID and raw text are stored in the response JSONB column.
func (s *ContentService) CreateClaim(ctx context.Context, input portservices.CreateClaimInput) (*domain.Content, error) {
	if input.Text == "" {
		return nil, fmt.Errorf("%w: claim text cannot be empty", domain.ErrInvalidInput)
	}
	if input.UserID <= 0 {
		return nil, fmt.Errorf("%w: user id must be a positive integer", domain.ErrInvalidInput)
	}
	if input.ParentContentID <= 0 {
		return nil, fmt.Errorf("%w: parent content id must be a positive integer", domain.ErrInvalidInput)
	}

	// Validate parent content exists
	_, err := s.repo.GetByID(ctx, input.ParentContentID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("%w: parent content not found", domain.ErrNotFound)
		}
		return nil, fmt.Errorf("failed to validate parent content: %w", err)
	}

	// Build response JSONB: stores parentContentId and raw text for reference resolution
	responsePayload := map[string]interface{}{
		"parentContentId": input.ParentContentID,
		"text":            input.Text,
	}
	responseJSON, err := json.Marshal(responsePayload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal claim response: %w", err)
	}

	content := &domain.Content{
		Name:          input.Text,
		ContentType:   domain.ContentTypeClaim,
		AddedByUserID: input.UserID,
		Response:      responseJSON,
	}

	created, err := s.repo.Create(ctx, content)
	if err != nil {
		return nil, fmt.Errorf("failed to save claim: %w", err)
	}

	return created, nil
}

// ListContent retrieves a paginated list of content
func (s *ContentService) ListContent(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error) {
	if params.First != nil {
		if *params.First < 1 || *params.First > 100 {
			return nil, fmt.Errorf("%w: first must be between 1 and 100", domain.ErrInvalidInput)
		}
	}
	if params.Last != nil {
		if *params.Last < 1 || *params.Last > 100 {
			return nil, fmt.Errorf("%w: last must be between 1 and 100", domain.ErrInvalidInput)
		}
	}

	result, err := s.repo.List(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("failed to list content: %w", err)
	}

	return result, nil
}

// CreateFromPassage finds or creates the BIBLE_PASSAGE content row for a verse
// range. Verse ordinals are computed from bible_book.verses_per_chapter, which
// also validates that the chapter/verse exist. The canonical URL (the dedupe
// key) and name are always regenerated from the resolved book — never taken
// from user input — and dedupe reuses the atomic ON CONFLICT(url) upsert.
func (s *ContentService) CreateFromPassage(ctx context.Context, input portservices.CreatePassageInput) (*domain.Content, error) {
	if s.bibleRepo == nil {
		return nil, errors.New("bible passage support is not configured")
	}
	if input.EndChapter < input.StartChapter ||
		(input.EndChapter == input.StartChapter && input.EndVerse < input.StartVerse) {
		return nil, fmt.Errorf("%w: passage end is before its start", domain.ErrInvalidPassage)
	}

	books, err := s.bibleRepo.ListBooks(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to load bible reference data: %w", err)
	}
	startID, err := domain.BibleVerseOrdinal(books, input.BookID, input.StartChapter, input.StartVerse)
	if err != nil {
		return nil, err
	}
	endID, err := domain.BibleVerseOrdinal(books, input.BookID, input.EndChapter, input.EndVerse)
	if err != nil {
		return nil, err
	}
	var bookName string
	for _, b := range books {
		if b.ID == input.BookID {
			bookName = b.Name
			break
		}
	}

	canonicalURL := domain.CanonicalPassageURL(bookName, input.StartChapter, input.StartVerse, input.EndChapter, input.EndVerse)
	content := &domain.Content{
		Name:          domain.CanonicalPassageName(bookName, input.StartChapter, input.StartVerse, input.EndChapter, input.EndVerse),
		URL:           &canonicalURL,
		ContentType:   domain.ContentTypeBiblePassage,
		AddedByUserID: input.UserID,
		VerseStartID:  &startID,
		VerseEndID:    &endID,
	}

	result, existed, err := s.repo.GetOrCreateByURL(ctx, content, false)
	if err != nil {
		return nil, fmt.Errorf("failed to create passage content: %w", err)
	}
	if existed {
		return result, domain.ErrAlreadyExists
	}
	return result, nil
}

// MaxPassageDisplayTitleLength caps a passage's optional display title (in characters).
const MaxPassageDisplayTitleLength = 200

// SetPassageDisplayTitle sets a passage's optional title, first-write-wins: a
// losing writer gets the winning title back on the returned content rather than
// an error, since their intent (this passage should have a title) was met.
func (s *ContentService) SetPassageDisplayTitle(ctx context.Context, contentID int, title string) (*domain.Content, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return nil, fmt.Errorf("%w: title must not be empty", domain.ErrInvalidInput)
	}
	if utf8.RuneCountInString(title) > MaxPassageDisplayTitleLength {
		return nil, fmt.Errorf("%w: title must be at most %d characters", domain.ErrInvalidInput, MaxPassageDisplayTitleLength)
	}

	content, err := s.getPassage(ctx, contentID)
	if err != nil {
		return nil, err
	}
	winning, err := s.repo.SetDisplayTitleIfEmpty(ctx, contentID, title)
	if err != nil {
		return nil, err
	}
	content.DisplayTitle = &winning
	return content, nil
}

// ClearPassageDisplayTitle resets a passage's title to NULL. Authorization
// (admin-only) is the caller's responsibility.
func (s *ContentService) ClearPassageDisplayTitle(ctx context.Context, contentID int) (*domain.Content, error) {
	content, err := s.getPassage(ctx, contentID)
	if err != nil {
		return nil, err
	}
	if err := s.repo.ClearDisplayTitle(ctx, contentID); err != nil {
		return nil, err
	}
	content.DisplayTitle = nil
	return content, nil
}

// getPassage loads a content row and requires it to be a BIBLE_PASSAGE.
func (s *ContentService) getPassage(ctx context.Context, contentID int) (*domain.Content, error) {
	content, err := s.repo.GetByID(ctx, contentID)
	if err != nil {
		return nil, err
	}
	if content.ContentType != domain.ContentTypeBiblePassage {
		return nil, fmt.Errorf("%w: content %d is not a Bible passage", domain.ErrInvalidInput, contentID)
	}
	return content, nil
}

// MaxPassageTextVerses bounds a single passageText read so a client can't pull
// the whole Bible in one query. Sized above the largest single book (Psalms,
// 2,461 verses); the frontend links out instead of rendering long passages.
const MaxPassageTextVerses = 2500

// PassageText returns the stored BSB text for verse ordinals startVerseID..endVerseID.
func (s *ContentService) PassageText(ctx context.Context, startVerseID, endVerseID int) (*domain.PassageText, error) {
	if s.bibleRepo == nil {
		return nil, errors.New("bible passage support is not configured")
	}
	if startVerseID < 1 || endVerseID < startVerseID {
		return nil, fmt.Errorf("%w: invalid verse range %d-%d", domain.ErrInvalidPassage, startVerseID, endVerseID)
	}
	count := endVerseID - startVerseID + 1
	if count > MaxPassageTextVerses {
		return nil, fmt.Errorf("%w: passage exceeds %d verses", domain.ErrInvalidPassage, MaxPassageTextVerses)
	}

	books, err := s.bibleRepo.ListBooks(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to load bible reference data: %w", err)
	}
	texts, err := s.bibleRepo.GetVerseTexts(ctx, domain.BibleTranslationBSB, startVerseID, endVerseID)
	if err != nil {
		return nil, fmt.Errorf("failed to load passage text: %w", err)
	}
	if len(texts) != count {
		// Out-of-range ordinal, or the seeder hasn't loaded bsb.tsv into this environment.
		return nil, fmt.Errorf("%w: verses %d-%d not found (%d of %d present)", domain.ErrNotFound, startVerseID, endVerseID, len(texts), count)
	}

	verses := make([]domain.PassageVerse, len(texts))
	for i, t := range texts {
		_, chapter, verse, err := domain.BibleVerseFromOrdinal(books, t.VerseID)
		if err != nil {
			return nil, err
		}
		verses[i] = domain.PassageVerse{VerseID: t.VerseID, Chapter: chapter, Verse: verse, Text: t.Text}
	}
	return &domain.PassageText{
		Translation: domain.BibleTranslationBSB,
		Copyright:   domain.BibleTranslationBSBCopyright,
		Verses:      verses,
	}, nil
}

// PassageInterlinear returns the interlinear (original-language) data for a verse range.
// It applies the same range and size limits as PassageText. A range with no alignment
// rows (unseeded environment, omitted verses) yields an empty result, not an error, so
// the client can show plain text.
func (s *ContentService) PassageInterlinear(ctx context.Context, startVerseID, endVerseID int) (*domain.PassageInterlinear, error) {
	if s.bibleRepo == nil {
		return nil, errors.New("bible passage support is not configured")
	}
	if startVerseID < 1 || endVerseID < startVerseID {
		return nil, fmt.Errorf("%w: invalid verse range %d-%d", domain.ErrInvalidPassage, startVerseID, endVerseID)
	}
	if endVerseID-startVerseID+1 > MaxPassageTextVerses {
		return nil, fmt.Errorf("%w: passage exceeds %d verses", domain.ErrInvalidPassage, MaxPassageTextVerses)
	}

	books, err := s.bibleRepo.ListBooks(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to load bible reference data: %w", err)
	}
	rows, err := s.bibleRepo.GetInterlinearWords(ctx, startVerseID, endVerseID)
	if err != nil {
		return nil, fmt.Errorf("failed to load interlinear words: %w", err)
	}
	verses, err := domain.BuildInterlinearVerses(books, rows)
	if err != nil {
		return nil, err
	}
	return &domain.PassageInterlinear{Verses: verses}, nil
}

// YouTubeTrending returns one page of YouTube's most-popular chart. The region
// defaults to "US" and must be a two-letter ISO 3166-1 code.
func (s *ContentService) YouTubeTrending(ctx context.Context, regionCode, pageToken string) (*portservices.TrendingPage, error) {
	if s.trending == nil {
		return nil, fmt.Errorf("%w: trending is not configured", domain.ErrYouTubeAPI)
	}
	region := strings.ToUpper(strings.TrimSpace(regionCode))
	if region == "" {
		region = "US"
	}
	if len(region) != 2 || region[0] < 'A' || region[0] > 'Z' || region[1] < 'A' || region[1] > 'Z' {
		return nil, fmt.Errorf("%w: regionCode must be a two-letter country code", domain.ErrInvalidInput)
	}
	if len(pageToken) > 128 {
		return nil, fmt.Errorf("%w: pageToken is too long", domain.ErrInvalidInput)
	}
	return s.trending.GetTrending(ctx, region, strings.TrimSpace(pageToken))
}

// SearchMovies returns one page of TMDB title search results. The query is
// trimmed and must be 1-100 runes. Page 0 means page 1; otherwise it must be
// 1-500. Invalid input never reaches TMDB.
func (s *ContentService) SearchMovies(ctx context.Context, query string, page int) (*portservices.MovieSearchPage, error) {
	if s.movieSearch == nil {
		return nil, fmt.Errorf("%w: movie search is not configured", tmdb.ErrNotConfigured)
	}
	q := strings.TrimSpace(query)
	if n := utf8.RuneCountInString(q); n < 1 || n > 100 {
		return nil, fmt.Errorf("%w: query must be 1-100 characters", domain.ErrInvalidInput)
	}
	if page == 0 {
		page = 1
	}
	if page < 1 || page > 500 {
		return nil, fmt.Errorf("%w: page must be between 1 and 500", domain.ErrInvalidInput)
	}
	return s.movieSearch.SearchMovies(ctx, q, page)
}

// TrendingMovies returns one page of TMDB's trending movies. An empty window
// means WEEK and anything other than DAY or WEEK is invalid. Page 0 means 1;
// otherwise it must be 1-500. Invalid input never reaches TMDB.
func (s *ContentService) TrendingMovies(ctx context.Context, window domain.TrendingWindow, page int) (*portservices.MovieSearchPage, error) {
	if s.movieTrending == nil {
		return nil, fmt.Errorf("%w: movie trending is not configured", tmdb.ErrNotConfigured)
	}
	if window == "" {
		window = domain.TrendingWindowWeek
	}
	if window != domain.TrendingWindowDay && window != domain.TrendingWindowWeek {
		return nil, fmt.Errorf("%w: window must be DAY or WEEK", domain.ErrInvalidInput)
	}
	if page == 0 {
		page = 1
	}
	if page < 1 || page > 500 {
		return nil, fmt.Errorf("%w: page must be between 1 and 500", domain.ErrInvalidInput)
	}
	return s.movieTrending.TrendingMovies(ctx, window, page)
}

// ErrMovieClientUnavailable is returned by CreateFromMovie when the service was
// built without a movie client. Resolvers show clients a generic message.
var ErrMovieClientUnavailable = errors.New("movie lookup is unavailable: no movie client configured")

// CreateFromMovie creates MOVIE content from a TMDB or IMDb movie URL (or bare IMDb id),
// attributed to the given user. If the movie already exists, returns the existing content
// along with ErrAlreadyExists. Duplicates are detected by canonical TMDB URL before any
// metadata fetch, so a repeat add costs no TMDB metadata call.
func (s *ContentService) CreateFromMovie(ctx context.Context, rawURL string, userID int) (*domain.Content, error) {
	tmdbID, imdbID, err := tmdb.ParseMovieInput(rawURL)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", domain.ErrInvalidInput, err)
	}

	if s.movieClient == nil {
		slog.Error("movie lookup requested but no movie client is configured", "userID", userID)
		return nil, ErrMovieClientUnavailable
	}

	// IMDb ids must be resolved to a TMDB id so both URL forms dedupe to one row.
	if tmdbID == 0 {
		tmdbID, err = s.movieClient.FindMovieByIMDbID(ctx, imdbID)
		if err != nil {
			if errors.Is(err, domain.ErrNotFound) {
				return nil, fmt.Errorf("%w: movie not found", domain.ErrNotFound)
			}
			slog.Error("failed to resolve IMDb id", "imdbID", imdbID, "userID", userID, "error", err)
			return nil, fmt.Errorf("failed to fetch movie metadata")
		}
	}

	canonicalURL := tmdb.CanonicalMovieURL(tmdbID)

	existing, err := s.repo.GetByURL(ctx, canonicalURL)
	if err == nil && existing != nil {
		return existing, domain.ErrAlreadyExists
	}
	if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return nil, fmt.Errorf("failed to check existing content: %w", err)
	}

	metadata, err := s.movieClient.GetMovie(ctx, tmdbID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("%w: movie not found", domain.ErrNotFound)
		}
		// Log details server-side; clients get a generic message.
		slog.Error("failed to fetch movie metadata", "tmdbID", tmdbID, "userID", userID, "error", err)
		return nil, fmt.Errorf("failed to fetch movie metadata")
	}

	// Policy: NC-17 and TMDB-adult movies are not enabled. Checked before any write.
	if movieNotAllowed(metadata.Response) {
		return nil, domain.ErrContentNotAllowed
	}

	content := &domain.Content{
		Name:          metadata.Title,
		URL:           &canonicalURL,
		ContentType:   domain.ContentTypeMovie,
		AddedByUserID: userID,
		Length:        metadata.RuntimeSeconds,
		Response:      metadata.Response,
	}
	if metadata.RuntimeSeconds != nil {
		lengthUnits := "seconds"
		content.LengthUnits = &lengthUnits
		// TMDB reports runtime in whole minutes; Length holds them as seconds.
		content.LengthDisplay = domain.TMDBLengthDisplay()
	}
	if jobID, ok := importJobIDFrom(ctx); ok {
		content.ImportJobID = &jobID
	}

	created, alreadyExisted, err := s.repo.GetOrCreateByURL(ctx, content, true)
	if err != nil {
		return nil, fmt.Errorf("failed to save content: %w", err)
	}
	if alreadyExisted {
		return created, domain.ErrAlreadyExists
	}
	return created, nil
}

// movieNotAllowed is the single content policy for movies: it rejects a shaped
// movie payload that is NC-17 (case-insensitive, whitespace-trimmed) or flagged
// adult by TMDB. Unparseable or empty payloads are allowed.
func movieNotAllowed(response json.RawMessage) bool {
	var shaped struct {
		Certification string `json:"certification"`
		Adult         bool   `json:"adult"`
	}
	if err := json.Unmarshal(response, &shaped); err != nil {
		return false
	}
	return shaped.Adult || strings.EqualFold(strings.TrimSpace(shaped.Certification), "NC-17")
}

// bookWorkLinkRe and bookEditionLinkRe find an Open Library work or edition id
// in a pasted link. The scheme and www are optional and the match is not
// anchored at the front, like the Movie parser; any slug, query or fragment
// after the id is ignored. The id is the only thing kept, so the stored URL
// is always canonicalBookURL(workKey).
var (
	bookWorkLinkRe    = regexp.MustCompile(`(?i)openlibrary\.org/works/(OL\d+W)(?:[/?#]|$)`)
	bookEditionLinkRe = regexp.MustCompile(`(?i)openlibrary\.org/books/(OL\d+M)(?:[/?#]|$)`)
)

// isbnRe matches a normalised ISBN-10 (9 digits + digit or X) or ISBN-13
// (13 digits). Input is normalised by normalizeISBN first.
var isbnRe = regexp.MustCompile(`^(?:\d{9}[0-9X]|\d{13})$`)

// bookInputKind says which form of book input parseBookInput recognised.
type bookInputKind int

const (
	bookInputWorkID bookInputKind = iota + 1
	bookInputEditionID
	bookInputISBN
)

// parseBookInput classifies a pasted Open Library work link, edition link or
// ISBN and returns its bare id: a work id (OL…W), an edition id (OL…M) or a
// normalised ISBN. Anything else is ErrInvalidInput, before any URL is built.
func parseBookInput(raw string) (bookInputKind, string, error) {
	s := strings.TrimSpace(raw)
	if m := bookWorkLinkRe.FindStringSubmatch(s); m != nil {
		return bookInputWorkID, strings.ToUpper(m[1]), nil
	}
	if m := bookEditionLinkRe.FindStringSubmatch(s); m != nil {
		return bookInputEditionID, strings.ToUpper(m[1]), nil
	}
	if isbn := normalizeISBN(s); isbnRe.MatchString(isbn) {
		return bookInputISBN, isbn, nil
	}
	return 0, "", fmt.Errorf("%w: not an Open Library work or edition link, or an ISBN", domain.ErrInvalidInput)
}

// normalizeISBN drops spaces and hyphens and uppercases a trailing X. It does
// not validate the result; parseBookInput and ResolveBookISBN do that.
func normalizeISBN(raw string) string {
	var b strings.Builder
	for _, r := range raw {
		switch {
		case unicode.IsSpace(r) || r == '-':
			continue
		case r == 'x':
			b.WriteRune('X')
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

// ErrBookClientUnavailable is returned by CreateFromBook, SearchBooks,
// TrendingBooks and ResolveBookISBN when the service was built without the
// relevant Open Library client. Resolvers show clients a generic message.
var ErrBookClientUnavailable = errors.New("book lookup is unavailable: no book client configured")

// canonicalBookURL is the canonical content URL stored for an Open Library work.
func canonicalBookURL(workKey string) string {
	return "https://openlibrary.org/works/" + workKey
}

// shapedBook is the JSON shape stored in Content.Response for BOOK content,
// mirroring BookSearchResult's fields in camelCase. Slice fields are never
// nil so a missing Open Library field (e.g. no author_name) marshals to []
// rather than null.
type shapedBook struct {
	WorkKey          string         `json:"workKey"`
	Title            string         `json:"title"`
	Authors          []shapedAuthor `json:"authors"`
	CoverID          *int           `json:"coverId"`
	FirstPublishYear *int           `json:"firstPublishYear"`
	PageCountMedian  *int           `json:"pageCountMedian"`
	Subjects         []string       `json:"subjects"`
	RatingsAverage   *float64       `json:"ratingsAverage"`
	RatingsCount     *int           `json:"ratingsCount"`
	EditionCount     *int           `json:"editionCount"`
	// Reading-log counts (Open Library users only) are a snapshot taken at
	// ReadingLogFetchedAt (RFC 3339 UTC); nil when Open Library omitted one.
	WantToReadCount       *int   `json:"wantToReadCount"`
	CurrentlyReadingCount *int   `json:"currentlyReadingCount"`
	AlreadyReadCount      *int   `json:"alreadyReadCount"`
	ReadingLogCount       *int   `json:"readingLogCount"`
	ReadingLogFetchedAt   string `json:"readingLogFetchedAt,omitempty"`
	// Description comes from the work record; omitted when empty.
	Description string `json:"description,omitempty"`
	// RelatedWorks comes from the work record; never nil (empty list when none).
	RelatedWorks []shapedRelatedWork `json:"relatedWorks"`
	// ResolvedFromISBN is the normalised ISBN the user supplied, when the book
	// was added by ISBN. Metadata only; identity stays the work URL.
	ResolvedFromISBN string `json:"resolvedFromISBN,omitempty"`
}

// shapedRelatedWork is one related-works link in a stored book.
type shapedRelatedWork struct {
	Title string `json:"title"`
	URL   string `json:"url"`
}

// shapeRelatedWorks converts work-record related works to their stored shape.
// Never returns nil.
func shapeRelatedWorks(in []portservices.BookRelatedWork) []shapedRelatedWork {
	out := make([]shapedRelatedWork, 0, len(in))
	for _, r := range in {
		out = append(out, shapedRelatedWork{Title: r.Title, URL: r.URL})
	}
	return out
}

// shapedAuthor is one entry of a stored book's authors list. OpenLibraryKey is
// omitted when Open Library gave no key for this author.
type shapedAuthor struct {
	Name           string `json:"name"`
	OpenLibraryKey string `json:"openLibraryKey,omitempty"`
}

// shapeAuthors pairs each author name with its Open Library key by index, but
// only when the two lists have equal length. With any mismatch the names are
// kept and no key is attached, since a key on the wrong author is worse than
// none. Never returns nil.
func shapeAuthors(names, keys []string) []shapedAuthor {
	authors := make([]shapedAuthor, 0, len(names))
	paired := len(names) == len(keys)
	for i, name := range names {
		a := shapedAuthor{Name: name}
		if paired {
			a.OpenLibraryKey = keys[i]
		}
		authors = append(authors, a)
	}
	return authors
}

// shapeBookResult converts a BookSearchResult to the JSON shape stored in
// Content.Response.
func shapeBookResult(r portservices.BookSearchResult, fetchedAt time.Time) shapedBook {
	subjects := r.Subjects
	if subjects == nil {
		subjects = []string{}
	}
	return shapedBook{
		WorkKey:          r.WorkKey,
		Title:            r.Title,
		Authors:          shapeAuthors(r.AuthorName, r.AuthorKey),
		RelatedWorks:     []shapedRelatedWork{},
		CoverID:          r.CoverID,
		FirstPublishYear: r.FirstPublishYear,
		PageCountMedian:  r.PageCountMedian,
		Subjects:         subjects,
		RatingsAverage:   r.RatingsAverage,
		RatingsCount:     r.RatingsCount,
		EditionCount:     r.EditionCount,

		WantToReadCount:       r.WantToReadCount,
		CurrentlyReadingCount: r.CurrentlyReadingCount,
		AlreadyReadCount:      r.AlreadyReadCount,
		ReadingLogCount:       r.ReadingLogCount,
		ReadingLogFetchedAt:   fetchedAt.UTC().Format(time.RFC3339),
	}
}

// clock returns the snapshot time, defaulting to the wall clock.
func (s *ContentService) clock() time.Time {
	if s.now != nil {
		return s.now()
	}
	return time.Now()
}

// lookupBookByWorkKey resolves a bare Open Library work key (e.g. "OL23166W")
// to its BookSearchResult via search.json.
//
// search.json has no documented "look up a work by key directly" parameter.
// Verified live (2026-11-09): q=key:"/works/OL23166W" returns exactly that
// work as the sole result (numFound=1), so that is the query used here.
func (s *ContentService) lookupBookByWorkKey(ctx context.Context, workKey string) (*portservices.BookSearchResult, error) {
	page, err := s.bookSearch.SearchBooks(ctx, fmt.Sprintf(`key:"/works/%s"`, workKey), 1)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("%w: book not found", domain.ErrNotFound)
		}
		// Log details server-side; clients get a generic message.
		slog.Error("failed to fetch book metadata", "workKey", workKey, "error", err)
		return nil, fmt.Errorf("failed to fetch book metadata")
	}
	if len(page.Items) == 0 {
		return nil, fmt.Errorf("%w: book not found", domain.ErrNotFound)
	}
	return &page.Items[0], nil
}

// CreateFromBook creates BOOK content from an Open Library work URL
// (https://openlibrary.org/works/<id>) or a bare ISBN-10/13, attributed to
// the given user. If the work already exists, returns the existing content
// along with domain.ErrAlreadyExists. Duplicates are detected by canonical
// work URL before any Open Library search call, so a repeat add costs no
// extra lookup beyond ISBN resolution (when the input was an ISBN).
func (s *ContentService) CreateFromBook(ctx context.Context, rawURLOrISBN string, userID int) (*domain.Content, error) {
	kind, id, err := parseBookInput(rawURLOrISBN)
	if err != nil {
		return nil, err
	}

	if s.bookSearch == nil {
		return nil, ErrBookClientUnavailable
	}

	var workKey, isbn string
	switch kind {
	case bookInputWorkID:
		workKey = id
	case bookInputEditionID:
		if s.bookWork == nil {
			return nil, ErrBookClientUnavailable
		}
		resolved, err := s.bookWork.ResolveEdition(ctx, id)
		if err != nil {
			if errors.Is(err, domain.ErrNotFound) {
				return nil, fmt.Errorf("%w: edition not found", domain.ErrNotFound)
			}
			slog.Error("failed to resolve edition", "editionID", id, "userID", userID, "error", err)
			return nil, fmt.Errorf("failed to resolve edition")
		}
		workKey = resolved
	case bookInputISBN:
		if s.bookISBN == nil {
			return nil, ErrBookClientUnavailable
		}
		resolved, err := s.bookISBN.ResolveISBN(ctx, id)
		if err != nil {
			if errors.Is(err, domain.ErrNotFound) {
				return nil, fmt.Errorf("%w: isbn not found", domain.ErrNotFound)
			}
			slog.Error("failed to resolve isbn", "isbn", id, "userID", userID, "error", err)
			return nil, fmt.Errorf("failed to resolve isbn")
		}
		workKey = resolved
		isbn = id
	}

	canonicalURL := canonicalBookURL(workKey)

	existing, err := s.repo.GetByURL(ctx, canonicalURL)
	if err == nil && existing != nil {
		return existing, domain.ErrAlreadyExists
	}
	if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return nil, fmt.Errorf("failed to check existing content: %w", err)
	}

	result, err := s.lookupBookByWorkKey(ctx, workKey)
	if err != nil {
		return nil, err
	}

	shaped := shapeBookResult(*result, s.clock())
	if work := s.fetchBookWork(ctx, workKey); work != nil {
		shaped.Description = work.Description
		shaped.RelatedWorks = shapeRelatedWorks(work.RelatedWorks)
	}
	shaped.ResolvedFromISBN = isbn

	responseJSON, err := json.Marshal(shaped)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal book response: %w", err)
	}

	content := &domain.Content{
		Name:          result.Title,
		URL:           &canonicalURL,
		ContentType:   domain.ContentTypeBook,
		AddedByUserID: userID,
		Response:      responseJSON,
	}

	created, alreadyExisted, err := s.repo.GetOrCreateByURL(ctx, content, true)
	if err != nil {
		return nil, fmt.Errorf("failed to save content: %w", err)
	}
	if alreadyExisted {
		return created, domain.ErrAlreadyExists
	}
	return created, nil
}

// fetchBookWork reads the work record's description and related works. It is
// best effort: a nil result means no client is configured or the fetch failed,
// and the caller keeps going without description data. Errors are logged
// without upstream detail.
func (s *ContentService) fetchBookWork(ctx context.Context, workKey string) *portservices.BookWork {
	if s.bookWork == nil {
		return nil
	}
	work, err := s.bookWork.FetchWork(ctx, workKey)
	if err != nil {
		slog.Warn("failed to fetch book work record; continuing without description", "workKey", workKey, "error", err)
		return nil
	}
	return work
}

// SearchBooks returns one page of Open Library work search results. The
// query is trimmed and must be 1-100 runes. Page 0 means page 1; otherwise it
// must be 1-500. Invalid input never reaches Open Library.
func (s *ContentService) SearchBooks(ctx context.Context, query string, page int) (*portservices.BookSearchPage, error) {
	if s.bookSearch == nil {
		return nil, ErrBookClientUnavailable
	}
	q := strings.TrimSpace(query)
	if n := utf8.RuneCountInString(q); n < 1 || n > 100 {
		return nil, fmt.Errorf("%w: query must be 1-100 characters", domain.ErrInvalidInput)
	}
	if page == 0 {
		page = 1
	}
	if page < 1 || page > 500 {
		return nil, fmt.Errorf("%w: page must be between 1 and 500", domain.ErrInvalidInput)
	}
	return s.bookSearch.SearchBooks(ctx, q, page)
}

// TrendingBooks returns one page of Open Library's trending books. An empty
// window means WEEK and anything other than DAY or WEEK is invalid. Page 0
// means 1; otherwise it must be 1-500. Invalid input never reaches Open
// Library.
func (s *ContentService) TrendingBooks(ctx context.Context, window domain.TrendingWindow, page int) (*portservices.BookSearchPage, error) {
	if s.bookTrending == nil {
		return nil, ErrBookClientUnavailable
	}
	if window == "" {
		window = domain.TrendingWindowWeek
	}
	if window != domain.TrendingWindowDay && window != domain.TrendingWindowWeek {
		return nil, fmt.Errorf("%w: window must be DAY or WEEK", domain.ErrInvalidInput)
	}
	if page == 0 {
		page = 1
	}
	if page < 1 || page > 500 {
		return nil, fmt.Errorf("%w: page must be between 1 and 500", domain.ErrInvalidInput)
	}
	return s.bookTrending.TrendingBooks(ctx, window, page)
}

// ResolveBookISBN resolves an ISBN-10/13 to its Open Library work and returns
// the BookSearchResult without writing. Backs the ISBN tab's
// preview-before-add (spec Section 5).
func (s *ContentService) ResolveBookISBN(ctx context.Context, isbn string) (*portservices.BookSearchResult, error) {
	raw := normalizeISBN(isbn)
	if !isbnRe.MatchString(raw) {
		return nil, fmt.Errorf("%w: not a valid ISBN", domain.ErrInvalidInput)
	}
	if s.bookISBN == nil || s.bookSearch == nil {
		return nil, ErrBookClientUnavailable
	}

	workKey, err := s.bookISBN.ResolveISBN(ctx, raw)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("%w: isbn not found", domain.ErrNotFound)
		}
		slog.Error("failed to resolve isbn", "isbn", raw, "error", err)
		return nil, fmt.Errorf("failed to resolve isbn")
	}
	return s.lookupBookByWorkKey(ctx, workKey)
}
