package main

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const snapshotPath = "../../data/music-genres/apple-genres-34.compact.json"
const migrationPath = "../../migrations/000033_add_music_genres.up.sql"

func loadRoots(t *testing.T) []node {
	t.Helper()
	raw, err := os.ReadFile(snapshotPath)
	require.NoError(t, err)
	var roots []node
	require.NoError(t, json.Unmarshal(raw, &roots))
	return roots
}

func countNodes(ns []node) int {
	n := 0
	for _, x := range ns {
		n += 1 + countNodes(x.Kids)
	}
	return n
}

func byID(rows []Row) map[int]Row {
	m := make(map[int]Row, len(rows))
	for _, r := range rows {
		m[r.ID] = r
	}
	return m
}

func TestReshape_OptionC(t *testing.T) {
	roots := loadRoots(t)
	rows, err := Reshape(roots)
	require.NoError(t, err)

	// Folk (1289) and Hörspiele (100107) are dropped; everything else stays.
	assert.Equal(t, countNodes(roots)-2, len(rows))
	assert.Equal(t, 523, len(rows))

	m := byID(rows)
	assert.Equal(t, "Regional & Cultural", m[19].Name)
	assert.Equal(t, "Worldwide", m[19].AppleName)
	assert.Nil(t, m[19].ParentID)
	assert.NotContains(t, m, 1289)
	assert.NotContains(t, m, 100107)

	for _, id := range []int{1203, 1197, 1122, 1232, 100024, 1262, 1243, 1299, 1300, 100084, 50000121, 50000064, 50000068, 50000066, 27, 28, 30} {
		require.Contains(t, m, id)
		require.NotNil(t, m[id].ParentID, "id %d should move under 19", id)
		assert.Equal(t, 19, *m[id].ParentID, "id %d", id)
	}
	// Folk's children are lifted under 19.
	assert.Equal(t, 19, *m[100103].ParentID)
	assert.Equal(t, 19, *m[100104].ParentID)
	// A moved genre keeps its own children.
	assert.Equal(t, 1203, *m[42].ParentID) // Amapiano under African
	// Untouched roots stay roots.
	assert.Nil(t, m[21].ParentID) // Rock
}

func TestReshape_ParentsComeBeforeChildren(t *testing.T) {
	rows, err := Reshape(loadRoots(t))
	require.NoError(t, err)
	seen := map[int]bool{}
	for _, r := range rows {
		if r.ParentID != nil {
			assert.True(t, seen[*r.ParentID], "row %d before its parent %d", r.ID, *r.ParentID)
		}
		seen[r.ID] = true
	}
}

func TestReshape_FailsWhenAListedRootIsMissing(t *testing.T) {
	_, err := Reshape([]node{{Name: "Worldwide", ID: 19}, {Name: "Rock", ID: 21}})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "African")
}

func TestRenderUp_EscapesQuotesAndNulls(t *testing.T) {
	p := 4
	sql := RenderUp([]Row{{ID: 4, Name: "Children's Music", AppleName: "Children's Music"}, {ID: 1014, Name: "Lullabies", AppleName: "Lullabies", ParentID: &p}})
	assert.Contains(t, sql, "(4, 'Children''s Music', 'Children''s Music', NULL),")
	assert.Contains(t, sql, "(1014, 'Lullabies', 'Lullabies', 4)\nON CONFLICT (id) DO NOTHING;")
}

func TestCommittedMigrationMatchesGenerator(t *testing.T) {
	rows, err := Reshape(loadRoots(t))
	require.NoError(t, err)
	committed, err := os.ReadFile(migrationPath)
	require.NoError(t, err, "run: go -C backend run ./cmd/gen-music-genres")
	assert.Equal(t, RenderUp(rows), string(committed), "000033 is generated; re-run the generator instead of editing it")
	assert.True(t, strings.HasPrefix(string(committed), "-- GENERATED"))
}
