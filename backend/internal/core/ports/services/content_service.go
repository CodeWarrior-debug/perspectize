package services

import (
	"context"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// CreateClaimInput holds the input for creating a claim content entry.
// ParentContentID is optional: a claim may stand alone. EffectiveDate
// (YYYY-MM-DD) defaults to today UTC when nil or empty; EvaluateBy
// (YYYY-MM-DD) is optional and nil or empty means unset.
type CreateClaimInput struct {
	Text            string
	UserID          int
	ParentContentID *int
	EffectiveDate   *string
	EvaluateBy      *string
}

// UpdateClaimInput holds the input for replacing a claim's text and dates.
// ActorUserID must own the claim. Nil or empty EffectiveDate means today UTC;
// nil or empty EvaluateBy clears the evaluate-by date.
type UpdateClaimInput struct {
	ContentID     int
	ActorUserID   int
	Text          string
	EffectiveDate *string
	EvaluateBy    *string
}

// DeleteClaimInput holds the input for deleting a claim. ActorUserID must own it.
// KeepAnonymous hands the claim to the [deleted] sentinel user instead of deleting it.
type DeleteClaimInput struct {
	ContentID     int
	ActorUserID   int
	KeepAnonymous bool
}

// CreatePassageInput holds the input for creating (or finding) a Bible passage
// content entry. EndChapter/EndVerse equal StartChapter/StartVerse for a single verse.
type CreatePassageInput struct {
	BookID       int
	StartChapter int
	StartVerse   int
	EndChapter   int
	EndVerse     int
	UserID       int
}

// ContentService defines the contract for content business logic
type ContentService interface {
	// CreateFromYouTube creates content from a YouTube URL, attributed to the given user
	CreateFromYouTube(ctx context.Context, url string, userID int) (*domain.Content, error)
	// CreateFromMovie creates MOVIE content from a TMDB or IMDb movie URL (or bare IMDb id), attributed to the given user.
	// If the movie already exists, returns the existing content along with ErrAlreadyExists.
	CreateFromMovie(ctx context.Context, rawURL string, userID int) (*domain.Content, error)

	// CreateFromPassage finds or creates the BIBLE_PASSAGE content row for a verse range.
	// If the range already exists, returns the existing content along with ErrAlreadyExists.
	CreateFromPassage(ctx context.Context, input CreatePassageInput) (*domain.Content, error)

	// SetPassageDisplayTitle sets a passage's optional title, first-write-wins. If a title already
	// exists, the existing title is kept and returned on the content (not an error).
	SetPassageDisplayTitle(ctx context.Context, contentID int, title string) (*domain.Content, error)

	// ClearPassageDisplayTitle resets a passage's title to NULL so it can be set again.
	// Callers are responsible for authorizing (admin-only).
	ClearPassageDisplayTitle(ctx context.Context, contentID int) (*domain.Content, error)

	// PassageText returns the stored BSB text for the verse-ordinal range startVerseID..endVerseID.
	PassageText(ctx context.Context, startVerseID, endVerseID int) (*domain.PassageText, error)

	// PassageInterlinear returns word alignment for the verse-ordinal range startVerseID..endVerseID.
	// Verses without alignment data are absent from the result (not an error).
	PassageInterlinear(ctx context.Context, startVerseID, endVerseID int) (*domain.PassageInterlinear, error)

	// GetByID retrieves content by ID
	GetByID(ctx context.Context, id int) (*domain.Content, error)
	// GetByIDs loads many content rows in one query (the content dataloader);
	// missing ids are absent.
	GetByIDs(ctx context.Context, ids []int) ([]*domain.Content, error)

	// ListContent retrieves a paginated list of content
	ListContent(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error)

	// CreateClaim creates a new claim content entry associated with a parent content item
	CreateClaim(ctx context.Context, input CreateClaimInput) (*domain.Content, error)

	// UpdateClaim replaces an owned claim's text and dates. A claim the actor
	// does not own is domain.ErrNotFound.
	UpdateClaim(ctx context.Context, input UpdateClaimInput) (*domain.Content, error)
	// DeleteClaim deletes an owned claim, or with KeepAnonymous hands it to the
	// [deleted] sentinel user. A claim another user has a perspective or plan item on
	// can't be deleted: domain.ErrClaimHasOthers (use KeepAnonymous instead).
	DeleteClaim(ctx context.Context, input DeleteClaimInput) error

	// UpdateSourceData refreshes an existing content item's metadata from its source.
	// viewerID must be able to see the row (0 for anonymous); a row they can't see
	// is domain.ErrNotFound.
	UpdateSourceData(ctx context.Context, contentID, viewerID int) (*domain.Content, error)

	// YouTubeTrending returns one page of YouTube's most-popular chart for a
	// region (ISO 3166-1 alpha-2, e.g. "US"). Served from the backend cache, so
	// Discover visitors share one API call per page per TTL.
	YouTubeTrending(ctx context.Context, regionCode, pageToken string) (*TrendingPage, error)

	// SearchMovies returns one page of TMDB title search results for the Discover
	// page's Movies source. The query is trimmed and must be 1-100 characters;
	// page 0 means 1 and must otherwise be 1-500. Served from the backend cache.
	SearchMovies(ctx context.Context, query string, page int) (*MovieSearchPage, error)

	// TrendingMovies returns one page of TMDB's trending movies for the Discover
	// page. The window defaults to WEEK; page 0 means 1, otherwise 1-500. Served
	// from the backend cache.
	TrendingMovies(ctx context.Context, window domain.TrendingWindow, page int) (*MovieSearchPage, error)
}
