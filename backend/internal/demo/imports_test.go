package demo

import (
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestImportsFixtureDecodesAndIsConsistent(t *testing.T) {
	fx, err := Imports()
	require.NoError(t, err)
	_, err = time.Parse(time.RFC3339, fx.FetchedAt)
	require.NoError(t, err)
	require.Len(t, fx.Imports, 3)

	seen := map[string]bool{}
	movies, videos := 0, 0
	for _, job := range fx.Imports {
		require.NotEmpty(t, job.Name)
		for _, src := range job.Sources {
			require.Contains(t, []string{"youtube_channel", "tmdb_person"}, src.Type)
			require.NotEmpty(t, src.Items, src.Title)
			for _, it := range src.Items {
				key := src.Type + ":" + it.ExternalID
				assert.False(t, seen[key], "duplicate fixture row %s", key)
				seen[key] = true
				assert.NotEmpty(t, it.Title)
				if src.Type == "tmdb_person" {
					movies++
					assert.Equal(t, "movie", it.Kind)
				} else {
					videos++
					assert.Contains(t, []string{"video", "short", "live"}, it.Kind)
				}
			}
		}
	}
	assert.Equal(t, 14, movies)
	assert.Equal(t, 107, videos)
}

func TestImportFixtureRows(t *testing.T) {
	fx, err := Imports()
	require.NoError(t, err)
	fetched := time.Date(2026, 10, 27, 0, 0, 0, 0, time.UTC)

	var gty, nolan ImportFixtureSource
	for _, job := range fx.Imports {
		for _, src := range job.Sources {
			switch src.Title {
			case "Grace to You":
				gty = src
			case "Christopher Nolan":
				nolan = src
			}
		}
	}
	rows := gty.Rows(fetched)
	require.Len(t, rows, len(gty.Items))
	for _, r := range rows {
		assert.Equal(t, domain.ContentTypeYouTubeVideo, r.Item.DestinationType)
		assert.Equal(t, WatchURL(r.Item.ExternalID), r.Item.CanonicalURL)
		if r.Item.Summary != nil {
			assert.NotContains(t, *r.Item.Summary, "click here", "channel boilerplate is never the summary")
		}
	}

	movieRows := nolan.Rows(fetched)
	require.NotEmpty(t, movieRows)
	assert.Equal(t, domain.ContentTypeMovie, movieRows[0].Item.DestinationType)
	assert.Equal(t, MovieURL(movieRows[0].Item.ExternalID), movieRows[0].Item.CanonicalURL)
	assert.Equal(t, domain.ImportItemKindMovie, movieRows[0].Item.Kind)
	assert.Equal(t, []domain.ImportPerson{{Name: "Christopher Nolan", Role: "Director"}}, movieRows[0].Details.People)
}

func TestImportLookups(t *testing.T) {
	v, ok := ImportVideoByID("YbowWQwQt-M")
	require.True(t, ok)
	assert.Equal(t, "Freedom: Casey Diaz", v.Title)
	assert.Equal(t, "Grace to You", v.ChannelTitle)
	assert.Positive(t, v.Seconds)

	film, ok := ImportFilmByID("27205")
	require.True(t, ok)
	assert.Equal(t, "Inception", film.Title)

	_, ok = ImportVideoByID("nope")
	assert.False(t, ok)
	_, ok = ImportFilmByID("27205x")
	assert.False(t, ok)
}
