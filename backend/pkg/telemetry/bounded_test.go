package telemetry_test

import (
	"fmt"
	"regexp"
	"strings"
	"sync"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/pkg/telemetry"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBoundedSet_Normalize(t *testing.T) {
	t.Run("new valid name is accepted", func(t *testing.T) {
		b := telemetry.NewBoundedSet(10, telemetry.OperationNamePattern)
		assert.Equal(t, "GetUser", b.Normalize("GetUser"))
	})

	t.Run("known name still accepted after cap reached", func(t *testing.T) {
		b := telemetry.NewBoundedSet(1, telemetry.OperationNamePattern)
		require.Equal(t, "GetUser", b.Normalize("GetUser"))
		// Cap is now full (max=1), but the same name should still resolve to itself.
		assert.Equal(t, "GetUser", b.Normalize("GetUser"))
	})

	t.Run("new name after cap reached becomes other", func(t *testing.T) {
		b := telemetry.NewBoundedSet(1, telemetry.OperationNamePattern)
		require.Equal(t, "GetUser", b.Normalize("GetUser"))
		assert.Equal(t, telemetry.ValueOther, b.Normalize("GetPost"))
	})

	t.Run("regex-invalid name becomes other", func(t *testing.T) {
		b := telemetry.NewBoundedSet(10, telemetry.OperationNamePattern)
		assert.Equal(t, telemetry.ValueOther, b.Normalize("1invalid-name!"))
	})

	t.Run("empty string becomes anonymous", func(t *testing.T) {
		b := telemetry.NewBoundedSet(10, telemetry.OperationNamePattern)
		assert.Equal(t, telemetry.ValueAnonymous, b.Normalize(""))
	})

	t.Run("very long string becomes other without running regex", func(t *testing.T) {
		b := telemetry.NewBoundedSet(10, telemetry.OperationNamePattern)
		long := strings.Repeat("a", 10000)
		assert.Equal(t, telemetry.ValueOther, b.Normalize(long))
	})

	t.Run("nil pattern accepts anything non-empty", func(t *testing.T) {
		b := telemetry.NewBoundedSet(10, nil)
		assert.Equal(t, "anything-goes!!", b.Normalize("anything-goes!!"))
	})

	t.Run("max <= 0 sends everything but empty to other", func(t *testing.T) {
		b := telemetry.NewBoundedSet(0, telemetry.OperationNamePattern)
		assert.Equal(t, telemetry.ValueOther, b.Normalize("GetUser"))
		assert.Equal(t, telemetry.ValueAnonymous, b.Normalize(""))

		bNeg := telemetry.NewBoundedSet(-5, telemetry.OperationNamePattern)
		assert.Equal(t, telemetry.ValueOther, bNeg.Normalize("GetUser"))
	})
}

func TestOperationNamePattern(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  bool
	}{
		{"simple name", "GetUser", true},
		{"underscore prefix", "_privateOp", true},
		{"digits allowed after first char", "Op123", true},
		{"leading digit rejected", "1Op", false},
		{"hyphen rejected", "Get-User", false},
		{"empty rejected", "", false},
		{"too long rejected", strings.Repeat("a", 65), false},
		{"max length accepted", strings.Repeat("a", 64), true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, telemetry.OperationNamePattern.MatchString(tt.input))
		})
	}
}

func TestClientVersionPattern(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  bool
	}{
		{"semver", "1.2.3", true},
		{"semver with build metadata", "1.2.3+build.4", true},
		{"pre-release with hyphen", "1.2.3-beta", true},
		{"empty rejected", "", false},
		{"invalid characters rejected", "1.2.3!", false},
		{"too long rejected", strings.Repeat("1", 33), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, telemetry.ClientVersionPattern.MatchString(tt.input))
		})
	}
}

func TestClientPlatformPattern(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  bool
	}{
		{"web", "web", true},
		{"ios", "ios", true},
		{"android", "android", true},
		{"windows rejected", "windows", false},
		{"case mismatch rejected", "Web", false},
		{"empty rejected", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, telemetry.ClientPlatformPattern.MatchString(tt.input))
		})
	}
}

// TestBoundedSet_Concurrency asserts that concurrent Normalize calls never let the
// known set grow past max, even when 100 goroutines race to insert distinct names.
// Run with -race.
func TestBoundedSet_Concurrency(t *testing.T) {
	const (
		numGoroutines = 100
		max           = 50
	)
	b := telemetry.NewBoundedSet(max, regexp.MustCompile(`^name-\d+$`))

	results := make([]string, numGoroutines)
	var wg sync.WaitGroup
	wg.Add(numGoroutines)
	for i := 0; i < numGoroutines; i++ {
		go func(i int) {
			defer wg.Done()
			results[i] = b.Normalize(fmt.Sprintf("name-%d", i))
		}(i)
	}
	wg.Wait()

	distinct := make(map[string]struct{})
	for _, r := range results {
		if r != telemetry.ValueOther {
			distinct[r] = struct{}{}
		}
	}
	assert.Len(t, distinct, max, "exactly max distinct non-other values should have been accepted")
}
