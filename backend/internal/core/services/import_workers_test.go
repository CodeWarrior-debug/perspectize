package services

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// RF2: an absurd cap (100,000) must not start 100,000 goroutines for a small
// batch: a batch starts no more workers than it has rows.
func TestWorkersFor(t *testing.T) {
	tests := []struct {
		name           string
		capacity, rows int
		want           int
	}{
		{"fewer rows than slots", 1000, 3, 3},
		{"more rows than slots", 4, 100, 4},
		{"no rows", 4, 0, 0},
		{"one slot", 1, 5, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, workersFor(tt.capacity, tt.rows))
		})
	}
}
