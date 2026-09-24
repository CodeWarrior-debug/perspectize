package domain

import "sort"

// InterlinearWordRow is one bible_word row joined with its lexicon gloss.
// Rows are ordered by (VerseID, BSBSort). A row with an empty Language is an
// English word that has no source word.
type InterlinearWordRow struct {
	VerseID       int
	BSBSort       int
	Language      string // "heb" | "grc" | "" (English-only)
	SourceSort    *int
	Source        string
	Translit      string
	ParseShort    string
	ParseFull     string
	OrigStrongs   *int
	Strongs       string
	StrongsSource string // "tagged" | "fallback"
	SpanHead      *int   // BSBSort of the first row of this word's English phrase; nil = no phrase
	ChunkText     string
	SpaceBefore   bool
	Gloss         string
}

// InterlinearSegment is one run of the verse text; concatenating the segments
// (a space before each with SpaceBefore) reproduces the plain BSB verse.
type InterlinearSegment struct {
	Text        string
	SpaceBefore bool
}

// InterlinearWord is one source word. Words are in original order and ID is the
// index in that order. Segment is the index of its English phrase, or nil.
type InterlinearWord struct {
	ID          int
	Language    string
	Source      string
	Translit    string
	Parsing     string
	Strongs     string
	Gloss       string
	TagSource   string
	SourceOrder int
	Segment     *int
}

type InterlinearVerse struct {
	VerseID  int
	Chapter  int
	Verse    int
	Segments []InterlinearSegment
	Words    []InterlinearWord
}

type PassageInterlinear struct {
	Verses []InterlinearVerse
}

// BuildInterlinearVerses groups rows (ordered by VerseID, then BSBSort) into verses.
// Only verses that have rows are returned; callers treat a missing verse as "no
// alignment data" and show plain text.
func BuildInterlinearVerses(books []BibleBook, rows []InterlinearWordRow) ([]InterlinearVerse, error) {
	verses := []InterlinearVerse{}
	for start := 0; start < len(rows); {
		end := start
		for end < len(rows) && rows[end].VerseID == rows[start].VerseID {
			end++
		}
		verse, err := buildInterlinearVerse(books, rows[start:end])
		if err != nil {
			return nil, err
		}
		verses = append(verses, verse)
		start = end
	}
	return verses, nil
}

func buildInterlinearVerse(books []BibleBook, rows []InterlinearWordRow) (InterlinearVerse, error) {
	_, chapter, verse, err := BibleVerseFromOrdinal(books, rows[0].VerseID)
	if err != nil {
		return InterlinearVerse{}, err
	}

	segments := []InterlinearSegment{}
	segmentBySort := map[int]int{} // bsb_sort of a row with text -> index in segments
	sources := []InterlinearWordRow{}
	for _, r := range rows {
		if r.ChunkText != "" {
			segmentBySort[r.BSBSort] = len(segments)
			segments = append(segments, InterlinearSegment{Text: r.ChunkText, SpaceBefore: r.SpaceBefore})
		}
		if r.Language != "" {
			sources = append(sources, r)
		}
	}
	sort.SliceStable(sources, func(i, j int) bool { return sortKey(sources[i].SourceSort) < sortKey(sources[j].SourceSort) })

	words := make([]InterlinearWord, len(sources))
	for i, r := range sources {
		w := InterlinearWord{
			ID: i, Language: r.Language, Source: r.Source, Translit: r.Translit, Parsing: r.ParseFull,
			Strongs: r.Strongs, Gloss: r.Gloss, TagSource: r.StrongsSource, SourceOrder: i,
		}
		if r.SpanHead != nil {
			if idx, ok := segmentBySort[*r.SpanHead]; ok {
				seg := idx
				w.Segment = &seg
			}
		}
		words[i] = w
	}
	return InterlinearVerse{VerseID: rows[0].VerseID, Chapter: chapter, Verse: verse, Segments: segments, Words: words}, nil
}

func sortKey(p *int) int {
	if p == nil {
		return 1 << 30
	}
	return *p
}
