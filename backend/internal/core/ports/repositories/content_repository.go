package repositories

import (
	"context"
	"encoding/json"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// ContentRepository defines the contract for content persistence
type ContentRepository interface {
	Create(ctx context.Context, content *domain.Content) (*domain.Content, error)
	GetByID(ctx context.Context, id int) (*domain.Content, error)
	GetByURL(ctx context.Context, url string) (*domain.Content, error)
	// GetOrCreateByURL atomically inserts content or returns existing content matching the URL.
	// When refreshOnConflict is true (default), updates response and updated_at on conflict.
	// When refreshOnConflict is false, does nothing on conflict (preserves original data).
	// Returns (*Content, true, nil) if content already existed, (*Content, false, nil) if newly created.
	GetOrCreateByURL(ctx context.Context, content *domain.Content, refreshOnConflict bool) (*domain.Content, bool, error)
	// UpdateMetadata performs a direct UPDATE of an existing content row's refreshable
	// fields (name, response, length) plus updated_at. It never touches created_at or
	// added_by_user_id, and it does not insert — the row must already exist.
	UpdateMetadata(ctx context.Context, id int, name string, response json.RawMessage, length *int) (*domain.Content, error)
	List(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error)
	ReassignByUser(ctx context.Context, fromUserID, toUserID int) error
	// UpdatePrimaryCategoryID sets the primary_category_id FK on a content record
	UpdatePrimaryCategoryID(ctx context.Context, contentID int, categoryID *int) error
}
