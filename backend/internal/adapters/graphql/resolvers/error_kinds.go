package resolvers

import (
	"errors"

	"github.com/vektah/gqlparser/v2/gqlerror"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// kindedError returns a GraphQL error with the client message msg. A typed kind
// adds its code as extensions.code; KindNone is a plain error with no code.
// Every typed error in the resolvers goes through here, so the code is spelled
// once.
func kindedError(msg string, kind domain.ErrorKind) error {
	if kind == domain.KindNone {
		return errors.New(msg)
	}
	return &gqlerror.Error{Message: msg, Extensions: map[string]any{"code": string(kind)}}
}
