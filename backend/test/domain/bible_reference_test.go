package domain_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
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

func TestCanonicalPassageURL_SingleVerse(t *testing.T) {
	assert.Equal(t, "https://www.biblegateway.com/passage/?search=Genesis+1%3A1",
		domain.CanonicalPassageURL("Genesis", 1, 1, 1, 1))
}

func TestCanonicalPassageURL_VerseRange(t *testing.T) {
	assert.Equal(t, "https://www.biblegateway.com/passage/?search=Genesis+1%3A1-3",
		domain.CanonicalPassageURL("Genesis", 1, 1, 1, 3))
}

func TestCanonicalPassageURL_CrossChapterRange(t *testing.T) {
	assert.Equal(t, "https://www.biblegateway.com/passage/?search=John+3%3A16-4%3A2",
		domain.CanonicalPassageURL("John", 3, 16, 4, 2))
}

func TestCanonicalPassageURL_NeverContainsVersion(t *testing.T) {
	assert.NotContains(t, domain.CanonicalPassageURL("Genesis", 1, 1, 1, 3), "version=")
}

func TestCanonicalPassageName(t *testing.T) {
	assert.Equal(t, "Genesis 1:1-3", domain.CanonicalPassageName("Genesis", 1, 1, 1, 3))
	assert.Equal(t, "Genesis 1:1", domain.CanonicalPassageName("Genesis", 1, 1, 1, 1))
	assert.Equal(t, "John 3:16-4:2", domain.CanonicalPassageName("John", 3, 16, 4, 2))
}

func TestBibleVerseOrdinal_Synthetic(t *testing.T) {
	books := []domain.BibleBook{
		{ID: 2, Name: "B", VersesPerChapter: []int{4, 6}},
		{ID: 1, Name: "A", VersesPerChapter: []int{3, 5}}, // unordered on purpose
	}
	cases := []struct{ book, ch, v, want int }{
		{1, 1, 1, 1},
		{1, 1, 3, 3},
		{1, 2, 1, 4},
		{1, 2, 5, 8},
		{2, 1, 1, 9},
		{2, 2, 6, 18},
	}
	for _, c := range cases {
		got, err := domain.BibleVerseOrdinal(books, c.book, c.ch, c.v)
		require.NoError(t, err)
		assert.Equal(t, c.want, got, "book %d %d:%d", c.book, c.ch, c.v)
	}
}

func TestBibleVerseOrdinal_OutOfRange(t *testing.T) {
	books := []domain.BibleBook{{ID: 1, Name: "A", VersesPerChapter: []int{3, 5}}}
	for _, c := range []struct{ book, ch, v int }{
		{9, 1, 1}, {1, 0, 1}, {1, 3, 1}, {1, 1, 0}, {1, 1, 4}, {1, 2, 6},
	} {
		_, err := domain.BibleVerseOrdinal(books, c.book, c.ch, c.v)
		assert.ErrorIs(t, err, domain.ErrInvalidPassage, "%+v", c)
	}
}

// Real data: anchors from the reworked reference data (bsb.tsv verse_id space).
func TestBibleVerseOrdinal_RealBooks(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "data", "bible", "books.json"))
	require.NoError(t, err)
	var rows []struct {
		ID               int    `json:"id"`
		Name             string `json:"name"`
		VersesPerChapter []int  `json:"versesPerChapter"`
	}
	require.NoError(t, json.Unmarshal(raw, &rows))
	books := make([]domain.BibleBook, len(rows))
	for i, r := range rows {
		books[i] = domain.BibleBook{ID: r.ID, Name: r.Name, VersesPerChapter: r.VersesPerChapter}
	}

	first, err := domain.BibleVerseOrdinal(books, 1, 1, 1)
	require.NoError(t, err)
	assert.Equal(t, 1, first)

	last := books[65]
	end, err := domain.BibleVerseOrdinal(books, 66, len(last.VersesPerChapter), last.VersesPerChapter[len(last.VersesPerChapter)-1])
	require.NoError(t, err)
	assert.Equal(t, 31102, end, "Revelation 22:21 is the last seeded verse")
}
