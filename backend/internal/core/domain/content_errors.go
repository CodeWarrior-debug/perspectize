package domain

import "errors"

// ErrUnavailable marks a create or refresh that failed because an upstream
// source (or a required client) is not available. Errors carrying it are shown
// to clients with the UNAVAILABLE code.
var ErrUnavailable = errors.New("service unavailable")

// Unavailable returns an error whose message is msg and which matches
// ErrUnavailable. The message is kept as-is so client-facing text does not change.
func Unavailable(msg string) error {
	return unavailableError{msg: msg}
}

type unavailableError struct{ msg string }

func (e unavailableError) Error() string { return e.msg }

func (e unavailableError) Is(target error) bool { return target == ErrUnavailable }

// ErrorKind is the client-facing category of a content create or refresh error.
// Its value is the GraphQL error extension code for that category.
type ErrorKind string

const (
	// KindNone is any error outside the typed categories; it has no code.
	KindNone ErrorKind = ""
	// KindInvalid means the input was refused as malformed or unsupported.
	KindInvalid ErrorKind = "INVALID_INPUT"
	// KindNotFound means the named upstream item does not exist.
	KindNotFound ErrorKind = "NOT_FOUND"
	// KindNotAllowed means policy refuses the content.
	KindNotAllowed ErrorKind = "CONTENT_NOT_ALLOWED"
	// KindUnavailable means an upstream source or client could not serve the request.
	KindUnavailable ErrorKind = "UNAVAILABLE"
)

// KindOf classifies err by the sentinels it wraps. The first match wins; an
// error with no typed sentinel is KindNone.
func KindOf(err error) ErrorKind {
	switch {
	case err == nil:
		return KindNone
	case errors.Is(err, ErrInvalidInput), errors.Is(err, ErrInvalidURL), errors.Is(err, ErrInvalidPassage):
		return KindInvalid
	case errors.Is(err, ErrNotFound):
		return KindNotFound
	case errors.Is(err, ErrContentNotAllowed):
		return KindNotAllowed
	case errors.Is(err, ErrUnavailable):
		return KindUnavailable
	}
	return KindNone
}
