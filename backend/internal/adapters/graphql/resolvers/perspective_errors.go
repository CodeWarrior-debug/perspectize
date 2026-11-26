package resolvers

// Client-facing errors for perspective create and update. The messages are the
// ones clients already match on, so they must not change. Each error also
// carries its kind as extensions.code (see kindedError).

import (
	"errors"
	"fmt"
	"log/slog"
	"strings"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// perspectiveWriteKind classifies a perspective write error. It is
// domain.KindOf plus the two kinds only perspective writes produce: an invalid
// rating (a rating outside 0-10000) and a forbidden write.
func perspectiveWriteKind(err error) domain.ErrorKind {
	switch {
	case errors.Is(err, domain.ErrInvalidRating):
		return domain.KindInvalid
	case errors.Is(err, domain.ErrForbidden):
		return domain.KindForbidden
	}
	return domain.KindOf(err)
}

// createPerspectiveError maps a Create failure to its client error. privacy is
// the privacy the caller asked for, or nil when it was omitted (public).
func createPerspectiveError(err error, privacy *domain.Privacy) error {
	kind := perspectiveWriteKind(err)
	switch {
	case errors.Is(err, domain.ErrInvalidRating):
		return kindedError(fmt.Sprintf("invalid rating: %v", err), kind)
	case errors.Is(err, domain.ErrInvalidInput):
		return kindedError(fmt.Sprintf("invalid input: %v", err), kind)
	case errors.Is(err, domain.ErrDuplicatePerspective):
		effective := domain.PrivacyPublic // the service's default when privacy is omitted
		if privacy != nil {
			effective = *privacy
		}
		return kindedError(fmt.Sprintf("you already have a %s perspective on this content", lowerPrivacy(effective)), kind)
	// Checked before ErrNotFound: content and linked-perspective not-found are
	// also ErrNotFound, and must not be reported as a missing user.
	case errors.Is(err, domain.ErrContentNotFound):
		return kindedError("content not found", kind)
	case errors.Is(err, domain.ErrLinkedPerspectiveNotFound):
		return kindedError("linked perspective not found", kind)
	case errors.Is(err, domain.ErrNotFound):
		return kindedError(fmt.Sprintf("user not found: %v", err), kind)
	}
	slog.Error("creating perspective failed", "error", err)
	return fmt.Errorf("failed to create perspective: %v", err)
}

// updatePerspectiveError maps an Update failure to its client error. privacy is
// the privacy the patch sets, or nil when the patch leaves it alone.
func updatePerspectiveError(err error, privacy *domain.Privacy) error {
	kind := perspectiveWriteKind(err)
	switch {
	case errors.Is(err, domain.ErrForbidden):
		return kindedError("access denied: you can only modify your own perspectives", kind)
	case errors.Is(err, domain.ErrContentNotFound):
		return kindedError("content not found", kind)
	case errors.Is(err, domain.ErrLinkedPerspectiveNotFound):
		return kindedError("linked perspective not found", kind)
	case errors.Is(err, domain.ErrNotFound):
		return kindedError("perspective not found", kind)
	case errors.Is(err, domain.ErrInvalidRating):
		return kindedError(fmt.Sprintf("invalid rating: %v", err), kind)
	case errors.Is(err, domain.ErrInvalidInput):
		return kindedError(fmt.Sprintf("invalid input: %v", err), kind)
	case errors.Is(err, domain.ErrDuplicatePerspective):
		if privacy != nil {
			return kindedError(fmt.Sprintf("you already have a %s perspective on this content", lowerPrivacy(*privacy)), kind)
		}
		return kindedError("you already have a perspective on this content with that privacy setting", kind)
	}
	slog.Error("updating perspective failed", "error", err)
	return fmt.Errorf("failed to update perspective: %v", err)
}

func lowerPrivacy(p domain.Privacy) string {
	return strings.ToLower(string(p))
}
