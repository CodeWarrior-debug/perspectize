package main

import (
	"encoding/json"
	"os"
	"path/filepath"
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

func TestParseBSB_RealFile_SequentialAndMatchesVerseTotal(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "data", "bible", "bsb.tsv"))
	require.NoError(t, err)

	rows, err := parseBSB(raw)
	require.NoError(t, err)

	var books []bookRow
	require.NoError(t, json.Unmarshal(booksJSON, &books))
	total := 0
	for _, b := range books {
		for _, n := range b.VersesPerChapter {
			total += n
		}
	}
	assert.Len(t, rows, total, "bsb.tsv must have one row per verse ordinal derived from books.json")
	assert.Equal(t, 1, rows[0].VerseID)
	assert.Equal(t, "In the beginning God created the heavens and the earth.", rows[0].Text)
}

func TestParseBSB_Validation(t *testing.T) {
	good, err := parseBSB([]byte("verse_id\ttext\n1\ta\n2\t\n3\tc\td\n"))
	require.NoError(t, err)
	assert.Equal(t, []verseTextRow{{1, "a"}, {2, ""}, {3, "c\td"}}, good, "empty text and embedded tabs are preserved")

	crlf, err := parseBSB([]byte("verse_id\ttext\r\n1\ta\r\n"))
	require.NoError(t, err)
	assert.Equal(t, []verseTextRow{{1, "a"}}, crlf)

	for name, in := range map[string]string{
		"bad header":     "id\ttext\n1\ta\n",
		"gap in ids":     "verse_id\ttext\n1\ta\n3\tc\n",
		"non numeric id": "verse_id\ttext\nx\ta\n",
		"empty":          "",
	} {
		_, err := parseBSB([]byte(in))
		assert.Error(t, err, name)
	}
}
