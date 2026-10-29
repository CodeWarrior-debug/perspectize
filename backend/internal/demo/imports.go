package demo

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// importsJSON is real sample data for the import staging sheet: YouTube rows
// from public channels and a filmography from Wikidata/Wikipedia (see its
// "note" field). cmd/seed-demo stages it, and the offline YouTube and movie
// clients serve its metadata so importing a row in demo mode creates content
// with the row's real details.
//
//go:embed imports.json
var importsJSON []byte

// ImportFixture is the decoded imports.json.
type ImportFixture struct {
	FetchedAt string             `json:"fetchedAt"`
	Note      string             `json:"note"`
	Imports   []ImportFixtureJob `json:"imports"`
}

// ImportFixtureJob is one named import.
type ImportFixtureJob struct {
	Name    string                `json:"name"`
	Sources []ImportFixtureSource `json:"sources"`
}

// ImportFixtureSource is one source with its staged rows.
type ImportFixtureSource struct {
	Type  string              `json:"type"` // youtube_channel | tmdb_person
	Ref   string              `json:"ref"`
	Role  string              `json:"role,omitempty"`
	Title string              `json:"title"`
	URL   string              `json:"url"`
	Items []ImportFixtureItem `json:"items"`
}

// ImportFixtureItem is one candidate row as the source API would describe it.
type ImportFixtureItem struct {
	ExternalID      string   `json:"externalId"`
	Kind            string   `json:"kind"` // video | short | live | movie
	Title           string   `json:"title"`
	Description     string   `json:"description"`
	PublishedAt     *string  `json:"publishedAt"`
	DurationSeconds *int     `json:"durationSeconds"`
	Views           *int64   `json:"views"`
	Likes           *int64   `json:"likes"`
	Comments        *int64   `json:"comments"`
	Tags            []string `json:"tags"`
	Language        *string  `json:"language"`
	HasCaptions     *bool    `json:"hasCaptions"`
	Thumbnail       *string  `json:"thumbnail"`
	Rating          *float64 `json:"rating"`
	RatingCount     *int     `json:"ratingCount"`
	RatingSource    *string  `json:"ratingSource"`
	Genres          []string `json:"genres"`
	TopCast         []string `json:"topCast"`
	Revenue         *int64   `json:"revenue"`
	Budget          *int64   `json:"budget"`
	People          []struct {
		Name string `json:"name"`
		Role string `json:"role"`
	} `json:"people"`
	Links    []string `json:"links"`
	Position int      `json:"position"`
}

var (
	importsOnce   sync.Once
	importsParsed ImportFixture
	importsErr    error
	importsByID   map[string]importRef
)

type importRef struct {
	source ImportFixtureSource
	item   ImportFixtureItem
}

// Imports returns the decoded import fixture.
func Imports() (ImportFixture, error) {
	importsOnce.Do(func() {
		if err := json.Unmarshal(importsJSON, &importsParsed); err != nil {
			importsErr = fmt.Errorf("decode demo imports.json: %w", err)
			return
		}
		importsByID = map[string]importRef{}
		for _, job := range importsParsed.Imports {
			for _, src := range job.Sources {
				for _, it := range src.Items {
					importsByID[src.Type+":"+it.ExternalID] = importRef{source: src, item: it}
				}
			}
		}
	})
	return importsParsed, importsErr
}

// ImportVideoByID returns a staged YouTube row as a fixture Video, so the
// offline YouTube client can serve its real metadata.
func ImportVideoByID(id string) (Video, bool) {
	if _, err := Imports(); err != nil {
		return Video{}, false
	}
	ref, ok := importsByID["youtube_channel:"+id]
	if !ok {
		return Video{}, false
	}
	it := ref.item
	v := Video{ID: id, Title: it.Title, Description: it.Description, ChannelTitle: ref.source.Title, Tags: it.Tags}
	if it.PublishedAt != nil {
		v.PublishedAt = *it.PublishedAt
	}
	if it.DurationSeconds != nil {
		v.Seconds = *it.DurationSeconds
		v.DurationISO = fmt.Sprintf("PT%dS", *it.DurationSeconds)
	}
	count := func(n *int64) string {
		if n == nil {
			return ""
		}
		return fmt.Sprint(*n)
	}
	v.Views, v.Likes, v.Comments = count(it.Views), count(it.Likes), count(it.Comments)
	return v, true
}

// ImportFilmByID returns a staged movie row by TMDB id.
func ImportFilmByID(tmdbID string) (ImportFixtureItem, bool) {
	if _, err := Imports(); err != nil {
		return ImportFixtureItem{}, false
	}
	ref, ok := importsByID["tmdb_person:"+tmdbID]
	return ref.item, ok
}

// MovieURL is the canonical content URL for a TMDB movie id. It must match
// tmdb.CanonicalMovieURL (asserted in the tmdb package's tests); it is
// repeated here because the tmdb adapter imports this package.
func MovieURL(tmdbID string) string { return "https://www.themoviedb.org/movie/" + tmdbID }

// Rows converts a fixture source's items into staged candidates, computing
// summaries, chapters and link domains with the same domain helpers the live
// listers use. JobID and SourceID are left for the caller.
func (s ImportFixtureSource) Rows(fetched time.Time) []*domain.ImportItemWithDetails {
	descs := make([]string, len(s.Items))
	for i, it := range s.Items {
		descs[i] = it.Description
	}
	summaries := domain.SummarizeDescriptions(descs)

	out := make([]*domain.ImportItemWithDetails, len(s.Items))
	for i, it := range s.Items {
		dest, url := domain.ContentTypeYouTubeVideo, WatchURL(it.ExternalID)
		if s.Type == "tmdb_person" {
			dest, url = domain.ContentTypeMovie, MovieURL(it.ExternalID)
		}
		row := domain.ImportItem{
			ExternalID:      it.ExternalID,
			DestinationType: dest,
			CanonicalURL:    url,
			Kind:            domain.ImportItemKind(strings.ToUpper(it.Kind)),
			Title:           it.Title,
			DurationSeconds: it.DurationSeconds,
			ViewCount:       it.Views,
			LikeCount:       it.Likes,
			CommentCount:    it.Comments,
			Rating:          it.Rating,
			RatingCount:     it.RatingCount,
			RatingSource:    it.RatingSource,
			HasCaptions:     it.HasCaptions,
			Genres:          it.Genres,
			TopCast:         it.TopCast,
			Revenue:         it.Revenue,
			Budget:          it.Budget,
			ThumbnailURL:    it.Thumbnail,
			Position:        it.Position,
			StatsFetchedAt:  fetched,
		}
		if summaries[i] != "" {
			summary := summaries[i]
			row.Summary = &summary
		}
		if it.PublishedAt != nil {
			if t, err := time.Parse(time.RFC3339, *it.PublishedAt); err == nil {
				row.PublishedAt = &t
			}
		}
		chapters := domain.ParseChapters(it.Description)
		row.ChapterCount = len(chapters)
		links := it.Links
		if len(links) == 0 {
			links = domain.LinkDomains(it.Description)
		}
		people := make([]domain.ImportPerson, len(it.People))
		for j, p := range it.People {
			people[j] = domain.ImportPerson{Name: p.Name, Role: p.Role}
		}
		details := domain.ImportItemDetails{
			Description: it.Description,
			Tags:        it.Tags,
			Chapters:    chapters,
			Links:       links,
			People:      people,
			Genres:      it.Genres,
		}
		if it.Language != nil {
			details.Language = *it.Language
		}
		out[i] = &domain.ImportItemWithDetails{Item: row, Details: details}
	}
	return out
}
