package main

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBooksJSON_ParsesTo66Books(t *testing.T) {
	var books []bookRow
	err := json.Unmarshal(booksJSON, &books)
	require.NoError(t, err)
	assert.Len(t, books, 66)
	assert.Equal(t, "Genesis", books[0].Name)
	assert.Equal(t, "Revelation", books[65].Name)
}

// TestBooksJSON_VersesPerChapterMatchesChapterCountAndTotal is the critical
// correctness check for the versesPerChapter rework: each book's array
// length must equal its chapterCount, and the sum of every integer across
// all 66 books must equal the known total verse count implied by
// data/bible/bsb.tsv (31,102 verses, one per row after the header).
func TestBooksJSON_VersesPerChapterMatchesChapterCountAndTotal(t *testing.T) {
	const wantTotalVerses = 31102

	var books []bookRow
	err := json.Unmarshal(booksJSON, &books)
	require.NoError(t, err)
	require.Len(t, books, 66)

	total := 0
	for _, b := range books {
		assert.Lenf(t, b.VersesPerChapter, b.ChapterCount,
			"%s: len(VersesPerChapter) must equal ChapterCount", b.Name)
		for _, v := range b.VersesPerChapter {
			total += v
		}
	}
	assert.Equal(t, wantTotalVerses, total, "sum of all versesPerChapter entries must equal total verse count")
}
