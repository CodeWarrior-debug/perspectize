package resolvers

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// An unknown role and a bad URL both wrap domain.ErrInvalidInput, so the role must
// be matched first or a role mistake reports as a URL problem.
func TestWebPageInputMessage(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want string
	}{
		{
			name: "unknown role names the role, not the URL",
			err:  fmt.Errorf("%w: %w", domain.ErrInvalidInput, domain.ErrUnknownWebPageRole),
			want: "unknown webpage role",
		},
		{
			name: "invalid URL",
			err:  fmt.Errorf("%w: only http and https links can be saved", domain.ErrInvalidInput),
			want: "invalid webpage URL: use an http or https link to a public page",
		},
		{
			name: "refused address reads as a URL problem, with no address named",
			err:  fmt.Errorf("%w: address not public", domain.ErrInvalidInput),
			want: "invalid webpage URL: use an http or https link to a public page",
		},
		{
			name: "a site root given as a page",
			err:  fmt.Errorf("%w: %w", domain.ErrInvalidInput, domain.ErrWebPageIsWebsite),
			want: "that link is a whole website: add it as a website, not a page",
		},
		{
			name: "parent missing",
			err:  fmt.Errorf("%w: %w", domain.ErrInvalidInput, domain.ErrParentNotFound),
			want: "the website to file this page under does not exist",
		},
		{
			name: "parent not a website",
			err:  fmt.Errorf("%w: %w", domain.ErrInvalidInput, domain.ErrParentNotWebsite),
			want: "the parent must be a website",
		},
		{
			name: "parent on another host",
			err:  fmt.Errorf("%w: %w", domain.ErrInvalidInput, domain.ErrParentOtherHost),
			want: "the parent website is on a different host than this page",
		},
		{
			name: "any other error is not an input error",
			err:  fmt.Errorf("db down"),
			want: "",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, webPageInputMessage(tt.err))
		})
	}
}
