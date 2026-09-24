package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/youtube"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// ContentService implements business logic for content operations
type ContentService struct {
	repo          repositories.ContentRepository
	youtubeClient portservices.YouTubeClient
}

// NewContentService creates a new content service
func NewContentService(repo repositories.ContentRepository, yt portservices.YouTubeClient) *ContentService {
	return &ContentService{
		repo:          repo,
		youtubeClient: yt,
	}
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
		ContentType:   domain.ContentTypeYouTube,
		AddedByUserID: userID,
		Length:        &metadata.Duration,
		LengthUnits:   &lengthUnits,
		Response:      metadata.Response,
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
