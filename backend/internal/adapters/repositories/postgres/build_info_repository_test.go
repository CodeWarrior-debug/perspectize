package postgres

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFindMigrationFile(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{
		"000026_add_bible_interlinear_tables.up.sql",
		"000026_add_bible_interlinear_tables.down.sql",
		"000027_add_category_wikipedia_url.up.sql",
		"000027_add_category_wikipedia_url.down.sql",
	} {
		require.NoError(t, os.WriteFile(filepath.Join(dir, name), []byte("-- noop"), 0o600))
	}

	t.Run("finds the up-migration for the version", func(t *testing.T) {
		assert.Equal(t, "000027_add_category_wikipedia_url.up.sql", findMigrationFile(dir, 27))
	})

	t.Run("never returns the down-migration", func(t *testing.T) {
		assert.NotEqual(t, "000027_add_category_wikipedia_url.down.sql", findMigrationFile(dir, 27))
	})

	t.Run("returns empty for an unknown version", func(t *testing.T) {
		assert.Equal(t, "", findMigrationFile(dir, 999))
	})

	t.Run("returns empty for an unset directory", func(t *testing.T) {
		assert.Equal(t, "", findMigrationFile("", 27))
	})

	t.Run("returns empty for a nonexistent directory", func(t *testing.T) {
		assert.Equal(t, "", findMigrationFile(filepath.Join(dir, "does-not-exist"), 27))
	})
}
