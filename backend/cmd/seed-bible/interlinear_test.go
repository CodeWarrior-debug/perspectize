package main

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func gz(t *testing.T, s string) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := gzip.NewWriter(&buf)
	_, err := zw.Write([]byte(s))
	require.NoError(t, err)
	require.NoError(t, zw.Close())
	return buf.Bytes()
}

func sum(b []byte) string {
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}

const wordHeaderLine = "verse\tbsb_sort\tlanguage\tsource_sort\tsource\ttranslit\tparse_short\tparse_full\torig_strongs\tstrongs\tstrongs_source\tspan_head\tchunk_text\tspace_before"

func TestParseWordTSV_ParsesRowsAndNulls(t *testing.T) {
	data := gz(t, wordHeaderLine+"\n"+
		"1\t100\theb\t1\tרֵאשִׁית\tre.shit\tN\tNoun\t7225\tH7225G\ttagged\t100\tIn the beginning\t0\n"+
		"1\t104\t\t\t\t\t\t\t\t\t\t\tthe earth.\t1\n")
	rows, err := parseWordTSV(data)
	require.NoError(t, err)
	require.Len(t, rows, 2)

	w := rows[0]
	assert.Equal(t, 1, w.VerseID)
	assert.Equal(t, 100, w.BSBSort)
	assert.Equal(t, "heb", w.Language)
	require.NotNil(t, w.SourceSort)
	assert.Equal(t, 1, *w.SourceSort)
	require.NotNil(t, w.OrigStrongs)
	assert.Equal(t, 7225, *w.OrigStrongs)
	assert.Equal(t, "H7225G", w.Strongs)
	require.NotNil(t, w.SpanHead)
	assert.False(t, w.SpaceBefore)

	e := rows[1] // an English-only row
	assert.Equal(t, "", e.Language)
	assert.Nil(t, e.SourceSort)
	assert.Nil(t, e.OrigStrongs)
	assert.Nil(t, e.SpanHead)
	assert.Equal(t, "the earth.", e.ChunkText)
	assert.True(t, e.SpaceBefore)
}

func TestParseWordTSV_RejectsBadHeaderAndBadRows(t *testing.T) {
	_, err := parseWordTSV(gz(t, "wrong\theader\n"))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "header")

	_, err = parseWordTSV(gz(t, wordHeaderLine+"\n1\t2\t3\n"))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "14 columns")

	_, err = parseWordTSV(gz(t, wordHeaderLine+"\nx\t100\t\t\t\t\t\t\t\t\t\t\t\t0\n"))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "verse")

	_, err = parseWordTSV([]byte("not gzip"))
	require.Error(t, err)
}

func TestParseLexiconTSV(t *testing.T) {
	rows, err := parseLexiconTSV(gz(t, "tag\tplain\tlanguage\tgloss\nH1254A\tH1254\theb\tto create\nG3439\tG3439\tgrc\tunique\n"))
	require.NoError(t, err)
	assert.Equal(t, []lexiconRow{
		{Tag: "H1254A", Plain: "H1254", Language: "heb", Gloss: "to create"},
		{Tag: "G3439", Plain: "G3439", Language: "grc", Gloss: "unique"},
	}, rows)

	_, err = parseLexiconTSV(gz(t, "tag\tplain\tlanguage\tgloss\nonly\ttwo\n"))
	require.Error(t, err)
}

func TestBuildWordInsert_ArgCountAndNulls(t *testing.T) {
	src := 3
	rows := []wordRow{
		{VerseID: 1, BSBSort: 100, Language: "heb", SourceSort: &src, Strongs: "H1254A", ChunkText: "created", SpaceBefore: true},
		{VerseID: 1, BSBSort: 104, ChunkText: "the earth."},
	}
	sql, args := buildWordInsert(rows)
	assert.Len(t, args, 2*wordColumns)
	assert.Equal(t, 2, strings.Count(sql, "(?,?,?,?,?,?,?,?,?,?,?,?,?,?)"))
	assert.Contains(t, sql, "INSERT INTO bible_word")
	assert.NotContains(t, sql, "ON CONFLICT", "load is truncate+insert, so a duplicate key must fail loudly")
	assert.Nil(t, args[3+wordColumns].(*int), "an English-only row's source_sort binds as a nil pointer (NULL)")
}

func TestReadVerified_RejectsShaMismatchAndReportsMissing(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "f.tsv.gz")
	content := gz(t, "hello")
	require.NoError(t, os.WriteFile(path, content, 0o644))

	got, err := readVerified(path, sum(content))
	require.NoError(t, err)
	assert.Equal(t, content, got)

	_, err = readVerified(path, strings.Repeat("0", 64))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "sha256 mismatch")

	_, err = readVerified(filepath.Join(dir, "missing"), "x")
	require.Error(t, err)
	assert.True(t, os.IsNotExist(unwrapPathError(err)))
}

func TestLoadManifest(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sources.json")
	require.NoError(t, os.WriteFile(path, []byte(`{"version":2,"sources":{},"outputs":{
	  "bible_word":{"asset":"bible-word-v2.tsv.gz","sha256":"aa","rows":5},
	  "bible_lexicon":{"asset":"bible-lexicon-v2.tsv.gz","sha256":"bb","rows":2}}}`), 0o644))
	m, err := loadManifest(path)
	require.NoError(t, err)
	assert.Equal(t, 2, m.Version)
	assert.Equal(t, "bible-word-v2.tsv.gz", m.Outputs.BibleWord.Asset)
	assert.Equal(t, 2, m.Outputs.BibleLexicon.Rows)

	require.NoError(t, os.WriteFile(path, []byte(`{"version":0}`), 0o644))
	_, err = loadManifest(path)
	require.Error(t, err, "a manifest with no outputs is unusable")
}

func TestSeedInterlinear_SkipsCleanlyWhenFilesAreNotDownloaded(t *testing.T) {
	dir := t.TempDir()
	manifestPath := filepath.Join(dir, "sources.json")
	require.NoError(t, os.WriteFile(manifestPath, []byte(`{"version":1,"outputs":{
	  "bible_word":{"asset":"bible-word-v1.tsv.gz","sha256":"aa","rows":1},
	  "bible_lexicon":{"asset":"bible-lexicon-v1.tsv.gz","sha256":"bb","rows":1}}}`), 0o644))
	loaded, err := seedInterlinear(nil, manifestPath, filepath.Join(dir, "interlinear")) // nil DB: must not be touched
	require.NoError(t, err)
	assert.False(t, loaded)
}
