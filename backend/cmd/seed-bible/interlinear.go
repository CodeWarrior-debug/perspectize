package main

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"gorm.io/gorm"
)

// The interlinear files are produced by data/bible/scripts/normalize_interlinear.py
// (see data/bible/README.md) and fetched by hand into data/bible/interlinear/.
// The committed manifest (data/bible/sources.json) pins their SHA-256 and row counts.

const (
	wordColumns      = 14
	wordBatchSize    = 1000 // 14 params/row = 14,000 params, far under Postgres' 65,535 limit
	lexiconBatchSize = 1000 // 4 params/row

	wordHeader    = "verse\tbsb_sort\tlanguage\tsource_sort\tsource\ttranslit\tparse_short\tparse_full\torig_strongs\tstrongs\tstrongs_source\tspan_head\tchunk_text\tspace_before"
	lexiconHeader = "tag\tplain\tlanguage\tgloss"
)

type outputFile struct {
	Asset  string `json:"asset"`
	SHA256 string `json:"sha256"`
	Rows   int    `json:"rows"`
}

type manifest struct {
	Version int `json:"version"`
	Outputs struct {
		BibleWord    outputFile `json:"bible_word"`
		BibleLexicon outputFile `json:"bible_lexicon"`
	} `json:"outputs"`
}

type wordRow struct {
	VerseID       int
	BSBSort       int
	Language      string
	SourceSort    *int
	Source        string
	Translit      string
	ParseShort    string
	ParseFull     string
	OrigStrongs   *int
	Strongs       string
	StrongsSource string
	SpanHead      *int
	ChunkText     string
	SpaceBefore   bool
}

type lexiconRow struct {
	Tag      string
	Plain    string
	Language string
	Gloss    string
}

func loadManifest(path string) (manifest, error) {
	var m manifest
	raw, err := os.ReadFile(path)
	if err != nil {
		return m, err
	}
	if err := json.Unmarshal(raw, &m); err != nil {
		return m, fmt.Errorf("parse manifest %s: %w", path, err)
	}
	if m.Outputs.BibleWord.Asset == "" || m.Outputs.BibleLexicon.Asset == "" {
		return m, fmt.Errorf("manifest %s has no bible_word/bible_lexicon outputs", path)
	}
	return m, nil
}

// readVerified returns the file's bytes after checking its SHA-256. A missing
// file yields an error wrapping the os error so callers can detect it.
func readVerified(path, wantSHA string) ([]byte, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	h := sha256.Sum256(data)
	if got := hex.EncodeToString(h[:]); got != wantSHA {
		return nil, fmt.Errorf("sha256 mismatch for %s: manifest %s, file %s", filepath.Base(path), wantSHA, got)
	}
	return data, nil
}

func unwrapPathError(err error) error {
	var pe *os.PathError
	if errors.As(err, &pe) {
		return pe
	}
	return err
}

func gunzipLines(data []byte) ([]string, error) {
	zr, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("not a gzip file: %w", err)
	}
	raw, err := io.ReadAll(zr)
	if err != nil {
		return nil, fmt.Errorf("gunzip: %w", err)
	}
	return strings.Split(strings.TrimRight(string(raw), "\n"), "\n"), nil
}

func optInt(s string) (*int, error) {
	if s == "" {
		return nil, nil
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return nil, err
	}
	return &n, nil
}

func parseWordTSV(data []byte) ([]wordRow, error) {
	lines, err := gunzipLines(data)
	if err != nil {
		return nil, err
	}
	if len(lines) < 1 || lines[0] != wordHeader {
		return nil, fmt.Errorf("unexpected word file header (want %q)", wordHeader)
	}
	rows := make([]wordRow, 0, len(lines)-1)
	for i, line := range lines[1:] {
		c := strings.Split(line, "\t")
		if len(c) != wordColumns {
			return nil, fmt.Errorf("line %d: want %d columns, got %d", i+2, wordColumns, len(c))
		}
		verse, err := strconv.Atoi(c[0])
		if err != nil {
			return nil, fmt.Errorf("line %d: bad verse %q", i+2, c[0])
		}
		sort, err := strconv.Atoi(c[1])
		if err != nil {
			return nil, fmt.Errorf("line %d: bad bsb_sort %q", i+2, c[1])
		}
		srcSort, err := optInt(c[3])
		if err != nil {
			return nil, fmt.Errorf("line %d: bad source_sort %q", i+2, c[3])
		}
		orig, err := optInt(c[8])
		if err != nil {
			return nil, fmt.Errorf("line %d: bad orig_strongs %q", i+2, c[8])
		}
		head, err := optInt(c[11])
		if err != nil {
			return nil, fmt.Errorf("line %d: bad span_head %q", i+2, c[11])
		}
		rows = append(rows, wordRow{
			VerseID: verse, BSBSort: sort, Language: c[2], SourceSort: srcSort, Source: c[4], Translit: c[5],
			ParseShort: c[6], ParseFull: c[7], OrigStrongs: orig, Strongs: c[9], StrongsSource: c[10],
			SpanHead: head, ChunkText: c[12], SpaceBefore: c[13] == "1",
		})
	}
	return rows, nil
}

func parseLexiconTSV(data []byte) ([]lexiconRow, error) {
	lines, err := gunzipLines(data)
	if err != nil {
		return nil, err
	}
	if len(lines) < 1 || lines[0] != lexiconHeader {
		return nil, fmt.Errorf("unexpected lexicon file header (want %q)", lexiconHeader)
	}
	rows := make([]lexiconRow, 0, len(lines)-1)
	for i, line := range lines[1:] {
		c := strings.Split(line, "\t")
		if len(c) != 4 {
			return nil, fmt.Errorf("line %d: want 4 columns, got %d", i+2, len(c))
		}
		rows = append(rows, lexiconRow{Tag: c[0], Plain: c[1], Language: c[2], Gloss: c[3]})
	}
	return rows, nil
}

// buildWordInsert returns one multi-row INSERT. There is deliberately no ON CONFLICT:
// the tables are truncated first, so a duplicate (verse_id, bsb_sort) means a bad file.
func buildWordInsert(rows []wordRow) (string, []any) {
	ph := make([]string, 0, len(rows))
	args := make([]any, 0, len(rows)*wordColumns)
	for _, r := range rows {
		ph = append(ph, "(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
		args = append(args, r.VerseID, r.BSBSort, r.Language, r.SourceSort, r.Source, r.Translit,
			r.ParseShort, r.ParseFull, r.OrigStrongs, r.Strongs, r.StrongsSource, r.SpanHead, r.ChunkText, r.SpaceBefore)
	}
	return "INSERT INTO bible_word (verse_id, bsb_sort, language, source_sort, source, translit, parse_short, parse_full, " +
		"orig_strongs, strongs, strongs_source, span_head, chunk_text, space_before) VALUES " + strings.Join(ph, ", "), args
}

func buildLexiconInsert(rows []lexiconRow) (string, []any) {
	ph := make([]string, 0, len(rows))
	args := make([]any, 0, len(rows)*4)
	for _, r := range rows {
		ph = append(ph, "(?,?,?,?)")
		args = append(args, r.Tag, r.Plain, r.Language, r.Gloss)
	}
	return "INSERT INTO bible_lexicon (tag, plain, language, gloss) VALUES " + strings.Join(ph, ", "), args
}

// seedInterlinear loads the verified files. It returns (false, nil) without touching
// the database when the files have not been downloaded.
func seedInterlinear(db *gorm.DB, manifestPath, dir string) (bool, error) {
	m, err := loadManifest(manifestPath)
	if err != nil {
		return false, err
	}
	wordData, err := readVerified(filepath.Join(dir, m.Outputs.BibleWord.Asset), m.Outputs.BibleWord.SHA256)
	if err != nil {
		if os.IsNotExist(unwrapPathError(err)) {
			return false, nil
		}
		return false, err
	}
	lexData, err := readVerified(filepath.Join(dir, m.Outputs.BibleLexicon.Asset), m.Outputs.BibleLexicon.SHA256)
	if err != nil {
		if os.IsNotExist(unwrapPathError(err)) {
			return false, nil
		}
		return false, err
	}
	words, err := parseWordTSV(wordData)
	if err != nil {
		return false, fmt.Errorf("parse %s: %w", m.Outputs.BibleWord.Asset, err)
	}
	lexicon, err := parseLexiconTSV(lexData)
	if err != nil {
		return false, fmt.Errorf("parse %s: %w", m.Outputs.BibleLexicon.Asset, err)
	}
	if len(words) != m.Outputs.BibleWord.Rows || len(lexicon) != m.Outputs.BibleLexicon.Rows {
		return false, fmt.Errorf("row count mismatch: manifest %d/%d, files %d/%d",
			m.Outputs.BibleWord.Rows, m.Outputs.BibleLexicon.Rows, len(words), len(lexicon))
	}

	err = db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("TRUNCATE bible_word, bible_lexicon").Error; err != nil {
			return fmt.Errorf("truncate: %w", err)
		}
		for start := 0; start < len(words); start += wordBatchSize {
			sql, args := buildWordInsert(words[start:min(start+wordBatchSize, len(words))])
			if err := tx.Exec(sql, args...).Error; err != nil {
				return fmt.Errorf("insert bible_word batch at %d: %w", start, err)
			}
		}
		for start := 0; start < len(lexicon); start += lexiconBatchSize {
			sql, args := buildLexiconInsert(lexicon[start:min(start+lexiconBatchSize, len(lexicon))])
			if err := tx.Exec(sql, args...).Error; err != nil {
				return fmt.Errorf("insert bible_lexicon batch at %d: %w", start, err)
			}
		}
		return tx.Exec(`
			INSERT INTO bible_data_version (id, manifest_version, word_sha256, lexicon_sha256)
			VALUES (1, ?, ?, ?)
			ON CONFLICT (id) DO UPDATE SET manifest_version = EXCLUDED.manifest_version,
				word_sha256 = EXCLUDED.word_sha256, lexicon_sha256 = EXCLUDED.lexicon_sha256, loaded_at = now()
		`, m.Version, m.Outputs.BibleWord.SHA256, m.Outputs.BibleLexicon.SHA256).Error
	})
	if err != nil {
		return false, err
	}
	fmt.Printf("Seeded %d interlinear word rows and %d lexicon entries (manifest v%d)\n", len(words), len(lexicon), m.Version)
	return true, nil
}
