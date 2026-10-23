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
	// GetByIDs loads many content rows in one query; missing ids are absent.
	GetByIDs(ctx context.Context, ids []int) ([]*domain.Content, error)
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
	// UpdatePrimaryCategoryID sets the primary_category_id FK on a content
	// record visible to viewerID (public, or owned by viewerID) and returns the
	// updated row. A missing row, or a private row the viewer doesn't own, is
	// domain.ErrNotFound.
	UpdatePrimaryCategoryID(ctx context.Context, contentID int, categoryID *int, viewerID int) (*domain.Content, error)
	// UpdateClaim rewrites an owned claim's name, response.text/html and custom
	// fields in one owner-scoped UPDATE (keeping response.parentContentId). A
	// missing row, or a row the owner does not hold, is domain.ErrNotFound.
	UpdateClaim(ctx context.Context, id, ownerID int, text string, html string, customFields json.RawMessage) (*domain.Content, error)
	// DeleteOwnedClaim deletes an owned claim, with the owner's own perspectives
	// and plan items on it, in one transaction. If another user has a perspective
	// or plan item on it, nothing is deleted and the error is domain.ErrClaimHasOthers.
	// A row the owner does not hold is domain.ErrNotFound.
	DeleteOwnedClaim(ctx context.Context, id, ownerID int) error
	// AnonymizeOwnedClaim hands an owned claim to the [deleted] sentinel user, so
	// other users' perspectives on it keep their target. A row the owner does not
	// hold is domain.ErrNotFound.
	AnonymizeOwnedClaim(ctx context.Context, id, ownerID int) error
	// SetDisplayTitleIfEmpty sets a passage's optional display_title only if none exists
	// (first-write-wins). Returns the title that is now stored: the caller's if it won,
	// the existing one if it lost the race. Losing is not an error.
	SetDisplayTitleIfEmpty(ctx context.Context, contentID int, title string) (string, error)
	// ClearDisplayTitle resets display_title to NULL (admin escape hatch) so it can be set again.
	ClearDisplayTitle(ctx context.Context, contentID int) error
}
