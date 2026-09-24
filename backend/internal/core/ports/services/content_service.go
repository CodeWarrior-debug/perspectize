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

// ContentService defines the contract for content business logic
type ContentService interface {
	// CreateFromYouTube creates content from a YouTube URL, attributed to the given user
	CreateFromYouTube(ctx context.Context, url string, userID int) (*domain.Content, error)

	// GetByID retrieves content by ID
	GetByID(ctx context.Context, id int) (*domain.Content, error)

	// ListContent retrieves a paginated list of content
	ListContent(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error)

	// CreateClaim creates a new claim content entry associated with a parent content item
	CreateClaim(ctx context.Context, input CreateClaimInput) (*domain.Content, error)

	// UpdateSourceData refreshes an existing content item's metadata from its source
	UpdateSourceData(ctx context.Context, contentID int) (*domain.Content, error)
}
