package main

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"log"
	"os"

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

	fmt.Printf("Seeded %d books\n", len(books))
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
