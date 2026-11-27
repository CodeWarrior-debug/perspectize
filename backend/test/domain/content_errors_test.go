package domain_test

import (
	"errors"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

func TestKindOf(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want domain.ErrorKind
	}{
		{"invalid input", domain.ErrInvalidInput, domain.KindInvalid},
		{"wrapped invalid input", fmt.Errorf("x: %w", domain.ErrInvalidInput), domain.KindInvalid},
		{"invalid URL", domain.ErrInvalidURL, domain.KindInvalid},
		{"invalid passage", domain.ErrInvalidPassage, domain.KindInvalid},
		{"not found", domain.ErrNotFound, domain.KindNotFound},
		{"not allowed", domain.ErrContentNotAllowed, domain.KindNotAllowed},
		{"unavailable", domain.Unavailable("upstream down"), domain.KindUnavailable},
		{"plain error", errors.New("boom"), domain.KindNone},
		{"nil", nil, domain.KindNone},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, domain.KindOf(tc.err))
		})
	}
}

func TestUnavailableKeepsMessage(t *testing.T) {
	err := domain.Unavailable("failed to fetch video metadata")
	assert.EqualError(t, err, "failed to fetch video metadata")
	assert.True(t, errors.Is(err, domain.ErrUnavailable))
}
