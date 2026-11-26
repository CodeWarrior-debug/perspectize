package domain

import (
	"errors"
	"fmt"
)

var (
	ErrNotFound = errors.New("resource not found")
	// ErrContentNotFound is a content row that is missing or not visible to the
	// actor (a private row someone else owns). It wraps ErrNotFound so generic
	// not-found handling still applies, and lets a resolver name the content
	// rather than the perspective or user it was checking.
	ErrContentNotFound = fmt.Errorf("content not found: %w", ErrNotFound)
	ErrAlreadyExists   = errors.New("resource already exists")
	ErrInvalidInput    = errors.New("invalid input")
	ErrInvalidURL      = errors.New("invalid URL")
	ErrYouTubeAPI      = errors.New("youtube API error")
	ErrInvalidRating   = errors.New("rating must be between 0 and 10000")
	ErrInvalidPercent  = errors.New("percent complete must be between 0 and 100")
	ErrSentinelUser    = errors.New("cannot modify the system sentinel user")
	ErrDeleteSentinel  = errors.New("cannot delete the system sentinel user")
	// The identity conflicts below each wrap ErrAlreadyExists. Repositories name
	// the unique constraint that was violated; the identity resolver branches on
	// these, never on error text.
	ErrUsernameTaken = fmt.Errorf("username already taken: %w", ErrAlreadyExists)
	ErrEmailTaken    = fmt.Errorf("email already registered: %w", ErrAlreadyExists)
	ErrClerkIDTaken  = fmt.Errorf("clerk identity already linked: %w", ErrAlreadyExists)
	// ErrUserInactive is returned for a deactivated user (users.active = false):
	// such a user is treated as signed out.
	ErrUserInactive = errors.New("user is deactivated")
	ErrForbidden    = errors.New("access denied")
	ErrRateLimited  = errors.New("rate limit exceeded")
	// ErrUnknownWebPageRole is returned for a webpage role outside the known set. It
	// also wraps ErrInvalidInput, so callers that match the sentinel still see it.
	ErrUnknownWebPageRole = errors.New("unknown webpage role")
	// The webpage input sentinels below each wrap ErrInvalidInput too, so callers that
	// match that sentinel still see them; each names one known user mistake.
	ErrWebPageIsWebsite = errors.New("link is a website, not a page")
	ErrParentNotFound   = errors.New("parent website does not exist")
	ErrParentNotWebsite = errors.New("parent is not a website")
	ErrParentOtherHost  = errors.New("parent website is on a different host")
	// ErrClaimHasOthers is returned when a claim can't be deleted because another
	// user has a perspective or a plan item on it. The owner can keep it anonymised.
	ErrClaimHasOthers = errors.New("claim has perspectives or plans by other users")
	// ErrContentNotAllowed is returned when content is refused by policy (e.g. NC-17 movies).
	// The message is user-facing and surfaced verbatim by the resolver.
	ErrContentNotAllowed = errors.New("While Perspectize does not intend to act as censor, adding NSFW content is not enabled until traffic necessitates a long-term decision about content access policies.")
)
