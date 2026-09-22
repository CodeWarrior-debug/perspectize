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

func TestVersesTSV_ParsesWithoutError(t *testing.T) {
	rows, err := parseVerses(versesTSV)
	require.NoError(t, err)
	assert.Len(t, rows, 31102)
	assert.Equal(t, verseRow{ID: 1, BookID: 1, Chapter: 1, Verse: 1}, rows[0])
	assert.Equal(t, 66, rows[len(rows)-1].BookID)
}

func TestParseVerses_RejectsMalformedRow(t *testing.T) {
	bad := []byte("verse_id\tbook_id\tchapter\tverse\n1\t1\t1\tnot-a-number\n")
	_, err := parseVerses(bad)
	require.Error(t, err)
}

func TestParseVerses_RejectsEmptyInput(t *testing.T) {
	_, err := parseVerses([]byte("verse_id\tbook_id\tchapter\tverse\n"))
	require.Error(t, err)
}
