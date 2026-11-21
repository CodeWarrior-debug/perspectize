package services

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// savedItemStemMaxLen caps the part of a name that copy and link suffixes are
// added to, so a suffixed name still fits in varchar(100).
const savedItemStemMaxLen = 80

// SavedItemService implements the saved item store: formulas now, and later
// themes, views and settings. Copy and link take a public source; the source is
// never a link, so there are no chains.
type SavedItemService struct {
	items repositories.SavedItemRepository
}

// Compile-time interface check
var _ portservices.SavedItemService = (*SavedItemService)(nil)

// NewSavedItemService creates a new saved item service
func NewSavedItemService(items repositories.SavedItemRepository) *SavedItemService {
	return &SavedItemService{items: items}
}

// ListMine returns one page of the actor's own live items of the given type.
func (s *SavedItemService) ListMine(ctx context.Context, actorUserID int, params domain.SavedItemListParams) (*domain.PaginatedSavedItems, error) {
	if actorUserID <= 0 {
		return nil, fmt.Errorf("%w: authentication required to list saved items", domain.ErrForbidden)
	}
	viewer := actorUserID
	params.Scope = domain.SavedItemScopeMine
	params.ViewerID = &viewer
	return s.listSavedItems(ctx, params)
}

// ListShared returns one page of public live items of the given type plus the
// viewer's own. viewerID may be nil, which gives public items only.
func (s *SavedItemService) ListShared(ctx context.Context, viewerID *int, params domain.SavedItemListParams) (*domain.PaginatedSavedItems, error) {
	params.Scope = domain.SavedItemScopeShared
	params.ViewerID = viewerID
	return s.listSavedItems(ctx, params)
}

// GetSavedItem returns the item, or (nil, nil) when it doesn't exist or is
// private to someone other than the viewer. A hidden row answers like a missing
// one, so the id isn't confirmed.
func (s *SavedItemService) GetSavedItem(ctx context.Context, id int, viewerID *int) (*domain.SavedItem, error) {
	if id <= 0 {
		return nil, fmt.Errorf("%w: saved item id must be a positive integer", domain.ErrInvalidInput)
	}
	item, err := s.items.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get saved item: %w", err)
	}
	if !canViewSavedItem(item.Privacy, item.UserID, viewerID) {
		return nil, nil
	}
	// A link keeps the name it took from its source. Once the source is gone or
	// private, anyone but the link's owner gets nothing, so the name can't be read.
	isOwner := viewerID != nil && *viewerID == item.UserID
	if !isOwner && item.Origin == domain.SavedItemOriginLink && !item.SourceAvailable {
		return nil, nil
	}
	return item, nil
}

// CreateSavedItem creates an OWN item owned by actorUserID. Privacy defaults to
// PRIVATE, so a new item is never public until its owner makes it so.
func (s *SavedItemService) CreateSavedItem(ctx context.Context, actorUserID int, input domain.CreateSavedItemInput) (*domain.SavedItem, error) {
	if actorUserID <= 0 {
		return nil, fmt.Errorf("%w: authentication required to create a saved item", domain.ErrForbidden)
	}
	if !input.Type.Valid() {
		return nil, fmt.Errorf("%w: unknown saved item type %q", domain.ErrInvalidInput, input.Type)
	}
	name, err := domain.NormalizeSavedItemName(input.Name)
	if err != nil {
		return nil, err
	}
	if err := domain.ValidateSavedItemPayload(input.Type, input.Payload); err != nil {
		return nil, err
	}
	privacy := domain.PrivacyPrivate
	if input.Privacy != nil {
		if !validSavedItemPrivacy(*input.Privacy) {
			return nil, fmt.Errorf("%w: unknown privacy %q", domain.ErrInvalidInput, *input.Privacy)
		}
		privacy = *input.Privacy
	}

	created, err := s.items.Create(ctx, &domain.SavedItem{
		UserID:         actorUserID,
		Type:           input.Type,
		Name:           name,
		Payload:        input.Payload,
		PayloadVersion: domain.SavedFormulaPayloadVersion,
		Privacy:        privacy,
		Origin:         domain.SavedItemOriginOwn,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create saved item: %w", err)
	}
	return created, nil
}

// UpdateSavedItem merges input onto an item the actor owns. input.Type names the
// type the caller is updating; a row of another type is refused, so a formula
// update cannot change a theme, view or setting. A LINK has no payload of its
// own, so a payload change on one is refused.
func (s *SavedItemService) UpdateSavedItem(ctx context.Context, actorUserID int, input domain.UpdateSavedItemInput) (*domain.SavedItem, error) {
	if actorUserID <= 0 {
		return nil, fmt.Errorf("%w: authentication required to update a saved item", domain.ErrForbidden)
	}
	if input.ID <= 0 {
		return nil, fmt.Errorf("%w: saved item id must be a positive integer", domain.ErrInvalidInput)
	}
	if !input.Type.Valid() {
		return nil, fmt.Errorf("%w: unknown saved item type %q", domain.ErrInvalidInput, input.Type)
	}

	existing, err := s.getLiveSavedItem(ctx, input.ID)
	if err != nil {
		return nil, err
	}
	if existing.UserID != actorUserID {
		return nil, notWritableSavedItem(existing)
	}
	if existing.Type != input.Type {
		return nil, fmt.Errorf("%w: saved item is a %s, not a %s", domain.ErrInvalidInput,
			strings.ToLower(string(existing.Type)), strings.ToLower(string(input.Type)))
	}

	merged := *existing
	if input.Name != nil {
		name, err := domain.NormalizeSavedItemName(*input.Name)
		if err != nil {
			return nil, err
		}
		merged.Name = name
	}
	if input.Payload != nil {
		if existing.Origin == domain.SavedItemOriginLink {
			return nil, fmt.Errorf("%w: a link has no payload of its own", domain.ErrInvalidInput)
		}
		if err := domain.ValidateSavedItemPayload(existing.Type, input.Payload); err != nil {
			return nil, err
		}
		merged.Payload = input.Payload
	}

	updated, err := s.items.Update(ctx, &merged, actorUserID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, s.writeMissError(ctx, input.ID, actorUserID)
		}
		return nil, fmt.Errorf("failed to update saved item: %w", err)
	}
	return withResolvedSource(updated, existing), nil
}

// DeleteSavedItem soft-deletes an item the actor owns. A copy's credit and a
// link's source are unaffected; a link to a deleted source shows as unavailable.
func (s *SavedItemService) DeleteSavedItem(ctx context.Context, actorUserID, id int) error {
	if actorUserID <= 0 {
		return fmt.Errorf("%w: authentication required to delete a saved item", domain.ErrForbidden)
	}
	if id <= 0 {
		return fmt.Errorf("%w: saved item id must be a positive integer", domain.ErrInvalidInput)
	}

	err := s.items.Delete(ctx, id, actorUserID)
	if err == nil {
		return nil
	}
	if errors.Is(err, domain.ErrNotFound) {
		return s.writeMissError(ctx, id, actorUserID)
	}
	return fmt.Errorf("failed to delete saved item: %w", err)
}

// RestoreSavedItem undoes a soft delete. Only the owner's deleted rows match, so
// any other id answers ErrNotFound. Returns the restored item.
func (s *SavedItemService) RestoreSavedItem(ctx context.Context, actorUserID, id int) (*domain.SavedItem, error) {
	if actorUserID <= 0 {
		return nil, fmt.Errorf("%w: authentication required to restore a saved item", domain.ErrForbidden)
	}
	if id <= 0 {
		return nil, fmt.Errorf("%w: saved item id must be a positive integer", domain.ErrInvalidInput)
	}

	if err := s.items.Restore(ctx, id, actorUserID); err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("%w: no deleted saved item with this id", domain.ErrNotFound)
		}
		return nil, fmt.Errorf("failed to restore saved item: %w", err)
	}
	// Read back with the link's source resolved. The restore only touched deleted_at.
	return s.getLiveSavedItem(ctx, id)
}

// SetSavedItemPrivacy changes the privacy of an item the actor owns. A LINK can
// be made public only while its source is readable, so its audience is never
// wider than the source's.
func (s *SavedItemService) SetSavedItemPrivacy(ctx context.Context, actorUserID, id int, privacy domain.Privacy) (*domain.SavedItem, error) {
	if actorUserID <= 0 {
		return nil, fmt.Errorf("%w: authentication required to change privacy", domain.ErrForbidden)
	}
	if id <= 0 {
		return nil, fmt.Errorf("%w: saved item id must be a positive integer", domain.ErrInvalidInput)
	}
	if !validSavedItemPrivacy(privacy) {
		return nil, fmt.Errorf("%w: unknown privacy %q", domain.ErrInvalidInput, privacy)
	}

	existing, err := s.getLiveSavedItem(ctx, id)
	if err != nil {
		return nil, err
	}
	if existing.UserID != actorUserID {
		return nil, notWritableSavedItem(existing)
	}
	if existing.Origin == domain.SavedItemOriginLink && privacy == domain.PrivacyPublic && !existing.SourceAvailable {
		return nil, fmt.Errorf("%w: a link can only be public while its source is public", domain.ErrInvalidInput)
	}

	updated, err := s.items.SetPrivacy(ctx, id, privacy, actorUserID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, s.writeMissError(ctx, id, actorUserID)
		}
		return nil, fmt.Errorf("failed to set saved item privacy: %w", err)
	}
	return withResolvedSource(updated, existing), nil
}

// CopySavedItem copies a public OWN or COPY item into a new private item the
// actor owns. The copy keeps credit through SourceID. Its name gets a suffix
// only when the actor already uses the source's name.
func (s *SavedItemService) CopySavedItem(ctx context.Context, actorUserID, sourceID int) (*domain.SavedItem, error) {
	if actorUserID <= 0 {
		return nil, fmt.Errorf("%w: authentication required to copy a saved item", domain.ErrForbidden)
	}
	source, err := s.readableSource(ctx, actorUserID, sourceID)
	if err != nil {
		return nil, err
	}
	return s.createFromSource(ctx, actorUserID, source, domain.SavedItemOriginCopy)
}

// LinkSavedItem links to a public OWN or COPY item. The new item stores no
// payload and reads its source's payload, so the owner's edits flow through.
func (s *SavedItemService) LinkSavedItem(ctx context.Context, actorUserID, sourceID int) (*domain.SavedItem, error) {
	if actorUserID <= 0 {
		return nil, fmt.Errorf("%w: authentication required to link a saved item", domain.ErrForbidden)
	}
	source, err := s.readableSource(ctx, actorUserID, sourceID)
	if err != nil {
		return nil, err
	}
	return s.createFromSource(ctx, actorUserID, source, domain.SavedItemOriginLink)
}

// ConvertLinkToCopy turns a LINK the actor owns into a COPY of its source, while
// the source is still readable. The credit stays on the item.
func (s *SavedItemService) ConvertLinkToCopy(ctx context.Context, actorUserID, id int) (*domain.SavedItem, error) {
	if actorUserID <= 0 {
		return nil, fmt.Errorf("%w: authentication required to convert a saved item", domain.ErrForbidden)
	}
	if id <= 0 {
		return nil, fmt.Errorf("%w: saved item id must be a positive integer", domain.ErrInvalidInput)
	}

	existing, err := s.getLiveSavedItem(ctx, id)
	if err != nil {
		return nil, err
	}
	if existing.UserID != actorUserID {
		return nil, notWritableSavedItem(existing)
	}
	if existing.Origin != domain.SavedItemOriginLink {
		return nil, fmt.Errorf("%w: only a link can be converted to a copy", domain.ErrInvalidInput)
	}
	if !existing.SourceAvailable {
		return nil, fmt.Errorf("%w: the source of this link is no longer available", domain.ErrNotFound)
	}

	updated, err := s.items.ConvertLinkToCopy(ctx, id, actorUserID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, s.writeMissError(ctx, id, actorUserID)
		}
		return nil, fmt.Errorf("failed to convert saved item link: %w", err)
	}
	return withResolvedSource(updated, existing), nil
}

// --- helpers -----------------------------------------------------------------

// listSavedItems checks the page arguments and runs one list read.
func (s *SavedItemService) listSavedItems(ctx context.Context, params domain.SavedItemListParams) (*domain.PaginatedSavedItems, error) {
	if !params.Type.Valid() {
		return nil, fmt.Errorf("%w: unknown saved item type %q", domain.ErrInvalidInput, params.Type)
	}
	if params.First != nil && (*params.First < 1 || *params.First > 100) {
		return nil, fmt.Errorf("%w: first must be between 1 and 100", domain.ErrInvalidInput)
	}
	if params.Last != nil && (*params.Last < 1 || *params.Last > 100) {
		return nil, fmt.Errorf("%w: last must be between 1 and 100", domain.ErrInvalidInput)
	}
	page, err := s.items.List(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("failed to list saved items: %w", err)
	}
	return page, nil
}

// getLiveSavedItem reads a live item with its link payload resolved. A deleted
// or missing item is domain.ErrNotFound.
func (s *SavedItemService) getLiveSavedItem(ctx context.Context, id int) (*domain.SavedItem, error) {
	item, err := s.items.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("%w: saved item not found", domain.ErrNotFound)
		}
		return nil, fmt.Errorf("failed to get saved item: %w", err)
	}
	return item, nil
}

// readableSource loads the source of a copy or link and applies the rules both
// share. A source the actor may not see (someone else's private, or any deleted
// item) is ErrNotFound. A visible source that is not public, or a LINK, is
// ErrInvalidInput.
func (s *SavedItemService) readableSource(ctx context.Context, actorUserID, sourceID int) (*domain.SavedItem, error) {
	if sourceID <= 0 {
		return nil, fmt.Errorf("%w: source id must be a positive integer", domain.ErrInvalidInput)
	}
	source, err := s.getLiveSavedItem(ctx, sourceID)
	if err != nil {
		return nil, err
	}
	if !canViewSavedItem(source.Privacy, source.UserID, &actorUserID) {
		return nil, fmt.Errorf("%w: saved item not found", domain.ErrNotFound)
	}
	if source.Privacy != domain.PrivacyPublic {
		return nil, fmt.Errorf("%w: only public items can be copied or linked", domain.ErrInvalidInput)
	}
	if source.Origin == domain.SavedItemOriginLink {
		return nil, fmt.Errorf("%w: a link cannot be copied or linked again; link to the original item", domain.ErrInvalidInput)
	}
	return source, nil
}

// createFromSource writes a COPY or LINK of source for actorUserID. The new row is
// private and takes the source's type. A LINK stores no payload.
func (s *SavedItemService) createFromSource(ctx context.Context, actorUserID int, source *domain.SavedItem, origin domain.SavedItemOrigin) (*domain.SavedItem, error) {
	name, err := s.freeName(ctx, actorUserID, source.Type, source.Name)
	if err != nil {
		return nil, err
	}

	sourceID := source.ID
	item := &domain.SavedItem{
		UserID:         actorUserID,
		Type:           source.Type,
		Name:           name,
		PayloadVersion: source.PayloadVersion,
		Privacy:        domain.PrivacyPrivate,
		Origin:         origin,
		SourceID:       &sourceID,
	}
	if origin == domain.SavedItemOriginCopy {
		item.Payload = source.Payload
	}

	created, err := s.items.Create(ctx, item)
	if err != nil {
		return nil, fmt.Errorf("failed to create saved item from source: %w", err)
	}
	created.SourceAvailable = true
	if origin == domain.SavedItemOriginLink {
		created.Payload = source.Payload
	}
	return created, nil
}

// freeName returns base when the owner has no live item of that type with that
// name. Otherwise it returns the first free " (copy)", " (copy 2)", ... variant.
// One probe reads the owner's names that start with the stem; the suffix is
// chosen in Go, so no query runs per candidate.
func (s *SavedItemService) freeName(ctx context.Context, userID int, itemType domain.SavedItemType, base string) (string, error) {
	stem := firstRunes(base, savedItemStemMaxLen)
	names, err := s.items.NamesWithPrefix(ctx, userID, itemType, stem)
	if err != nil {
		return "", fmt.Errorf("failed to read saved item names: %w", err)
	}
	taken := make(map[string]bool, len(names))
	for _, n := range names {
		taken[n] = true
	}
	if !taken[base] {
		return base, nil
	}
	// Every candidate starts with the stem, so the probe covers them all. The set
	// is finite, so the loop ends.
	for n := 1; ; n++ {
		candidate := stem + " (copy)"
		if n > 1 {
			candidate = fmt.Sprintf("%s (copy %d)", stem, n)
		}
		if !taken[candidate] {
			return candidate, nil
		}
	}
}

// writeMissError explains a zero-row write. The owner-scoped write matched no
// live row, so it reads the item once to choose between ErrForbidden and
// ErrNotFound.
func (s *SavedItemService) writeMissError(ctx context.Context, id, actorUserID int) error {
	existing, err := s.items.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return fmt.Errorf("%w: saved item not found", domain.ErrNotFound)
		}
		return fmt.Errorf("failed to get saved item: %w", err)
	}
	if existing.UserID == actorUserID {
		return fmt.Errorf("%w: saved item not found", domain.ErrNotFound)
	}
	return notWritableSavedItem(existing)
}

// notWritableSavedItem answers a write on an item the actor doesn't own. A live
// PUBLIC item is visible to the actor, so the refusal is ErrForbidden. Anything
// else answers ErrNotFound, so the id isn't confirmed.
func notWritableSavedItem(item *domain.SavedItem) error {
	if item.Privacy == domain.PrivacyPublic {
		return fmt.Errorf("%w: you can only modify your own items", domain.ErrForbidden)
	}
	return fmt.Errorf("%w: saved item not found", domain.ErrNotFound)
}

// canViewSavedItem reports whether an item is visible: PUBLIC items to everyone,
// PRIVATE items only to their owner.
func canViewSavedItem(privacy domain.Privacy, ownerID int, viewerID *int) bool {
	return privacy == domain.PrivacyPublic || (viewerID != nil && *viewerID == ownerID)
}

// validSavedItemPrivacy reports whether p is one of the two privacy values.
func validSavedItemPrivacy(p domain.Privacy) bool {
	return p == domain.PrivacyPublic || p == domain.PrivacyPrivate
}

// withResolvedSource copies the read-side fields from the item read before a
// write onto the row the write returned. The write does not change the source,
// so those fields still hold. A LINK's payload is the source's payload, which
// the write never stores.
func withResolvedSource(updated, existing *domain.SavedItem) *domain.SavedItem {
	updated.SourceAvailable = existing.SourceAvailable
	if updated.Origin == domain.SavedItemOriginLink {
		updated.Payload = existing.Payload
	}
	return updated
}

// firstRunes returns the first n runes of s.
func firstRunes(s string, n int) string {
	count := 0
	for i := range s {
		if count == n {
			return s[:i]
		}
		count++
	}
	return s
}
