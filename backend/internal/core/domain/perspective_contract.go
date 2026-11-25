package domain

import (
	"encoding/json"
	"fmt"
)

// MaxRelatedPerspectiveIDs caps how many perspectives one perspective may link
// to through RelatedPerspectiveIDs.
const MaxRelatedPerspectiveIDs = 50

var (
	// ErrReviewStatusLocked is returned when an owner's write sets ReviewStatus.
	// Review status is moderation state; no owner path may set it.
	ErrReviewStatusLocked = fmt.Errorf("%w: review status is set by moderators", ErrForbidden)

	// ErrLinkedPerspectiveNotFound is returned when a perspective links to
	// another perspective the actor cannot read. A missing row and an
	// unreadable one give the same answer, so the id's existence isn't disclosed.
	ErrLinkedPerspectiveNotFound = fmt.Errorf("%w: linked perspective not found", ErrNotFound)

	// ErrDuplicatePerspective is returned when the user already has a
	// perspective with the same privacy on the same content. It also matches
	// ErrAlreadyExists.
	ErrDuplicatePerspective = fmt.Errorf("%w: perspective already exists for this content and privacy", ErrAlreadyExists)
)

// ValidatePerspective is the one definition of a valid perspective. Create
// validates the perspective it is about to store; Update validates the state
// the perspective would have after the patch. Both call it, so the same
// state is valid or invalid either way.
//
// The check does not cover the acting user, the ownership rules or the
// attached content: those belong to the service, which knows the actor.
func ValidatePerspective(p *Perspective) error {
	return ValidatePerspectiveScoped(p, AllLists)
}

// ListScope says which capped lists ValidatePerspectiveScoped checks. An
// update checks only the lists its patch sets, so a stored row that already
// exceeds a cap can still be edited in other fields.
type ListScope struct {
	Related  bool
	Feelings bool
}

// AllLists checks every capped list. Create uses it, since a new row holds
// only what the request sent.
var AllLists = ListScope{Related: true, Feelings: true}

// ValidatePerspectiveScoped is ValidatePerspective with the capped lists limited
// to scope. Everything else is checked in full.
func ValidatePerspectiveScoped(p *Perspective, scope ListScope) error {
	ratings := []struct {
		name  string
		value *int
	}{
		{"quality", p.Quality},
		{"agreement", p.Agreement},
		{"importance", p.Importance},
		{"confidence", p.Confidence},
	}
	for _, r := range ratings {
		if !ValidateRating(r.value) {
			return fmt.Errorf("%w: %s %d", ErrInvalidRating, r.name, *r.value)
		}
	}
	for _, cr := range p.CategorizedRatings {
		if cr.Rating < RatingMin || cr.Rating > RatingMax {
			return fmt.Errorf("%w: categorized rating for '%s' is %d", ErrInvalidRating, cr.Category, cr.Rating)
		}
	}

	if !hasPerspectiveContent(p) {
		return fmt.Errorf("%w: at least one field must be provided", ErrInvalidInput)
	}

	if scope.Related && len(p.RelatedPerspectiveIDs) > MaxRelatedPerspectiveIDs {
		return fmt.Errorf("%w: related_perspective_ids cannot exceed %d entries", ErrInvalidInput, MaxRelatedPerspectiveIDs)
	}

	if scope.Feelings {
		if len(p.Feelings) > MaxFeelings {
			return fmt.Errorf("%w: feelings cannot exceed %d entries", ErrInvalidInput, MaxFeelings)
		}
		for _, f := range p.Feelings {
			if !ValidateFeelingEntry(f) {
				return fmt.Errorf("%w: feeling %q has an invalid emoji or intensity %d", ErrInvalidInput, f.Emoji, f.Intensity)
			}
		}
	}
	return nil
}

// hasPerspectiveContent reports whether a perspective says something beyond
// its metadata. Privacy, category, parts and the perspective links are not
// content on their own; every rating, text, feeling, label, categorized
// rating and custom field is.
func hasPerspectiveContent(p *Perspective) bool {
	return p.Quality != nil ||
		p.Agreement != nil ||
		p.Importance != nil ||
		p.Confidence != nil ||
		p.Like != nil ||
		p.Review != nil ||
		p.Description != nil ||
		len(p.Feelings) > 0 ||
		len(p.Labels) > 0 ||
		len(p.CategorizedRatings) > 0 ||
		customFieldsHaveEntries(p.CustomFields)
}

// customFieldsHaveEntries reports whether raw is a JSON object with at least one
// key. An empty object is not content. Bytes that don't parse as an object
// count as content, so storage still sees them.
func customFieldsHaveEntries(raw json.RawMessage) bool {
	if len(raw) == 0 {
		return false
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		return true
	}
	return len(fields) > 0
}
