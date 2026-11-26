package resolvers

import (
	"errors"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/vektah/gqlparser/v2/gqlerror"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// clientError returns the message and extensions.code a client would see, where
// code is "" for a plain error with no kind.
func clientError(err error) (msg string, code string) {
	var ge *gqlerror.Error
	if errors.As(err, &ge) {
		c, _ := ge.Extensions["code"].(string)
		return ge.Message, c
	}
	return err.Error(), ""
}

func TestCreatePerspectiveErrorsCarryKinds(t *testing.T) {
	private := domain.PrivacyPrivate
	cases := []struct {
		name     string
		err      error
		privacy  *domain.Privacy
		wantMsg  string
		wantCode string
	}{
		{
			name:     "duplicate names the requested privacy",
			err:      domain.ErrDuplicatePerspective,
			privacy:  &private,
			wantMsg:  "you already have a private perspective on this content",
			wantCode: "ALREADY_EXISTS",
		},
		{
			name:     "duplicate with privacy omitted is public",
			err:      domain.ErrDuplicatePerspective,
			wantMsg:  "you already have a public perspective on this content",
			wantCode: "ALREADY_EXISTS",
		},
		{
			name:     "invalid rating",
			err:      fmt.Errorf("%w: quality 10001", domain.ErrInvalidRating),
			wantMsg:  "invalid rating: rating must be between 0 and 10000: quality 10001",
			wantCode: "INVALID_INPUT",
		},
		{
			name:     "invalid input",
			err:      fmt.Errorf("%w: at least one field must be provided", domain.ErrInvalidInput),
			wantMsg:  "invalid input: invalid input: at least one field must be provided",
			wantCode: "INVALID_INPUT",
		},
		{
			name:     "content not found is not reported as a missing user",
			err:      domain.ErrContentNotFound,
			wantMsg:  "content not found",
			wantCode: "NOT_FOUND",
		},
		{
			name:     "linked perspective not found",
			err:      domain.ErrLinkedPerspectiveNotFound,
			wantMsg:  "linked perspective not found",
			wantCode: "NOT_FOUND",
		},
		{
			name:     "missing user keeps its message",
			err:      fmt.Errorf("%w: user with id 3 not found", domain.ErrNotFound),
			wantMsg:  "user not found: resource not found: user with id 3 not found",
			wantCode: "NOT_FOUND",
		},
		{
			name:     "unexpected failure has no code",
			err:      errors.New("connection reset"),
			wantMsg:  "failed to create perspective: connection reset",
			wantCode: "",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			msg, code := clientError(createPerspectiveError(tc.err, tc.privacy))
			assert.Equal(t, tc.wantMsg, msg)
			assert.Equal(t, tc.wantCode, code)
		})
	}
}

func TestUpdatePerspectiveErrorsCarryKinds(t *testing.T) {
	cases := []struct {
		name     string
		err      error
		wantMsg  string
		wantCode string
	}{
		{
			name:     "review status is refused as forbidden",
			err:      domain.ErrReviewStatusLocked,
			wantMsg:  "access denied: review status is set by moderators",
			wantCode: "FORBIDDEN",
		},
		{
			name:     "not the owner",
			err:      fmt.Errorf("%w: you can only modify your own perspectives", domain.ErrForbidden),
			wantMsg:  "access denied: you can only modify your own perspectives",
			wantCode: "FORBIDDEN",
		},
		{
			name:     "linked perspective not found",
			err:      domain.ErrLinkedPerspectiveNotFound,
			wantMsg:  "linked perspective not found",
			wantCode: "NOT_FOUND",
		},
		{
			name:     "missing perspective",
			err:      fmt.Errorf("failed to get perspective: %w", domain.ErrNotFound),
			wantMsg:  "perspective not found",
			wantCode: "NOT_FOUND",
		},
		{
			name:     "duplicate without a privacy in the patch",
			err:      domain.ErrDuplicatePerspective,
			wantMsg:  "you already have a perspective on this content with that privacy setting",
			wantCode: "ALREADY_EXISTS",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			msg, code := clientError(updatePerspectiveError(tc.err, nil))
			assert.Equal(t, tc.wantMsg, msg)
			assert.Equal(t, tc.wantCode, code)
		})
	}
}
