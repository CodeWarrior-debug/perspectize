package services

import (
	"context"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// CreateClaimInput holds the input for creating a claim content entry
type CreateClaimInput struct {
	Text            string
	UserID          int
	ParentContentID int
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

	// CreateFromPassage finds or creates the BIBLE_PASSAGE content row for a verse range.
	// If the range already exists, returns the existing content along with ErrAlreadyExists.
	CreateFromPassage(ctx context.Context, input CreatePassageInput) (*domain.Content, error)

	// SetPassageDisplayTitle sets a passage's optional title, first-write-wins. If a title already
	// exists, the existing title is kept and returned on the content (not an error).
	SetPassageDisplayTitle(ctx context.Context, contentID int, title string) (*domain.Content, error)

	// ClearPassageDisplayTitle resets a passage's title to NULL so it can be set again.
	// Callers are responsible for authorizing (admin-only).
	ClearPassageDisplayTitle(ctx context.Context, contentID int) (*domain.Content, error)

	// GetByID retrieves content by ID
	GetByID(ctx context.Context, id int) (*domain.Content, error)

	// ListContent retrieves a paginated list of content
	ListContent(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error)

	// CreateClaim creates a new claim content entry associated with a parent content item
	CreateClaim(ctx context.Context, input CreateClaimInput) (*domain.Content, error)

	// UpdateSourceData refreshes an existing content item's metadata from its source
	UpdateSourceData(ctx context.Context, contentID int) (*domain.Content, error)
}
