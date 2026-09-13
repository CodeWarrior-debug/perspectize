package domain

import "errors"

var (
	ErrNotFound       = errors.New("resource not found")
	ErrAlreadyExists  = errors.New("resource already exists")
	ErrInvalidInput   = errors.New("invalid input")
	ErrInvalidURL     = errors.New("invalid URL")
	ErrYouTubeAPI     = errors.New("youtube API error")
	ErrInvalidRating  = errors.New("rating must be between 0 and 10000")
	ErrSentinelUser   = errors.New("cannot modify the system sentinel user")
	ErrDeleteSentinel = errors.New("cannot delete the system sentinel user")
	ErrForbidden      = errors.New("access denied")
	ErrRateLimited    = errors.New("rate limit exceeded")
)
