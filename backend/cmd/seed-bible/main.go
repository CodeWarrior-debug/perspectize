package main

import (
	_ "embed"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

//go:embed data/books.json
var booksJSON []byte

//go:embed data/verses.tsv
var versesTSV []byte

type bookRow struct {
	ID           int      `json:"id"`
	Name         string   `json:"name"`
	Testament    string   `json:"testament"`
	Canon        string   `json:"canon"`
	Division     string   `json:"division"`
	ChapterCount int      `json:"chapterCount"`
	Aliases      []string `json:"aliases"`
}

type verseRow struct {
	ID      int
	BookID  int
	Chapter int
	Verse   int
}

func main() {
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

	verseCount, err := seedVerses(db, versesTSV)
	if err != nil {
		log.Fatalf("failed to seed verses: %v", err)
	}

	fmt.Printf("Seeded %d books, %d verses\n", len(books), verseCount)
}

func seedBooks(db *gorm.DB, books []bookRow) error {
	for _, b := range books {
		aliasesJSON, err := json.Marshal(b.Aliases)
		if err != nil {
			return fmt.Errorf("marshal aliases for %s: %w", b.Name, err)
		}
		err = db.Exec(`
			INSERT INTO bible_book (id, name, testament, canon, division, chapter_count, aliases)
			VALUES (?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT (id) DO UPDATE SET
				name = EXCLUDED.name, testament = EXCLUDED.testament,
				canon = EXCLUDED.canon, division = EXCLUDED.division,
				chapter_count = EXCLUDED.chapter_count, aliases = EXCLUDED.aliases
		`, b.ID, b.Name, b.Testament, b.Canon, b.Division, b.ChapterCount, string(aliasesJSON)).Error
		if err != nil {
			return fmt.Errorf("upsert book %s: %w", b.Name, err)
		}
	}
	return nil
}

// seedVerses parses the embedded verses TSV and writes it to the database. It
// is a thin wrapper around parseVerses (pure, DB-independent) and writeVerses
// (DB writes only) so parsing can be unit-tested without a live database.
func seedVerses(db *gorm.DB, tsv []byte) (int, error) {
	rows, err := parseVerses(tsv)
	if err != nil {
		return 0, err
	}
	if err := writeVerses(db, rows); err != nil {
		return 0, err
	}
	return len(rows), nil
}

// parseVerses parses the verses.tsv contents (verse_id, book_id, chapter, verse,
// with a header row) into verseRow structs. It performs no I/O and needs no
// database connection, so it can be exercised directly by tests.
func parseVerses(tsv []byte) ([]verseRow, error) {
	r := csv.NewReader(strings.NewReader(string(tsv)))
	r.Comma = '\t'
	records, err := r.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("parse verses.tsv: %w", err)
	}
	if len(records) < 2 {
		return nil, fmt.Errorf("verses.tsv has no data rows")
	}

	rows := make([]verseRow, 0, len(records)-1)
	for i, record := range records[1:] { // skip header
		if len(record) != 4 {
			return nil, fmt.Errorf("verses.tsv row %d: expected 4 columns, got %d", i+2, len(record))
		}
		id, err := strconv.Atoi(record[0])
		if err != nil {
			return nil, fmt.Errorf("verses.tsv row %d: invalid verse_id %q: %w", i+2, record[0], err)
		}
		bookID, err := strconv.Atoi(record[1])
		if err != nil {
			return nil, fmt.Errorf("verses.tsv row %d: invalid book_id %q: %w", i+2, record[1], err)
		}
		chapter, err := strconv.Atoi(record[2])
		if err != nil {
			return nil, fmt.Errorf("verses.tsv row %d: invalid chapter %q: %w", i+2, record[2], err)
		}
		verse, err := strconv.Atoi(record[3])
		if err != nil {
			return nil, fmt.Errorf("verses.tsv row %d: invalid verse %q: %w", i+2, record[3], err)
		}
		rows = append(rows, verseRow{ID: id, BookID: bookID, Chapter: chapter, Verse: verse})
	}
	return rows, nil
}

// writeVerses upserts the given verse rows into bible_verse inside a single
// transaction, keyed by ordinal id so re-running the seeder is idempotent.
func writeVerses(db *gorm.DB, rows []verseRow) error {
	return db.Transaction(func(tx *gorm.DB) error {
		for _, row := range rows {
			err := tx.Exec(`
				INSERT INTO bible_verse (id, book_id, chapter, verse)
				VALUES (?, ?, ?, ?)
				ON CONFLICT (id) DO UPDATE SET
					book_id = EXCLUDED.book_id, chapter = EXCLUDED.chapter, verse = EXCLUDED.verse
			`, row.ID, row.BookID, row.Chapter, row.Verse).Error
			if err != nil {
				return fmt.Errorf("upsert verse %d: %w", row.ID, err)
			}
		}
		return nil
	})
}
