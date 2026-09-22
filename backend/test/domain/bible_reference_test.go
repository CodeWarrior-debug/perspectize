package domain_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBibleBooksJSON_Has66Books(t *testing.T) {
	// Reads the repo-root data file directly (not the embedded copy) so this
	// test also catches the two copies drifting apart.
	path := filepath.Join("..", "..", "..", "data", "bible", "books.json")
	raw, err := os.ReadFile(path)
	require.NoError(t, err)

	var books []struct {
		ID   int    `json:"id"`
		Name string `json:"name"`
	}
	require.NoError(t, json.Unmarshal(raw, &books))
	assert.Len(t, books, 66)
	assert.Equal(t, "Genesis", books[0].Name)
	assert.Equal(t, "Revelation", books[65].Name)
}

func TestSeederEmbeddedBooksJSON_MatchesRepoRoot(t *testing.T) {
	rootPath := filepath.Join("..", "..", "..", "data", "bible", "books.json")
	embeddedPath := filepath.Join("..", "..", "..", "backend", "cmd", "seed-bible", "data", "books.json")
	rootBytes, err := os.ReadFile(rootPath)
	require.NoError(t, err)
	embeddedBytes, err := os.ReadFile(embeddedPath)
	require.NoError(t, err)
	assert.JSONEq(t, string(rootBytes), string(embeddedBytes),
		"backend/cmd/seed-bible/data/books.json has drifted from data/bible/books.json — re-copy it")
}

func TestFrontendBooksJSON_MatchesRepoRoot(t *testing.T) {
	rootPath := filepath.Join("..", "..", "..", "data", "bible", "books.json")
	frontendPath := filepath.Join("..", "..", "..", "frontend", "src", "lib", "data", "bible-books.json")
	rootBytes, err := os.ReadFile(rootPath)
	require.NoError(t, err)
	frontendBytes, err := os.ReadFile(frontendPath)
	require.NoError(t, err)
	assert.JSONEq(t, string(rootBytes), string(frontendBytes),
		"frontend/src/lib/data/bible-books.json has drifted from data/bible/books.json — re-copy it")
}
