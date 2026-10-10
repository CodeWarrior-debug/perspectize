package domain

import "errors"

var (
	ErrNotFound       = errors.New("resource not found")
	ErrAlreadyExists  = errors.New("resource already exists")
	ErrInvalidInput   = errors.New("invalid input")
	ErrInvalidURL     = errors.New("invalid URL")
	ErrYouTubeAPI     = errors.New("youtube API error")
	ErrInvalidRating  = errors.New("rating must be between 0 and 10000")
	ErrInvalidPercent = errors.New("percent complete must be between 0 and 100")
	ErrSentinelUser   = errors.New("cannot modify the system sentinel user")
	ErrDeleteSentinel = errors.New("cannot delete the system sentinel user")
	ErrForbidden      = errors.New("access denied")
	ErrRateLimited    = errors.New("rate limit exceeded")
	// ErrContentNotAllowed is returned when content is refused by policy (e.g. NC-17 movies).
	// The message is user-facing and surfaced verbatim by the resolver.
	ErrContentNotAllowed = errors.New("While Perspectize does not intend to act as censor, adding NSFW content is not enabled until traffic necessitates a long-term decision about content access policies.")
)
