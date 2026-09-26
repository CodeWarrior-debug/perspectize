// Package telemetry provides shared, dependency-light building blocks for the
// observability work in this repo. bounded.go in particular guards metric
// attribute cardinality: values that originate from untrusted request input
// (operation names, client versions, client platforms) must never be able to
// create unbounded numbers of metric series.
package telemetry

import (
	"regexp"
	"sync"
)

// Sentinel values returned by BoundedSet.Normalize.
const (
	// ValueOther is returned for input that either fails the configured
	// pattern, is too long, or would exceed the cardinality cap.
	ValueOther = "other"
	// ValueAnonymous is returned for empty input.
	ValueAnonymous = "anonymous"
)

// maxInputLength bounds the size of input considered for pattern matching.
// Anything longer is rejected outright as ValueOther before running the
// regex, so a malicious caller can't use a huge string to burn CPU on regex
// evaluation.
const maxInputLength = 256

// Shared patterns for the untrusted inputs enumerated in the observability
// plan's Global Constraints: operation name, client version, client platform.
var (
	// OperationNamePattern matches GraphQL-style operation names: an
	// initial letter or underscore, followed by up to 63 more letters,
	// digits, or underscores (64 chars total).
	OperationNamePattern = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]{0,63}$`)

	// ClientVersionPattern matches version-ish strings such as semver
	// (e.g. "1.2.3+build.4"), up to 32 characters.
	ClientVersionPattern = regexp.MustCompile(`^[0-9A-Za-z.+-]{1,32}$`)

	// ClientPlatformPattern matches the known client platforms.
	ClientPlatformPattern = regexp.MustCompile(`^(web|ios|android)$`)
)

// BoundedSet normalizes untrusted string input into a bounded set of known
// values, to guard the cardinality of metric attributes derived from request
// input. Once max distinct values have been observed, any further new value
// is reported as ValueOther. Safe for concurrent use.
type BoundedSet struct {
	mu      sync.RWMutex
	known   map[string]struct{}
	max     int
	pattern *regexp.Regexp
}

// NewBoundedSet constructs a BoundedSet that accepts up to max distinct
// values matching pattern.
//
// If pattern is nil, any non-empty input (within the length limit) is
// accepted as a candidate value, instead of being rejected for failing to
// match a pattern.
//
// If max <= 0, no new values are ever accepted: every non-empty input
// normalizes to ValueOther (empty input still normalizes to ValueAnonymous).
func NewBoundedSet(max int, pattern *regexp.Regexp) *BoundedSet {
	return &BoundedSet{
		known:   make(map[string]struct{}),
		max:     max,
		pattern: pattern,
	}
}

// Normalize returns a cardinality-safe representation of s:
//
//   - "" returns ValueAnonymous.
//   - Input longer than maxInputLength, or that doesn't match the
//     configured pattern, returns ValueOther.
//   - A previously-seen value returns s unchanged.
//   - A new value returns s unchanged and is recorded, as long as fewer
//     than max distinct values are currently known.
//   - Otherwise (cap reached) returns ValueOther.
func (b *BoundedSet) Normalize(s string) string {
	if s == "" {
		return ValueAnonymous
	}
	if len(s) > maxInputLength {
		return ValueOther
	}
	if b.pattern != nil && !b.pattern.MatchString(s) {
		return ValueOther
	}

	// Fast path: value already known, only a read lock needed.
	b.mu.RLock()
	_, ok := b.known[s]
	b.mu.RUnlock()
	if ok {
		return s
	}

	// Slow path: value may be new. Re-check under the write lock in case
	// another goroutine recorded it (or filled the cap) in the meantime.
	b.mu.Lock()
	defer b.mu.Unlock()

	if _, ok := b.known[s]; ok {
		return s
	}
	if len(b.known) >= b.max {
		return ValueOther
	}
	b.known[s] = struct{}{}
	return s
}
