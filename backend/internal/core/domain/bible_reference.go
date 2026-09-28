package domain

import (
	"fmt"
	"net/url"
	"sort"
)

// ErrInvalidPassage is returned when a passage reference is out of range
// (unknown book, chapter beyond the book, verse beyond the chapter, or an end
// before the start).
var ErrInvalidPassage = fmt.Errorf("%w: invalid Bible passage", ErrInvalidInput)

// BibleBook is the slice of a bible_book row needed to compute verse ordinals.
type BibleBook struct {
	ID               int
	Name             string
	VersesPerChapter []int // one entry per chapter, that chapter's verse count
}

// BibleVerseOrdinal returns the global, 1-based verse ordinal for
// (bookID, chapter, verse):
//
//	ordinal = (verses in every book with id < bookID)
//	        + (verses in earlier chapters of this book)
//	        + verse
//
// books must contain every book (ordering does not matter — books are
// selected by ID). It validates that chapter and verse exist, so callers get
// the range check a per-verse table lookup would otherwise have provided.
func BibleVerseOrdinal(books []BibleBook, bookID, chapter, verse int) (int, error) {
	var target *BibleBook
	offset := 0
	for i := range books {
		b := &books[i]
		if b.ID == bookID {
			target = b
			continue
		}
		if b.ID < bookID {
			for _, n := range b.VersesPerChapter {
				offset += n
			}
		}
	}
	if target == nil {
		return 0, fmt.Errorf("%w: unknown book %d", ErrInvalidPassage, bookID)
	}
	if chapter < 1 || chapter > len(target.VersesPerChapter) {
		return 0, fmt.Errorf("%w: %s has no chapter %d", ErrInvalidPassage, target.Name, chapter)
	}
	if verse < 1 || verse > target.VersesPerChapter[chapter-1] {
		return 0, fmt.Errorf("%w: %s %d has no verse %d", ErrInvalidPassage, target.Name, chapter, verse)
	}
	for _, n := range target.VersesPerChapter[:chapter-1] {
		offset += n
	}
	return offset + verse, nil
}

// BibleVerseFromOrdinal is the inverse of BibleVerseOrdinal: it resolves a
// 1-based global verse ordinal back to (bookID, chapter, verse). books may be
// in any order; they are walked by ascending ID.
func BibleVerseFromOrdinal(books []BibleBook, ordinal int) (bookID, chapter, verse int, err error) {
	if ordinal < 1 {
		return 0, 0, 0, fmt.Errorf("%w: verse ordinal %d out of range", ErrInvalidPassage, ordinal)
	}
	sorted := make([]BibleBook, len(books))
	copy(sorted, books)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].ID < sorted[j].ID })

	remaining := ordinal
	for _, b := range sorted {
		for ch, n := range b.VersesPerChapter {
			if remaining <= n {
				return b.ID, ch + 1, remaining, nil
			}
			remaining -= n
		}
	}
	return 0, 0, 0, fmt.Errorf("%w: verse ordinal %d out of range", ErrInvalidPassage, ordinal)
}

// BibleTranslationBSB is the code of the only translation whose text is stored
// locally (Berean Standard Bible, public domain).
const BibleTranslationBSB = "BSB"

// BibleTranslationBSBCopyright is the attribution line shown with BSB text.
const BibleTranslationBSBCopyright = "Berean Standard Bible, public domain (CC0)"

// BibleVerseText is one stored verse of a translation, keyed by ordinal.
type BibleVerseText struct {
	VerseID int
	Text    string
}

// PassageVerse is a verse of passage text with its resolved reference.
type PassageVerse struct {
	VerseID int
	Chapter int
	Verse   int
	Text    string
}

// PassageText is the text of a verse range in one translation.
type PassageText struct {
	Translation string
	Copyright   string
	Verses      []PassageVerse
}

// CanonicalPassageURL builds the version-less Bible Gateway URL used as the
// dedupe key for a BIBLE_PASSAGE content row. It must be the ONLY place this
// string is constructed — every creation path (picker, free text, or a pasted
// Bible Gateway link) funnels through this function so the same verse range
// always produces byte-identical output. Never store a pasted URL directly;
// parse it to (book, chapter, verse) and regenerate.
func CanonicalPassageURL(bookName string, startChapter, startVerse, endChapter, endVerse int) string {
	q := url.Values{}
	q.Set("search", formatReference(bookName, startChapter, startVerse, endChapter, endVerse))
	return "https://www.biblegateway.com/passage/?" + q.Encode()
}

// CanonicalPassageName builds the content.name value for a passage — the
// permanent, non-editable canonical reference. Distinct from DisplayTitle,
// which is optional, user-set, and stored separately.
func CanonicalPassageName(bookName string, startChapter, startVerse, endChapter, endVerse int) string {
	return formatReference(bookName, startChapter, startVerse, endChapter, endVerse)
}

func formatReference(bookName string, startChapter, startVerse, endChapter, endVerse int) string {
	if startChapter == endChapter && startVerse == endVerse {
		return fmt.Sprintf("%s %d:%d", bookName, startChapter, startVerse)
	}
	if startChapter == endChapter {
		return fmt.Sprintf("%s %d:%d-%d", bookName, startChapter, startVerse, endVerse)
	}
	return fmt.Sprintf("%s %d:%d-%d:%d", bookName, startChapter, startVerse, endChapter, endVerse)
}
