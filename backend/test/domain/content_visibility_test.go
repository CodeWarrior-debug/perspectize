package domain_test

import (
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
)

// VisibleTo answers the spec's privacy rule for a content row: a PRIVATE row is
// readable only by its owner, anything else (PUBLIC, or unset) by anyone.
func TestContentVisibleTo(t *testing.T) {
	const owner = 7

	tests := []struct {
		name     string
		privacy  domain.Privacy
		viewerID int
		want     bool
	}{
		{"private: owner may see it", domain.PrivacyPrivate, owner, true},
		{"private: other signed-in user may not", domain.PrivacyPrivate, 8, false},
		{"private: anonymous (viewer 0) may not", domain.PrivacyPrivate, 0, false},
		{"public: owner may see it", domain.PrivacyPublic, owner, true},
		{"public: other signed-in user may see it", domain.PrivacyPublic, 8, true},
		{"public: anonymous may see it", domain.PrivacyPublic, 0, true},
		{"unset privacy is public: other user may see it", "", 8, true},
		{"unset privacy is public: anonymous may see it", "", 0, true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			c := &domain.Content{ID: 1, AddedByUserID: owner, Privacy: tc.privacy}
			assert.Equal(t, tc.want, c.VisibleTo(tc.viewerID))
		})
	}
}

// A private row owned by user 0 must still not be visible to an anonymous
// viewer: viewer 0 is "no one", never the owner.
func TestContentVisibleTo_AnonymousNeverOwnsPrivateRow(t *testing.T) {
	c := &domain.Content{ID: 1, AddedByUserID: 0, Privacy: domain.PrivacyPrivate}
	assert.False(t, c.VisibleTo(0))
}
