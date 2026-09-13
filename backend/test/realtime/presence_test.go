package realtime_test

import (
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/realtime"
	"github.com/stretchr/testify/assert"
)

func TestPresenceTracker_RefcountAndExpiry(t *testing.T) {
	now := time.Unix(1000, 0)
	p := realtime.NewPresenceTracker()
	p.NowFn = func() time.Time { return now }

	assert.True(t, p.Connect(1), "first connection")
	assert.False(t, p.Connect(1), "second connection not first")
	assert.True(t, p.IsOnline(1))

	assert.False(t, p.Disconnect(1), "one ref remains")
	assert.True(t, p.Disconnect(1), "last connection")
	assert.True(t, p.IsOnline(1), "still online within 45s of last activity")

	now = now.Add(46 * time.Second)
	assert.False(t, p.IsOnline(1), "expired after 45s")
}

func TestPresenceTracker_TouchKeepsOnline(t *testing.T) {
	now := time.Unix(2000, 0)
	p := realtime.NewPresenceTracker()
	p.NowFn = func() time.Time { return now }

	assert.True(t, p.Connect(7))
	assert.True(t, p.Disconnect(7), "last connection")

	now = now.Add(40 * time.Second)
	assert.True(t, p.IsOnline(7), "40s since last activity")

	p.Touch(7) // heartbeat at the current fake now
	now = now.Add(40 * time.Second)
	assert.True(t, p.IsOnline(7), "touch reset the 45s window")

	now = now.Add(6 * time.Second)
	assert.False(t, p.IsOnline(7), "46s since the last touch")
}

func TestPresenceTracker_Expire(t *testing.T) {
	now := time.Unix(3000, 0)
	p := realtime.NewPresenceTracker()
	p.NowFn = func() time.Time { return now }

	// User 1: connected (refs > 0) — must survive Expire regardless of age.
	assert.True(t, p.Connect(1))
	// User 2: disconnected, will age out.
	assert.True(t, p.Connect(2))
	assert.True(t, p.Disconnect(2))
	// User 3: disconnected, still fresh.
	assert.True(t, p.Connect(3))
	assert.True(t, p.Disconnect(3))

	now = now.Add(46 * time.Second)
	p.Touch(3) // refresh user 3 right before expiry sweep

	p.Expire()

	assert.True(t, p.IsOnline(1), "connected user is never expired")
	assert.False(t, p.IsOnline(2), "stale disconnected user expired")
	assert.True(t, p.IsOnline(3), "freshly touched disconnected user survives")

	// Re-connecting an expired user starts a fresh refcount at 1.
	assert.True(t, p.Connect(2), "expired entry gone, so this is a first connection")
}

func TestPresenceTracker_UnknownUserOffline(t *testing.T) {
	p := realtime.NewPresenceTracker()
	assert.False(t, p.IsOnline(999))
}
