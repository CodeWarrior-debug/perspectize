package domain_test

import (
	"encoding/json"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

func intPtr(v int) *int { return &v }

func strPtr(v string) *string { return &v }

func TestValidatePerspective(t *testing.T) {
	cases := []struct {
		name    string
		p       domain.Perspective
		wantErr error
	}{
		{name: "quality only is valid", p: domain.Perspective{Quality: intPtr(5000)}},
		{name: "custom fields alone are content", p: domain.Perspective{CustomFields: json.RawMessage(`{"belief":7}`)}},
		{name: "categorized rating alone is content", p: domain.Perspective{CategorizedRatings: []domain.CategorizedRating{{Category: "x", Rating: 1}}}},
		{name: "labels alone are content", p: domain.Perspective{Labels: []string{"tag"}}},
		{name: "review alone is content", p: domain.Perspective{Review: strPtr("text")}},
		{name: "empty custom fields object is not content", p: domain.Perspective{CustomFields: json.RawMessage(`{}`)}, wantErr: domain.ErrInvalidInput},
		{name: "privacy and category alone are not content", p: domain.Perspective{Privacy: domain.PrivacyPublic, Category: strPtr("c")}, wantErr: domain.ErrInvalidInput},
		{name: "nothing at all", p: domain.Perspective{}, wantErr: domain.ErrInvalidInput},
		{name: "quality above range", p: domain.Perspective{Quality: intPtr(10001)}, wantErr: domain.ErrInvalidRating},
		{name: "confidence below range", p: domain.Perspective{Confidence: intPtr(-1)}, wantErr: domain.ErrInvalidRating},
		{
			name:    "categorized rating above range",
			p:       domain.Perspective{CategorizedRatings: []domain.CategorizedRating{{Category: "x", Rating: 10001}}},
			wantErr: domain.ErrInvalidRating,
		},
		{
			name:    "feelings over the cap",
			p:       domain.Perspective{Feelings: make([]domain.FeelingEntry, domain.MaxFeelings+1)},
			wantErr: domain.ErrInvalidInput,
		},
		{
			name:    "feeling without an emoji",
			p:       domain.Perspective{Feelings: []domain.FeelingEntry{{Intensity: 1}}},
			wantErr: domain.ErrInvalidInput,
		},
		{
			name: "related ids at the cap are valid",
			p:    domain.Perspective{Quality: intPtr(1), RelatedPerspectiveIDs: make([]int, domain.MaxRelatedPerspectiveIDs)},
		},
		{
			name:    "related ids over the cap",
			p:       domain.Perspective{Quality: intPtr(1), RelatedPerspectiveIDs: make([]int, domain.MaxRelatedPerspectiveIDs+1)},
			wantErr: domain.ErrInvalidInput,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := domain.ValidatePerspective(&tc.p)
			if tc.wantErr == nil {
				assert.NoError(t, err)
				return
			}
			assert.True(t, errors.Is(err, tc.wantErr), "got %v", err)
		})
	}
}

func TestMaxRelatedPerspectiveIDs(t *testing.T) {
	assert.Equal(t, 50, domain.MaxRelatedPerspectiveIDs)
}

func TestSentinelsWrapTheirKinds(t *testing.T) {
	assert.True(t, errors.Is(domain.ErrDuplicatePerspective, domain.ErrAlreadyExists))
	assert.True(t, errors.Is(domain.ErrLinkedPerspectiveNotFound, domain.ErrNotFound))
	assert.True(t, errors.Is(domain.ErrReviewStatusLocked, domain.ErrForbidden))
}

func TestKindOfDuplicatePerspective(t *testing.T) {
	assert.Equal(t, domain.KindDuplicate, domain.KindOf(domain.ErrDuplicatePerspective))
	// A plain ErrAlreadyExists stays unkinded: it is the content success path.
	assert.Equal(t, domain.KindNone, domain.KindOf(domain.ErrAlreadyExists))
}
