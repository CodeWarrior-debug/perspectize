package services_test

import (
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
)

func TestSlidingWindowLimiter(t *testing.T) {
	now := time.Unix(0, 0)
	lim := services.NewSlidingWindowLimiter(3, time.Second)
	lim.NowFn = func() time.Time { return now }

	assert.True(t, lim.Allow("u1"))
	assert.True(t, lim.Allow("u1"))
	assert.True(t, lim.Allow("u1"))
	assert.False(t, lim.Allow("u1"), "4th in window rejected")
	assert.True(t, lim.Allow("u2"), "other key unaffected")

	now = now.Add(1100 * time.Millisecond)
	assert.True(t, lim.Allow("u1"), "window elapsed, allowed again")
}
