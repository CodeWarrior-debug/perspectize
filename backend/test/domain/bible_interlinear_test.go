package domain_test

import (
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func intp(n int) *int { return &n }

func genesisBooks() []domain.BibleBook {
	return []domain.BibleBook{{ID: 1, Name: "Genesis", VersesPerChapter: []int{31, 25}}}
}

// Genesis 1:1 in English order: In-the-beginning (H7225), God (H430), [untranslated object marker H853],
// created (H1254), then English-only "the heavens and the earth." Hebrew order is
// beginning, created, God, marker.
func genesis11Rows() []domain.InterlinearWordRow {
	return []domain.InterlinearWordRow{
		{VerseID: 1, BSBSort: 100, Language: "heb", SourceSort: intp(1), Source: "רֵאשִׁית", Translit: "re.shit", ParseFull: "Noun", OrigStrongs: intp(7225), Strongs: "H7225G", StrongsSource: "tagged", SpanHead: intp(100), ChunkText: "In the beginning", Gloss: "first: beginning"},
		{VerseID: 1, BSBSort: 101, Language: "heb", SourceSort: intp(3), Source: "אֱלֹהִים", Translit: "'E.lo.Him", ParseFull: "Noun", OrigStrongs: intp(430), Strongs: "H0430G", StrongsSource: "tagged", SpanHead: intp(101), ChunkText: "God", SpaceBefore: true, Gloss: "God"},
		{VerseID: 1, BSBSort: 102, Language: "heb", SourceSort: intp(4), Source: "אֵת", Translit: "'et", OrigStrongs: intp(853), Strongs: "H0853", StrongsSource: "tagged", Gloss: "[Obj.]"},
		{VerseID: 1, BSBSort: 103, Language: "heb", SourceSort: intp(2), Source: "בָּרָא", Translit: "ba.Ra'", ParseFull: "Verb", OrigStrongs: intp(1254), Strongs: "H1254A", StrongsSource: "tagged", SpanHead: intp(103), ChunkText: "created", SpaceBefore: true, Gloss: "to create"},
		{VerseID: 1, BSBSort: 104, ChunkText: "the heavens and the earth.", SpaceBefore: true},
	}
}

func TestBuildInterlinearVerses_GenesisOneOneWordOrderSwap(t *testing.T) {
	verses, err := domain.BuildInterlinearVerses(genesisBooks(), genesis11Rows())
	require.NoError(t, err)
	require.Len(t, verses, 1)
	v := verses[0]
	assert.Equal(t, 1, v.VerseID)
	assert.Equal(t, 1, v.Chapter)
	assert.Equal(t, 1, v.Verse)

	// Segments are in English (bsb_sort) order.
	texts := make([]string, len(v.Segments))
	for i, s := range v.Segments {
		texts[i] = s.Text
	}
	assert.Equal(t, []string{"In the beginning", "God", "created", "the heavens and the earth."}, texts)
	assert.False(t, v.Segments[0].SpaceBefore)
	assert.True(t, v.Segments[1].SpaceBefore)

	// Words are in original (source) order: beginning, created, God, marker.
	require.Len(t, v.Words, 4)
	assert.Equal(t, []string{"H7225G", "H1254A", "H0430G", "H0853"},
		[]string{v.Words[0].Strongs, v.Words[1].Strongs, v.Words[2].Strongs, v.Words[3].Strongs})
	for i, w := range v.Words {
		assert.Equal(t, i, w.ID)
		assert.Equal(t, i, w.SourceOrder)
	}

	// "created" (2nd word) points at the 3rd segment; "God" (3rd word) at the 2nd segment: the swap.
	require.NotNil(t, v.Words[1].Segment)
	assert.Equal(t, 2, *v.Words[1].Segment)
	require.NotNil(t, v.Words[2].Segment)
	assert.Equal(t, 1, *v.Words[2].Segment)
	require.NotNil(t, v.Words[0].Segment)
	assert.Equal(t, 0, *v.Words[0].Segment)

	// The untranslated object marker belongs to no phrase.
	assert.Nil(t, v.Words[3].Segment)
	assert.Equal(t, "[Obj.]", v.Words[3].Gloss)
	assert.Equal(t, "to create", v.Words[1].Gloss)
	assert.Equal(t, "tagged", v.Words[1].TagSource)
	assert.Equal(t, "Verb", v.Words[1].Parsing)
}

func TestBuildInterlinearVerses_PhraseWithTwoSourceWords(t *testing.T) {
	rows := []domain.InterlinearWordRow{
		{VerseID: 1, BSBSort: 10, Language: "heb", SourceSort: intp(2), Source: "a", Strongs: "H0001A", StrongsSource: "tagged", SpanHead: intp(10), ChunkText: "whatever you want"},
		{VerseID: 1, BSBSort: 11, Language: "heb", SourceSort: intp(1), Source: "b", Strongs: "H0002", StrongsSource: "tagged", SpanHead: intp(10)}, // continuation: no chunk of its own
	}
	verses, err := domain.BuildInterlinearVerses(genesisBooks(), rows)
	require.NoError(t, err)
	require.Len(t, verses[0].Segments, 1)
	require.Len(t, verses[0].Words, 2)
	assert.Equal(t, "b", verses[0].Words[0].Source) // source order first
	require.NotNil(t, verses[0].Words[0].Segment)
	require.NotNil(t, verses[0].Words[1].Segment)
	assert.Equal(t, 0, *verses[0].Words[0].Segment)
	assert.Equal(t, 0, *verses[0].Words[1].Segment)
}

func TestBuildInterlinearVerses_GroupsByVerseAndComputesChapterAndVerse(t *testing.T) {
	rows := []domain.InterlinearWordRow{
		{VerseID: 1, BSBSort: 1, ChunkText: "one"},
		{VerseID: 1, BSBSort: 2, ChunkText: "two", SpaceBefore: true},
		{VerseID: 32, BSBSort: 5, ChunkText: "next chapter"}, // ordinal 32 = Genesis 2:1
	}
	verses, err := domain.BuildInterlinearVerses(genesisBooks(), rows)
	require.NoError(t, err)
	require.Len(t, verses, 2)
	assert.Len(t, verses[0].Segments, 2)
	assert.Equal(t, 2, verses[1].Chapter)
	assert.Equal(t, 1, verses[1].Verse)
	assert.Empty(t, verses[1].Words, "an English-only verse has segments but no words")
}

func TestBuildInterlinearVerses_SpanHeadThatMatchesNoSegmentBecomesNoPhrase(t *testing.T) {
	rows := []domain.InterlinearWordRow{
		{VerseID: 1, BSBSort: 10, Language: "heb", SourceSort: intp(1), Source: "a", Strongs: "H0001", StrongsSource: "fallback", SpanHead: intp(999)},
	}
	verses, err := domain.BuildInterlinearVerses(genesisBooks(), rows)
	require.NoError(t, err)
	assert.Nil(t, verses[0].Words[0].Segment)
}

func TestBuildInterlinearVerses_EmptyInputAndBadOrdinal(t *testing.T) {
	verses, err := domain.BuildInterlinearVerses(genesisBooks(), nil)
	require.NoError(t, err)
	assert.NotNil(t, verses)
	assert.Empty(t, verses)

	_, err = domain.BuildInterlinearVerses(genesisBooks(), []domain.InterlinearWordRow{{VerseID: 9999, BSBSort: 1, ChunkText: "x"}})
	require.Error(t, err)
}
