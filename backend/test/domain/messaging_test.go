package domain_test

import (
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
)

func TestThreadRoleValues(t *testing.T) {
	assert.Equal(t, domain.ThreadRole("OWNER"), domain.ThreadRoleOwner)
	assert.Equal(t, domain.ThreadRole("MEMBER"), domain.ThreadRoleMember)
}

func TestPresenceStateValues(t *testing.T) {
	assert.Equal(t, domain.PresenceState("ONLINE"), domain.PresenceOnline)
	assert.Equal(t, domain.PresenceState("OFFLINE"), domain.PresenceOffline)
}

func TestThreadEventMarker(t *testing.T) {
	var evts []domain.ThreadEvent = []domain.ThreadEvent{
		domain.MessagePostedEvent{},
		domain.ReadReceiptChangedEvent{},
		domain.TypingChangedEvent{},
		domain.ParticipantChangedEvent{},
		domain.PresenceChangedEvent{},
		domain.StreamResetEvent{},
	}
	assert.Len(t, evts, 6)
}
