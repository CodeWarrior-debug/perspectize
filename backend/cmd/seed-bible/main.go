package main

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// data/books.json (in this directory) is a copy of data/bible/books.json at
// the repo root — go:embed cannot reach outside this module. Keep them in
// sync; drift is caught by TestSeederEmbeddedBooksJSON_MatchesRepoRoot /
// TestFrontendBooksJSON_MatchesRepoRoot in backend/test/domain/bible_reference_test.go.

//go:embed data/books.json
var booksJSON []byte

type bookRow struct {
	ID               int      `json:"id"`
	Name             string   `json:"name"`
	Testament        string   `json:"testament"`
	Canon            string   `json:"canon"`
	Division         string   `json:"division"`
	ChapterCount     int      `json:"chapterCount"`
	Aliases          []string `json:"aliases"`
	VersesPerChapter []int    `json:"versesPerChapter"`
}

// bsbTranslation is the translation code stored in bible_verse_text.translation.
const bsbTranslation = "BSB"

// verseTextBatchSize bounds rows per INSERT (3 params/row stays far under Postgres' 65535 limit).
const verseTextBatchSize = 1000

type verseTextRow struct {
	VerseID int
	Text    string
}

func main() {
	// bsb.tsv is 4 MB, so it is read from disk rather than duplicated under
	// cmd/seed-bible/data for go:embed. The default assumes the documented
	// invocation from backend/ (`go run ./cmd/seed-bible`).
	bsbPath := flag.String("bsb", "../data/bible/bsb.tsv", "path to data/bible/bsb.tsv (verse_id<TAB>text)")
	flag.Parse()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL is required")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("failed to connect: %v", err)
	}

	var books []bookRow
	if err := json.Unmarshal(booksJSON, &books); err != nil {
		log.Fatalf("failed to parse books.json: %v", err)
	}

	if err := seedBooks(db, books); err != nil {
		log.Fatalf("failed to seed books: %v", err)
	}

	fmt.Printf("Seeded %d books\n", len(books))

	raw, err := os.ReadFile(*bsbPath)
	if err != nil {
		log.Fatalf("failed to read %s: %v", *bsbPath, err)
	}
	verses, err := parseBSB(raw)
	if err != nil {
		log.Fatalf("failed to parse bsb.tsv: %v", err)
	}
	if err := seedVerseText(db, bsbTranslation, verses); err != nil {
		log.Fatalf("failed to seed verse text: %v", err)
	}
	fmt.Printf("Seeded %d %s verses\n", len(verses), bsbTranslation)
}

// parseBSB parses bsb.tsv (header, then verse_id<TAB>text per line). Text may
// be empty (verses the BSB omits). It fails on a non-numeric or non-sequential
// verse_id so a corrupted file can't silently misalign text and ordinals.
func parseBSB(tsv []byte) ([]verseTextRow, error) {
	lines := strings.Split(strings.TrimRight(string(bytes.ReplaceAll(tsv, []byte("\r\n"), []byte("\n"))), "\n"), "\n")
	if len(lines) < 2 || lines[0] != "verse_id\ttext" {
		return nil, fmt.Errorf("unexpected header (want %q)", "verse_id\ttext")
	}
	rows := make([]verseTextRow, 0, len(lines)-1)
	for i, line := range lines[1:] {
		idStr, text, _ := strings.Cut(line, "\t")
		id, err := strconv.Atoi(idStr)
		if err != nil {
			return nil, fmt.Errorf("line %d: bad verse_id %q", i+2, idStr)
		}
		if id != i+1 {
			return nil, fmt.Errorf("line %d: verse_id %d is not sequential (want %d)", i+2, id, i+1)
		}
		rows = append(rows, verseTextRow{VerseID: id, Text: text})
	}
	return rows, nil
}

func seedVerseText(db *gorm.DB, translation string, rows []verseTextRow) error {
	return db.Transaction(func(tx *gorm.DB) error {
		for start := 0; start < len(rows); start += verseTextBatchSize {
			end := min(start+verseTextBatchSize, len(rows))
			placeholders := make([]string, 0, end-start)
			args := make([]any, 0, (end-start)*3)
			for _, r := range rows[start:end] {
				placeholders = append(placeholders, "(?, ?, ?)")
				args = append(args, r.VerseID, translation, r.Text)
			}
			err := tx.Exec(`
				INSERT INTO bible_verse_text (verse_id, translation, text)
				VALUES `+strings.Join(placeholders, ", ")+`
				ON CONFLICT (translation, verse_id) DO UPDATE SET text = EXCLUDED.text
			`, args...).Error
			if err != nil {
				return fmt.Errorf("upsert verse text batch at %d: %w", start, err)
			}
		}
		return nil
	})
}

func seedBooks(db *gorm.DB, books []bookRow) error {
	for _, b := range books {
		aliasesJSON, err := json.Marshal(b.Aliases)
		if err != nil {
			return fmt.Errorf("marshal aliases for %s: %w", b.Name, err)
		}
		versesPerChapterJSON, err := json.Marshal(b.VersesPerChapter)
		if err != nil {
			return fmt.Errorf("marshal versesPerChapter for %s: %w", b.Name, err)
		}
		err = db.Exec(`
			INSERT INTO bible_book (id, name, testament, canon, division, chapter_count, aliases, verses_per_chapter)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT (id) DO UPDATE SET
				name = EXCLUDED.name, testament = EXCLUDED.testament,
				canon = EXCLUDED.canon, division = EXCLUDED.division,
				chapter_count = EXCLUDED.chapter_count, aliases = EXCLUDED.aliases,
				verses_per_chapter = EXCLUDED.verses_per_chapter
		`, b.ID, b.Name, b.Testament, b.Canon, b.Division, b.ChapterCount, string(aliasesJSON), string(versesPerChapterJSON)).Error
		if err != nil {
			return fmt.Errorf("upsert book %s: %w", b.Name, err)
		}
	}
	return nil
}
