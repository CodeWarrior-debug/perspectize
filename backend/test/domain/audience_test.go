package domain_test

import (
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
)

// The audience rule answers three questions for one row: who may read it, who
// may write it, and whether it counts in aggregates. Anonymous viewers are 0.
func TestAudience_Rule(t *testing.T) {
	const owner, stranger = 7, 8

	cases := []struct {
		name      string
		privacy   domain.Privacy
		read      map[int]bool // viewer -> readable
		aggregate bool
	}{
		{"public row", domain.PrivacyPublic, map[int]bool{0: true, owner: true, stranger: true}, true},
		{"private row", domain.PrivacyPrivate, map[int]bool{0: false, owner: true, stranger: false}, false},
		// An unknown privacy is hidden from non-owners, never shown by default.
		{"unknown privacy", domain.Privacy("SHARED"), map[int]bool{0: false, owner: true, stranger: false}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			a := domain.Audience{Privacy: tc.privacy, OwnerID: owner}
			for viewer, want := range tc.read {
				assert.Equal(t, want, a.ReadableBy(viewer), "viewer %d", viewer)
			}
			assert.Equal(t, tc.aggregate, a.CountsInAggregates())
			assert.True(t, a.WritableBy(owner))
			assert.False(t, a.WritableBy(stranger))
			assert.False(t, a.WritableBy(0), "anonymous never writes")
		})
	}

	t.Run("an owner ID of 0 never matches an anonymous viewer", func(t *testing.T) {
		a := domain.Audience{Privacy: domain.PrivacyPrivate, OwnerID: 0}
		assert.False(t, a.ReadableBy(0))
		assert.False(t, a.WritableBy(0))
	})

	t.Run("unset content privacy is public", func(t *testing.T) {
		assert.True(t, domain.ContentAudience("", owner).ReadableBy(0))
		assert.True(t, domain.ContentAudience("", owner).CountsInAggregates(),
			"unset content is normalized to PUBLIC, so it counts like any public row")
	})

	t.Run("non-owner write refusal: readable is forbidden, unreadable is not found", func(t *testing.T) {
		assert.ErrorIs(t, domain.NonOwnerWriteError(domain.PrivacyPublic), domain.ErrForbidden)
		assert.ErrorIs(t, domain.NonOwnerWriteError(domain.PrivacyPrivate), domain.ErrNotFound)
	})
}
