package realtime_test

import (
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/realtime"
	"github.com/stretchr/testify/assert"
)

func newClockedTracker(start time.Time) (*realtime.PresenceTracker, *time.Time) {
	now := start
	p := realtime.NewPresenceTracker()
	p.NowFn = func() time.Time { return now }
	return p, &now
}

// Exactly presenceTTL (45s) after last activity the user is still online;
// one nanosecond later they are not.
func TestPresenceTracker_IsOnlineAtExactTTLBoundary(t *testing.T) {
	p, now := newClockedTracker(time.Unix(5000, 0))
	p.Touch(1)

	*now = now.Add(45 * time.Second)
	assert.True(t, p.IsOnline(1), "exactly 45s is still online")

	*now = now.Add(time.Nanosecond)
	assert.False(t, p.IsOnline(1), "just past 45s is offline")
}

// Expire keeps an idle entry whose age equals the TTL exactly, and removes it
// once it is older.
func TestPresenceTracker_ExpireAtExactTTLBoundary(t *testing.T) {
	p, now := newClockedTracker(time.Unix(6000, 0))
	p.Touch(1)

	*now = now.Add(45 * time.Second)
	p.Expire()
	assert.True(t, p.IsOnline(1), "entry aged exactly 45s is retained")

	*now = now.Add(time.Nanosecond)
	p.Expire()
	assert.False(t, p.IsOnline(1), "entry older than 45s is dropped")
}

// Expire must never drop a user who still holds a live connection.
func TestPresenceTracker_ExpireKeepsConnectedUsers(t *testing.T) {
	p, now := newClockedTracker(time.Unix(7000, 0))
	p.Connect(1)
	*now = now.Add(time.Hour)
	p.Expire()
	assert.Equal(t, 1, p.RefCount(1))
	assert.True(t, p.IsOnline(1))
}

// A Disconnect with no matching live connection must not drive the ref count
// negative.
func TestPresenceTracker_DisconnectWithoutConnectionDoesNotGoNegative(t *testing.T) {
	p, _ := newClockedTracker(time.Unix(8000, 0))

	assert.True(t, p.Connect(1))
	assert.True(t, p.Disconnect(1), "last connection closed")
	assert.True(t, p.Disconnect(1), "extra disconnect still reports no connections")
	assert.Equal(t, 0, p.RefCount(1), "ref count floors at zero")

	assert.True(t, p.Connect(1), "next connect is a first connection again")
}
