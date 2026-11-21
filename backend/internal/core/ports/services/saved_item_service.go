package services

import (
	"context"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// SavedItemService defines the contract for saved item business logic. Writes
// take the authenticated actor's id and enforce ownership. Reads take the
// viewer id (nil when anonymous) and apply the privacy rule.
//
// Errors: a non-owner touching a private or deleted item gets domain.ErrNotFound;
// a non-owner touching someone else's live public item on a write gets
// domain.ErrForbidden.
type SavedItemService interface {
	// ListMine returns one page of the actor's own live items of params.Type.
	// Returns domain.ErrForbidden when actorUserID is not set.
	ListMine(ctx context.Context, actorUserID int, params domain.SavedItemListParams) (*domain.PaginatedSavedItems, error)

	// ListShared returns one page of public live items of params.Type plus the
	// viewer's own. viewerID may be nil (public items only).
	ListShared(ctx context.Context, viewerID *int, params domain.SavedItemListParams) (*domain.PaginatedSavedItems, error)

	// GetSavedItem returns the live item with the given id, or (nil, nil) when it
	// does not exist or is private to someone other than viewerID.
	GetSavedItem(ctx context.Context, id int, viewerID *int) (*domain.SavedItem, error)

	// CreateSavedItem creates an OWN item for actorUserID. Privacy defaults to
	// PRIVATE. Returns domain.ErrAlreadyExists for a name in use.
	CreateSavedItem(ctx context.Context, actorUserID int, input domain.CreateSavedItemInput) (*domain.SavedItem, error)

	// UpdateSavedItem partially updates an item the actor owns. A payload on a
	// LINK is domain.ErrInvalidInput.
	UpdateSavedItem(ctx context.Context, actorUserID int, input domain.UpdateSavedItemInput) (*domain.SavedItem, error)

	// DeleteSavedItem soft-deletes an item the actor owns.
	DeleteSavedItem(ctx context.Context, actorUserID, id int) error

	// RestoreSavedItem undoes a soft delete of an item the actor owns. A name that
	// is in use again returns domain.ErrAlreadyExists.
	RestoreSavedItem(ctx context.Context, actorUserID, id int) (*domain.SavedItem, error)

	// SetSavedItemPrivacy changes the privacy of an item the actor owns. A LINK
	// can be made public only while its source is readable.
	SetSavedItemPrivacy(ctx context.Context, actorUserID, id int, privacy domain.Privacy) (*domain.SavedItem, error)

	// CopySavedItem copies a public item into a new private item the actor owns.
	// The source must be a public OWN or COPY item; a LINK is domain.ErrInvalidInput.
	CopySavedItem(ctx context.Context, actorUserID, sourceID int) (*domain.SavedItem, error)

	// LinkSavedItem links to a public OWN or COPY item. The new item stores no
	// payload and reads its source's payload.
	LinkSavedItem(ctx context.Context, actorUserID, sourceID int) (*domain.SavedItem, error)

	// ConvertLinkToCopy turns a LINK the actor owns into a COPY of its source.
	// Returns domain.ErrNotFound when the source is no longer readable.
	ConvertLinkToCopy(ctx context.Context, actorUserID, id int) (*domain.SavedItem, error)
}
