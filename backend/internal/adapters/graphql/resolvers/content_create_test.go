package resolvers

import (
	"errors"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/vektah/gqlparser/v2/gqlerror"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// Every create mutation shares createResult/createError. Each table row is one
// mutation's failure messages; the error kinds must map to the codes below and
// the messages must match the ones clients already match on.
func TestCreateFailureMessagesAndCodes(t *testing.T) {
	cases := []struct {
		name     string
		failure  createFailure
		err      error
		wantMsg  string
		wantCode string
	}{
		{"youtube invalid URL", youtubeCreateFailure, fmt.Errorf("x: %w", domain.ErrInvalidURL), "invalid YouTube URL", "INVALID_INPUT"},
		{"youtube metadata unavailable", youtubeCreateFailure, domain.Unavailable("failed to fetch video metadata"), "failed to create content from YouTube", "UNAVAILABLE"},
		{"youtube plain error has no code", youtubeCreateFailure, errors.New("boom"), "failed to create content from YouTube", ""},
		{"movie invalid", movieCreateFailure, fmt.Errorf("x: %w", domain.ErrInvalidInput), "invalid movie URL: use a TMDB or IMDb movie link", "INVALID_INPUT"},
		{"movie not found", movieCreateFailure, fmt.Errorf("%w: movie not found", domain.ErrNotFound), "movie not found", "NOT_FOUND"},
		{"movie not allowed", movieCreateFailure, domain.ErrContentNotAllowed, domain.ErrContentNotAllowed.Error(), "CONTENT_NOT_ALLOWED"},
		{"movie unavailable", movieCreateFailure, domain.Unavailable("movie lookup is unavailable: no movie client configured"), "failed to create content from movie", "UNAVAILABLE"},
		{"book invalid", bookCreateFailure, fmt.Errorf("x: %w", domain.ErrInvalidInput), "invalid book URL or ISBN: use an Open Library work link or an ISBN-10/13", "INVALID_INPUT"},
		{"book not found", bookCreateFailure, fmt.Errorf("%w: isbn not found", domain.ErrNotFound), "book not found", "NOT_FOUND"},
		{"passage invalid input shows its message", passageCreateFailure, fmt.Errorf("%w: passage end is before its start", domain.ErrInvalidPassage), "invalid input: invalid Bible passage: passage end is before its start", "INVALID_INPUT"},
		{"passage plain error is generic", passageCreateFailure, errors.New("db down"), "failed to create passage", ""},
		{"webpage unknown role", webPageCreateFailure, fmt.Errorf("%w: %w", domain.ErrInvalidInput, domain.ErrUnknownWebPageRole), "unknown webpage role", "INVALID_INPUT"},
		{"webpage plain error is generic", webPageCreateFailure, errors.New("db down"), "failed to save webpage", ""},
		{"website plain error is generic", websiteCreateFailure, errors.New("db down"), "failed to save website", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := createError(tc.err, tc.failure)
			require.Error(t, err)
			var gqlErr *gqlerror.Error
			if tc.wantCode == "" {
				assert.False(t, errors.As(err, &gqlErr), "no kind, no extension")
				assert.Equal(t, tc.wantMsg, err.Error())
				return
			}
			require.True(t, errors.As(err, &gqlErr), "typed kind carries an extension code")
			// Clients read Message, so that is what must match the legacy text.
			assert.Equal(t, tc.wantMsg, gqlErr.Message)
			assert.Equal(t, tc.wantCode, gqlErr.Extensions["code"])
		})
	}
}

// A duplicate is a success with alreadyExisted for every create mutation, not an error.
func TestCreateResultDuplicateReportsAlreadyExisted(t *testing.T) {
	for _, f := range []createFailure{youtubeCreateFailure, movieCreateFailure, bookCreateFailure, passageCreateFailure, webPageCreateFailure, websiteCreateFailure} {
		row := &domain.Content{ID: 7, Name: "saved"}
		res, err := createResult(row, domain.ErrAlreadyExists, f)
		require.NoError(t, err)
		require.NotNil(t, res.Content)
		assert.True(t, res.AlreadyExisted)
	}
}

func TestCreateResultFreshRowIsNotAlreadyExisted(t *testing.T) {
	res, err := createResult(&domain.Content{ID: 8, Name: "new"}, nil, movieCreateFailure)
	require.NoError(t, err)
	assert.False(t, res.AlreadyExisted)
}
