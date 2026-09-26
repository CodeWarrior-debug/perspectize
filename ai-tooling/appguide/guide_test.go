package appguide

import (
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

// TestEmbeddedGuideIsClean lints the real guide. Any problem fails CI, so a
// guide entry that cites a moved or deleted frontend file breaks the build.
func TestEmbeddedGuideIsClean(t *testing.T) {
	areas, seeds, err := Load()
	require.NoError(t, err)
	for _, p := range Lint(areas, seeds, filepath.Join("..", "..")) {
		t.Error(p.String())
	}
}
