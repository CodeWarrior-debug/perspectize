package services

import (
	"sync"
	"time"
)

// SlidingWindowLimiter implements rate limiting using a sliding window algorithm.
type SlidingWindowLimiter struct {
	max    int
	window time.Duration
	NowFn  func() time.Time

	mu   sync.Mutex
	hits map[string][]time.Time
}

// NewSlidingWindowLimiter creates a rate limiter that allows at most max events within a window.
func NewSlidingWindowLimiter(max int, window time.Duration) *SlidingWindowLimiter {
	return &SlidingWindowLimiter{
		max: max, window: window, NowFn: time.Now,
		hits: make(map[string][]time.Time),
	}
}

// Allow returns true if the key is within the rate limit, false otherwise.
func (l *SlidingWindowLimiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.NowFn()
	cutoff := now.Add(-l.window)
	kept := l.hits[key][:0]
	for _, ts := range l.hits[key] {
		if ts.After(cutoff) {
			kept = append(kept, ts)
		}
	}
	if len(kept) >= l.max {
		l.hits[key] = kept
		return false
	}
	l.hits[key] = append(kept, now)
	return true
}
