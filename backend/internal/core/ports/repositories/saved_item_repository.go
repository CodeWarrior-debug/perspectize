package repositories

import (
	"context"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// SavedItemRepository defines the contract for saved item persistence.
//
// Reads return live rows only (deleted_at IS NULL); a LINK's Payload and the
// SourceAvailable flag are resolved from its source in the same statement.
// Write methods that return a row (Create, Update, SetPrivacy) return the row as
// stored: a LINK comes back with a nil Payload and SourceAvailable unset, so the
// service fills those from the source it already read. Every write scopes its
// WHERE to actorUserID and to live rows; a zero-row miss is domain.ErrNotFound.
type SavedItemRepository interface {
	// List returns one page of saved items for params.Scope, of params.Type.
	// MINE is the viewer's own rows; SHARED is public rows plus the viewer's own
	// (public rows only when ViewerID is nil).
	List(ctx context.Context, params domain.SavedItemListParams) (*domain.PaginatedSavedItems, error)

	// GetByID returns the live saved item with the given id, with a LINK's payload
	// resolved. Returns domain.ErrNotFound when no live row matches. The caller
	// applies the privacy rule.
	GetByID(ctx context.Context, id int) (*domain.SavedItem, error)

	// NamesWithPrefix returns the live names of userID's items of itemType that
	// start with prefix. Used to pick a free name for a copy or link.
	NamesWithPrefix(ctx context.Context, userID int, itemType domain.SavedItemType, prefix string) ([]string, error)

	// Create inserts the item. Returns domain.ErrAlreadyExists when the owner
	// already has a live item of that type with the same name, and
	// domain.ErrInvalidInput for a failed check or a missing source.
	Create(ctx context.Context, item *domain.SavedItem) (*domain.SavedItem, error)

	// Update writes the name and, for non-LINK rows, the payload, ONLY if the row
	// belongs to actorUserID and is live. A name clash returns
	// domain.ErrAlreadyExists; a zero-row miss returns domain.ErrNotFound.
	Update(ctx context.Context, item *domain.SavedItem, actorUserID int) (*domain.SavedItem, error)

	// SetPrivacy changes the privacy of a live row owned by actorUserID.
	// domain.ErrNotFound on a zero-row miss; domain.ErrInvalidInput when the
	// database refuses the value (for example a setting made public).
	SetPrivacy(ctx context.Context, id int, privacy domain.Privacy, actorUserID int) (*domain.SavedItem, error)

	// Delete soft-deletes a live row owned by actorUserID (sets deleted_at).
	// domain.ErrNotFound on a zero-row miss.
	Delete(ctx context.Context, id int, actorUserID int) error

	// Restore clears deleted_at on a deleted row owned by actorUserID. A name
	// that is live again returns domain.ErrAlreadyExists; a zero-row miss returns
	// domain.ErrNotFound.
	Restore(ctx context.Context, id int, actorUserID int) error

	// ConvertLinkToCopy turns a LINK owned by actorUserID into a COPY, taking the
	// source's payload and payload version, in one statement. The statement
	// requires the source to be live and public. Returns domain.ErrNotFound when
	// the row is not a live LINK owned by actorUserID or its source is no longer
	// readable.
	ConvertLinkToCopy(ctx context.Context, id int, actorUserID int) (*domain.SavedItem, error)

	// ReassignByUser moves every saved item from fromUserID to toUserID, renames
	// each with a " (#<id>)" suffix, sets it private and soft-deletes it if it is
	// not already deleted. One statement. Used when a user is deleted.
	ReassignByUser(ctx context.Context, fromUserID, toUserID int) error
}
