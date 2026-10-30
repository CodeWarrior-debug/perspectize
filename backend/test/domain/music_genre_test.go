package domain_test

import (
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func ip(i int) *int { return &i }

var testGenres = []domain.MusicGenre{
	{ID: 21, Name: "Rock", AppleName: "Rock"},
	{ID: 18, Name: "Hip-Hop/Rap", AppleName: "Hip-Hop/Rap"},
	{ID: 5, Name: "Classical", AppleName: "Classical"},
	{ID: 9, Name: "Opera", AppleName: "Opera", ParentID: ip(5)},
	{ID: 1028, Name: "Opera", AppleName: "Opera", ParentID: ip(5)},
	{ID: 50000167, Name: "Stage Works", AppleName: "Stage Works", ParentID: ip(5)},
	{ID: 50000180, Name: "Opera", AppleName: "Opera", ParentID: ip(50000167)},
	{ID: 19, Name: "Regional & Cultural", AppleName: "Worldwide"},
	{ID: 1188, Name: "Polka", AppleName: "Polka", ParentID: ip(19)},
	{ID: 15, Name: "R&B/Soul", AppleName: "R&B/Soul"},
}

func TestMatchGenre(t *testing.T) {
	cases := map[string]int{
		"rock":      21,
		"  ROCK ":   21,
		"Hip Hop":   18,
		"hip-hop":   18,
		"rap":       18,
		"opera":     9, // shallowest, then lowest id
		"Worldwide": 19,
		"polka":     1188,
		"rnb":       15,
	}
	for in, want := range cases {
		got := domain.MatchGenre(in, testGenres)
		require.NotNil(t, got, in)
		assert.Equal(t, want, got.ID, in)
	}
	assert.Nil(t, domain.MatchGenre("", testGenres))
	assert.Nil(t, domain.MatchGenre("vaporwave", testGenres), "no match means no genre (ADR 0006)")
}
