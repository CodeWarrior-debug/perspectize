package domain_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/require"
)

// tagFixtureCase mirrors one entry of testdata/version-tag-fixture.json,
// shared with frontend/tests/unit/buildTag.test.ts so the Go and TS tag
// computations are proven to agree on the same inputs.
type tagFixtureCase struct {
	Name          string `json:"name"`
	CommitterDate string `json:"committerDate"`
	SHA           string `json:"sha"`
	ExpectedTag   string `json:"expectedTag"`
}

func loadTagFixture(t *testing.T) []tagFixtureCase {
	t.Helper()
	path := filepath.Join("..", "..", "..", "testdata", "version-tag-fixture.json")
	data, err := os.ReadFile(path)
	require.NoError(t, err)

	var cases []tagFixtureCase
	require.NoError(t, json.Unmarshal(data, &cases))
	require.NotEmpty(t, cases)
	return cases
}

func TestComputeTag_MatchesSharedFixture(t *testing.T) {
	for _, c := range loadTagFixture(t) {
		t.Run(c.Name, func(t *testing.T) {
			committerDate, err := time.Parse(time.RFC3339, c.CommitterDate)
			require.NoError(t, err)

			got := domain.ComputeTag(committerDate, c.SHA)
			require.Equal(t, c.ExpectedTag, got)
		})
	}
}
