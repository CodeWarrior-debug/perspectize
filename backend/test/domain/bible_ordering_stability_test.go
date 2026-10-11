package domain_test

import (
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Words with equal source_sort (including all-nil) must keep their input order:
// the sort is documented as stable, and ties are common (NULL source_sort).
func TestBuildInterlinearVerses_SourceSortTiesKeepInputOrder(t *testing.T) {
	books := []domain.BibleBook{{ID: 1, Name: "Genesis", VersesPerChapter: []int{3}}}
	one, two := 5, 5

	tests := []struct {
		name string
		sort [3]*int
	}{
		{"all nil", [3]*int{nil, nil, nil}},
		{"all equal non-nil", [3]*int{&one, &two, &one}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rows := []domain.InterlinearWordRow{
				{VerseID: 1, BSBSort: 1, Language: "heb", Source: "a", SourceSort: tt.sort[0]},
				{VerseID: 1, BSBSort: 2, Language: "heb", Source: "b", SourceSort: tt.sort[1]},
				{VerseID: 1, BSBSort: 3, Language: "heb", Source: "c", SourceSort: tt.sort[2]},
			}
			verses, err := domain.BuildInterlinearVerses(books, rows)
			require.NoError(t, err)
			require.Len(t, verses, 1)
			var got []string
			for _, w := range verses[0].Words {
				got = append(got, w.Source)
			}
			assert.Equal(t, []string{"a", "b", "c"}, got)
		})
	}
}

// Books are walked by ascending ID; books sharing an ID keep their input order.
func TestBibleVerseFromOrdinal_EqualBookIDsKeepInputOrder(t *testing.T) {
	books := []domain.BibleBook{
		{ID: 1, Name: "First", VersesPerChapter: []int{3}},
		{ID: 1, Name: "Second", VersesPerChapter: []int{5}},
	}
	// Ordinal 4 is past the first entry's 3 verses, so it is verse 1 of the
	// second entry's chapter 1 (not verse 4 of the larger entry if reordered).
	bookID, chapter, verse, err := domain.BibleVerseFromOrdinal(books, 4)
	require.NoError(t, err)
	assert.Equal(t, 1, bookID)
	assert.Equal(t, 1, chapter)
	assert.Equal(t, 1, verse)
}
