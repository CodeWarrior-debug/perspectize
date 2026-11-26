package services

import (
	"context"
	"errors"
	"fmt"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// PerspectiveService implements business logic for perspective operations.
// What a valid perspective is lives in domain.ValidatePerspective; this
// service adds the actor's rights (ownership, moderation fields, readable
// content and linked perspectives).
type PerspectiveService struct {
	repo        repositories.PerspectiveRepository
	userRepo    repositories.UserRepository
	contentRepo repositories.ContentRepository
	linked      repositories.LinkedPerspectiveReader
}

// PerspectiveServiceOption configures optional PerspectiveService dependencies.
type PerspectiveServiceOption func(*PerspectiveService)

// WithContentRepository lets Create and Update check that the content a
// perspective names is visible to the acting user. Without it that check is
// skipped; tests that don't care about content privacy omit it, and production
// always wires it.
func WithContentRepository(repo repositories.ContentRepository) PerspectiveServiceOption {
	return func(s *PerspectiveService) { s.contentRepo = repo }
}

// WithLinkedPerspectiveReader lets Create and Update check that the
// perspectives a write links to are readable by the acting user. Without it
// that check is skipped; production always wires it.
func WithLinkedPerspectiveReader(reader repositories.LinkedPerspectiveReader) PerspectiveServiceOption {
	return func(s *PerspectiveService) { s.linked = reader }
}

// NewPerspectiveService creates a new perspective service
func NewPerspectiveService(repo repositories.PerspectiveRepository, userRepo repositories.UserRepository, opts ...PerspectiveServiceOption) *PerspectiveService {
	s := &PerspectiveService{
		repo:     repo,
		userRepo: userRepo,
	}
	for _, opt := range opts {
		opt(s)
	}
	return s
}

// requireVisibleContent answers domain.ErrContentNotFound unless the content
// exists and viewerID may read it. A private row someone else owns is answered
// the same as a missing one, so the id's existence isn't disclosed.
func (s *PerspectiveService) requireVisibleContent(ctx context.Context, contentID, viewerID int) error {
	if s.contentRepo == nil {
		return nil
	}
	content, err := s.contentRepo.GetByID(ctx, contentID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return domain.ErrContentNotFound
		}
		return fmt.Errorf("failed to get content: %w", err)
	}
	if !content.VisibleTo(viewerID) {
		return domain.ErrContentNotFound
	}
	return nil
}

// requireReadableLinks answers domain.ErrLinkedPerspectiveNotFound unless every
// id in ids is readable by viewerID. It issues one batched lookup, and none when
// ids is empty. An unreadable id and a missing one get the same answer.
func (s *PerspectiveService) requireReadableLinks(ctx context.Context, ids []int, viewerID int) error {
	if s.linked == nil || len(ids) == 0 {
		return nil
	}
	visible, err := s.linked.VisibleIDs(ctx, ids, viewerID)
	if err != nil {
		return fmt.Errorf("failed to check linked perspectives: %w", err)
	}
	readable := make(map[int]bool, len(visible))
	for _, id := range visible {
		readable[id] = true
	}
	for _, id := range ids {
		if !readable[id] {
			return domain.ErrLinkedPerspectiveNotFound
		}
	}
	return nil
}

// Create creates a new perspective with validation
func (s *PerspectiveService) Create(ctx context.Context, input portservices.CreatePerspectiveInput) (*domain.Perspective, error) {
	// User existence is enforced by the perspectives -> users FK: the
	// repository maps that violation to domain.ErrNotFound, which saves a
	// separate user lookup (one database round trip) on every create.
	if input.UserID <= 0 {
		return nil, fmt.Errorf("%w: user_id must be a positive integer", domain.ErrInvalidInput)
	}

	privacy := domain.PrivacyPublic
	if input.Privacy != nil {
		privacy = *input.Privacy
	}

	var sanitizedReview *string
	if input.Review != nil {
		s := sanitizeReview(*input.Review)
		sanitizedReview = &s
	}

	perspective := &domain.Perspective{
		UserID:                input.UserID,
		ContentID:             input.ContentID,
		Quality:               input.Quality,
		Agreement:             input.Agreement,
		Importance:            input.Importance,
		Confidence:            input.Confidence,
		Like:                  input.Like,
		Privacy:               privacy,
		Description:           input.Description,
		Category:              input.Category,
		Parts:                 input.Parts,
		Labels:                input.Labels,
		CategorizedRatings:    input.CategorizedRatings,
		Feelings:              input.Feelings,
		PrimaryPerspectiveID:  input.PrimaryPerspectiveID,
		RelatedPerspectiveIDs: input.RelatedPerspectiveIDs,
		CustomFields:          input.CustomFields,
		Review:                sanitizedReview,
	}

	if err := domain.ValidatePerspective(perspective); err != nil {
		return nil, err
	}

	if input.ContentID != nil {
		if err := s.requireVisibleContent(ctx, *input.ContentID, input.UserID); err != nil {
			return nil, err
		}
	}
	if err := s.requireReadableLinks(ctx, createdLinks(input), input.UserID); err != nil {
		return nil, err
	}

	created, err := s.repo.Create(ctx, perspective)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, err
		}
		return nil, fmt.Errorf("failed to create perspective: %w", err)
	}

	return created, nil
}

// createdLinks lists every perspective id a new perspective links to.
func createdLinks(input portservices.CreatePerspectiveInput) []int {
	var ids []int
	if input.PrimaryPerspectiveID != nil {
		ids = append(ids, *input.PrimaryPerspectiveID)
	}
	return append(ids, input.RelatedPerspectiveIDs...)
}

// GetByID retrieves a perspective by ID
func (s *PerspectiveService) GetByID(ctx context.Context, id int) (*domain.Perspective, error) {
	if id <= 0 {
		return nil, fmt.Errorf("%w: perspective id must be a positive integer", domain.ErrInvalidInput)
	}

	perspective, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("failed to get perspective: %w", err)
	}
	return perspective, nil
}

// applyRating implements the tri-state update rule for one rating field: clear
// wins, then a provided value is applied, otherwise the field is left alone.
// The value is validated later, against the whole perspective.
func applyRating(clear bool, v *int, dst **int) {
	switch {
	case clear:
		*dst = nil
	case v != nil:
		*dst = v
	}
}

// newlyLinked lists the perspective ids an update attaches that the row did
// not already link to. Links already attached are not re-checked, so a link
// that later stops being readable does not block unrelated edits.
func newlyLinked(existing *domain.Perspective, input portservices.UpdatePerspectiveInput) []int {
	var ids []int
	if input.PrimaryPerspectiveID != nil &&
		(existing.PrimaryPerspectiveID == nil || *existing.PrimaryPerspectiveID != *input.PrimaryPerspectiveID) {
		ids = append(ids, *input.PrimaryPerspectiveID)
	}
	if input.RelatedPerspectiveIDs != nil {
		have := make(map[int]bool, len(existing.RelatedPerspectiveIDs))
		for _, id := range existing.RelatedPerspectiveIDs {
			have[id] = true
		}
		for _, id := range input.RelatedPerspectiveIDs {
			if !have[id] {
				ids = append(ids, id)
			}
		}
	}
	return ids
}

// Update applies input on behalf of actorUserID, who must own the
// perspective. Ownership is checked here against the row we already have to
// read for the tri-state merge, and again by the owner-scoped UPDATE in the
// repository -- so neither guard depends on the other, and the save costs two
// database round trips (read + UPDATE ... RETURNING) instead of a separate
// ownership lookup on top.
func (s *PerspectiveService) Update(ctx context.Context, input portservices.UpdatePerspectiveInput, actorUserID int) (*domain.Perspective, error) {
	if input.ID <= 0 {
		return nil, fmt.Errorf("%w: perspective id must be a positive integer", domain.ErrInvalidInput)
	}
	if actorUserID <= 0 {
		return nil, fmt.Errorf("%w: authentication required to update a perspective", domain.ErrForbidden)
	}

	// Get existing perspective
	existing, err := s.repo.GetByID(ctx, input.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to get perspective: %w", err)
	}
	if existing.UserID != actorUserID {
		// Only a PUBLIC perspective is known to be visible to this user.
		// Anything else answers as if it didn't exist rather than confirming
		// the id -- matching perspectiveByID's null for non-owners.
		if existing.Privacy == domain.PrivacyPublic {
			return nil, fmt.Errorf("%w: you can only modify your own perspectives", domain.ErrForbidden)
		}
		return nil, fmt.Errorf("failed to get perspective: %w", domain.ErrNotFound)
	}

	// Attaching different content is checked against the acting user. An
	// unchanged content id is not a new attachment, so it isn't re-checked.
	if input.ContentID != nil && (existing.ContentID == nil || *existing.ContentID != *input.ContentID) {
		if err := s.requireVisibleContent(ctx, *input.ContentID, actorUserID); err != nil {
			return nil, err
		}
	}

	// Computed before the merge, which would make every link look already attached.
	linked := newlyLinked(existing, input)

	// Merge the patch into the row. Explicit clear wins over a provided value
	// (the mapper never sets both for the same field); omitted leaves the
	// existing value untouched.
	applyRating(input.ClearQuality, input.Quality, &existing.Quality)
	applyRating(input.ClearAgreement, input.Agreement, &existing.Agreement)
	applyRating(input.ClearImportance, input.Importance, &existing.Importance)
	applyRating(input.ClearConfidence, input.Confidence, &existing.Confidence)

	if input.CategorizedRatings != nil {
		existing.CategorizedRatings = input.CategorizedRatings
	}

	// Explicit clear (an empty list from the client) wins over a provided value.
	if input.ClearFeelings {
		existing.Feelings = nil
	} else if input.Feelings != nil {
		existing.Feelings = input.Feelings
	}

	if input.ContentID != nil {
		existing.ContentID = input.ContentID
	}
	if input.ClearLike {
		existing.Like = nil
	} else if input.Like != nil {
		existing.Like = input.Like
	}
	if input.Privacy != nil {
		existing.Privacy = *input.Privacy
	}
	if input.Description != nil {
		existing.Description = input.Description
	}
	if input.Category != nil {
		existing.Category = input.Category
	}
	if input.Parts != nil {
		existing.Parts = input.Parts
	}
	if input.Labels != nil {
		existing.Labels = input.Labels
	}
	if input.PrimaryPerspectiveID != nil {
		existing.PrimaryPerspectiveID = input.PrimaryPerspectiveID
	}
	if input.RelatedPerspectiveIDs != nil {
		existing.RelatedPerspectiveIDs = input.RelatedPerspectiveIDs
	}
	if input.ClearCustomFields {
		existing.CustomFields = nil
	} else if input.CustomFields != nil {
		existing.CustomFields = input.CustomFields
	}
	if input.ClearReview {
		existing.Review = nil
	} else if input.Review != nil {
		s := sanitizeReview(*input.Review)
		existing.Review = &s
	}

	// The same rules Create applies, to the state this update would store. The
	// related-ID and feelings caps are checked only when the patch sets that list,
	// so a stored row already over a cap can still be edited in other fields.
	scope := domain.ListScope{Related: input.RelatedPerspectiveIDs != nil, Feelings: input.Feelings != nil}
	if err := domain.ValidatePerspectiveScoped(existing, scope); err != nil {
		return nil, err
	}
	if err := s.requireReadableLinks(ctx, linked, actorUserID); err != nil {
		return nil, err
	}

	updated, err := s.repo.Update(ctx, existing, actorUserID)
	if err != nil {
		return nil, fmt.Errorf("failed to update perspective: %w", err)
	}

	return updated, nil
}

// Delete removes a perspective on behalf of actorUserID. Only the owner may
// delete — public or private alike. Two independent guards: the actor check
// here and the owner-scoped DELETE in the repository (WHERE id = ? AND
// user_id = ?), which is also what makes the happy path a single round trip.
// Only when that DELETE matches nothing do we read the row, to tell "not
// yours" from "doesn't exist".
func (s *PerspectiveService) Delete(ctx context.Context, id int, actorUserID int) error {
	if id <= 0 {
		return fmt.Errorf("%w: perspective id must be a positive integer", domain.ErrInvalidInput)
	}
	if actorUserID <= 0 {
		return fmt.Errorf("%w: authentication required to delete a perspective", domain.ErrForbidden)
	}

	err := s.repo.Delete(ctx, id, actorUserID)
	if err == nil {
		return nil
	}
	if !errors.Is(err, domain.ErrNotFound) {
		return fmt.Errorf("failed to delete perspective: %w", err)
	}

	existing, getErr := s.repo.GetByID(ctx, id)
	if getErr != nil {
		return fmt.Errorf("failed to get perspective: %w", getErr)
	}
	// Someone else's perspective. Only a PUBLIC one is known to be visible to
	// this user; anything else answers as if it didn't exist rather than
	// confirming the id -- matching perspectiveByID's null for non-owners.
	if existing.UserID != actorUserID && existing.Privacy == domain.PrivacyPublic {
		return fmt.Errorf("%w: you can only delete your own perspectives", domain.ErrForbidden)
	}
	return fmt.Errorf("failed to delete perspective: %w", domain.ErrNotFound)
}

// ListPerspectives retrieves a paginated list of perspectives
func (s *PerspectiveService) ListPerspectives(ctx context.Context, params domain.PerspectiveListParams) (*domain.PaginatedPerspectives, error) {
	if _, err := domain.ResolvePage(params.First, params.Last, params.After, params.Before); err != nil {
		return nil, err
	}

	// Read authorization: unless the caller is unambiguously asking only for
	// their own rows, results must be limited to public rows plus the caller's
	// own. The repository turns RestrictToPublicOrOwner into a WHERE predicate.
	isOwnListOnly := params.Filter != nil &&
		params.Filter.UserID != nil &&
		params.ViewerID != nil &&
		*params.Filter.UserID == *params.ViewerID
	params.RestrictToPublicOrOwner = !isOwnListOnly

	result, err := s.repo.List(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("failed to list perspectives: %w", err)
	}

	return result, nil
}

// AggregateByContentIDs computes the perspective count and average Quality
// rating for each given content ID, across ALL perspectives (public and
// private) — see the repository's AggregateByContentIDs doc comment. A thin
// passthrough; no auth restriction needed since this never exposes any
// individual perspective's content, only an aggregate count/average.
func (s *PerspectiveService) AggregateByContentIDs(ctx context.Context, contentIDs []int) (map[int]*domain.PerspectiveAggregate, error) {
	aggregates, err := s.repo.AggregateByContentIDs(ctx, contentIDs)
	if err != nil {
		return nil, fmt.Errorf("failed to aggregate perspectives by content: %w", err)
	}
	return aggregates, nil
}

// CountVisibleByContentIDs counts the perspectives the viewer may read per
// content ID (public plus their own) — the count the Compare page can
// actually show, unlike AggregateByContentIDs which counts every row.
func (s *PerspectiveService) CountVisibleByContentIDs(ctx context.Context, contentIDs []int, viewerID *int) (map[int]int, error) {
	counts, err := s.repo.CountVisibleByContentIDs(ctx, contentIDs, viewerID)
	if err != nil {
		return nil, fmt.Errorf("failed to count visible perspectives by content: %w", err)
	}
	return counts, nil
}

// FeelingStats computes feeling count/average/stddev intensity — see
// domain.FeelingStats and the repository's FeelingStats doc comment. A thin
// passthrough with input validation; no auth restriction needed since this
// never exposes any individual perspective's content, only an aggregate.
func (s *PerspectiveService) FeelingStats(ctx context.Context, contentID *int, emoji string, label *string) (*domain.FeelingStats, error) {
	if emoji == "" {
		return nil, fmt.Errorf("%w: emoji is required", domain.ErrInvalidInput)
	}
	stats, err := s.repo.FeelingStats(ctx, contentID, emoji, label)
	if err != nil {
		return nil, fmt.Errorf("failed to compute feeling stats: %w", err)
	}
	return stats, nil
}

// CustomFieldStats computes how many perspectives set the given
// CustomFields key — see domain.CustomFieldStats and the repository's
// CustomFieldStats doc comment.
func (s *PerspectiveService) CustomFieldStats(ctx context.Context, contentID *int, key string) (*domain.CustomFieldStats, error) {
	if key == "" {
		return nil, fmt.Errorf("%w: key is required", domain.ErrInvalidInput)
	}
	stats, err := s.repo.CustomFieldStats(ctx, contentID, key)
	if err != nil {
		return nil, fmt.Errorf("failed to compute custom field stats: %w", err)
	}
	return stats, nil
}
