// Package tmdb is the TMDB (The Movie Database) v3 adapter for the MovieClient port.
package tmdb

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

const maxCast = 15

var (
	tmdbMovieRe = regexp.MustCompile(`(?i)themoviedb\.org/movie/(\d+)(?:[-/?#]|$)`)
	imdbURLRe   = regexp.MustCompile(`(?i)imdb\.com/title/(tt\d+)(?:[/?#]|$)`)
	imdbIDRe    = regexp.MustCompile(`^tt\d{5,}$`)
)

// ErrInvalidMovieInput is returned when a string is not a recognised TMDB movie or IMDb title reference.
var ErrInvalidMovieInput = errors.New("not a TMDB movie URL or IMDb title")

// ParseMovieInput extracts a TMDB movie id or an IMDb id from a user-supplied
// URL or bare IMDb id. Exactly one of tmdbID / imdbID is set on success.
func ParseMovieInput(raw string) (tmdbID int, imdbID string, err error) {
	s := strings.TrimSpace(raw)
	if m := tmdbMovieRe.FindStringSubmatch(s); m != nil {
		id, convErr := strconv.Atoi(m[1])
		if convErr != nil || id <= 0 {
			return 0, "", ErrInvalidMovieInput
		}
		return id, "", nil
	}
	if m := imdbURLRe.FindStringSubmatch(s); m != nil {
		return 0, strings.ToLower(m[1]), nil
	}
	if imdbIDRe.MatchString(strings.ToLower(s)) {
		return 0, strings.ToLower(s), nil
	}
	return 0, "", ErrInvalidMovieInput
}

// CanonicalMovieURL is the canonical content URL stored for a TMDB movie.
func CanonicalMovieURL(id int) string {
	return fmt.Sprintf("https://www.themoviedb.org/movie/%d", id)
}

type tmdbMovie struct {
	ID                  int             `json:"id"`
	IMDbID              string          `json:"imdb_id"`
	Title               string          `json:"title"`
	Tagline             string          `json:"tagline"`
	Overview            string          `json:"overview"`
	ReleaseDate         string          `json:"release_date"`
	Runtime             int             `json:"runtime"`
	Budget              int64           `json:"budget"`
	Revenue             int64           `json:"revenue"`
	VoteAverage         float64         `json:"vote_average"`
	VoteCount           int             `json:"vote_count"`
	PosterPath          *string         `json:"poster_path"`
	BelongsToCollection json.RawMessage `json:"belongs_to_collection"`
	Genres              []struct {
		Name string `json:"name"`
	} `json:"genres"`
	Credits struct {
		Cast []struct {
			ID        int    `json:"id"`
			Name      string `json:"name"`
			Character string `json:"character"`
			Order     int    `json:"order"`
		} `json:"cast"`
		Crew []struct {
			ID   int    `json:"id"`
			Name string `json:"name"`
			Job  string `json:"job"`
		} `json:"crew"`
	} `json:"credits"`
	ReleaseDates struct {
		Results []struct {
			Country  string `json:"iso_3166_1"`
			Releases []struct {
				Certification string `json:"certification"`
			} `json:"release_dates"`
		} `json:"results"`
	} `json:"release_dates"`
	ExternalIDs struct {
		IMDbID string `json:"imdb_id"`
	} `json:"external_ids"`
	Keywords struct {
		Keywords []struct {
			Name string `json:"name"`
		} `json:"keywords"`
	} `json:"keywords"`
}

type shapedCast struct {
	ID        int    `json:"id"`
	Name      string `json:"name"`
	Character string `json:"character"`
	Order     int    `json:"order"`
}

type shapedDirector struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type shapedMovie struct {
	TMDBID              int              `json:"tmdbId"`
	IMDbID              string           `json:"imdbId"`
	Title               string           `json:"title"`
	Tagline             string           `json:"tagline"`
	Overview            string           `json:"overview"`
	ReleaseDate         string           `json:"releaseDate"`
	Year                int              `json:"year"`
	Genres              []string         `json:"genres"`
	Certification       string           `json:"certification"`
	RuntimeMinutes      int              `json:"runtimeMinutes"`
	RuntimeSecondsKnown bool             `json:"runtimeSecondsKnown"`
	Budget              *int64           `json:"budget"`
	Revenue             *int64           `json:"revenue"`
	VoteAverage         float64          `json:"voteAverage"`
	VoteCount           int              `json:"voteCount"`
	PosterPath          *string          `json:"posterPath"`
	Keywords            []string         `json:"keywords"`
	Cast                []shapedCast     `json:"cast"`
	Directors           []shapedDirector `json:"directors"`
	Collection          json.RawMessage  `json:"collection"`
}

// ShapeMovie trims a raw TMDB /movie/{id}?append_to_response=... payload to the
// shape stored with the content row. Pure function, no network.
func ShapeMovie(raw []byte) (*services.MovieMetadata, error) {
	var m tmdbMovie
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, fmt.Errorf("failed to parse TMDB response: %w", err)
	}

	imdbID := m.IMDbID
	if imdbID == "" {
		imdbID = m.ExternalIDs.IMDbID
	}

	year := 0
	if len(m.ReleaseDate) >= 4 {
		if y, err := strconv.Atoi(m.ReleaseDate[:4]); err == nil {
			year = y
		}
	}

	genres := make([]string, 0, len(m.Genres))
	for _, g := range m.Genres {
		genres = append(genres, g.Name)
	}
	keywords := make([]string, 0, len(m.Keywords.Keywords))
	for _, k := range m.Keywords.Keywords {
		keywords = append(keywords, k.Name)
	}

	sort.SliceStable(m.Credits.Cast, func(i, j int) bool {
		return m.Credits.Cast[i].Order < m.Credits.Cast[j].Order
	})
	cast := make([]shapedCast, 0, maxCast)
	for _, c := range m.Credits.Cast {
		if len(cast) == maxCast {
			break
		}
		cast = append(cast, shapedCast{ID: c.ID, Name: c.Name, Character: c.Character, Order: c.Order})
	}

	directors := make([]shapedDirector, 0, 2)
	for _, c := range m.Credits.Crew {
		if c.Job == "Director" {
			directors = append(directors, shapedDirector{ID: c.ID, Name: c.Name})
		}
	}

	shaped := shapedMovie{
		TMDBID:              m.ID,
		IMDbID:              imdbID,
		Title:               m.Title,
		Tagline:             m.Tagline,
		Overview:            m.Overview,
		ReleaseDate:         m.ReleaseDate,
		Year:                year,
		Genres:              genres,
		Certification:       usCertification(m),
		RuntimeMinutes:      m.Runtime,
		RuntimeSecondsKnown: false,
		Budget:              nonZero(m.Budget),
		Revenue:             nonZero(m.Revenue),
		VoteAverage:         m.VoteAverage,
		VoteCount:           m.VoteCount,
		PosterPath:          m.PosterPath,
		Keywords:            keywords,
		Cast:                cast,
		Directors:           directors,
		Collection:          m.BelongsToCollection,
	}
	if len(shaped.Collection) == 0 {
		shaped.Collection = json.RawMessage("null")
	}

	out, err := json.Marshal(shaped)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal shaped movie: %w", err)
	}

	meta := &services.MovieMetadata{TMDBID: m.ID, Title: m.Title, Response: out}
	if m.Runtime > 0 {
		secs := m.Runtime * 60
		meta.RuntimeSeconds = &secs
	}
	return meta, nil
}

// nonZero maps TMDB's 0 ("unknown") to nil so it serialises as JSON null.
func nonZero(v int64) *int64 {
	if v == 0 {
		return nil
	}
	return &v
}

// usCertification returns the first non-empty US certification, or "".
func usCertification(m tmdbMovie) string {
	for _, r := range m.ReleaseDates.Results {
		if r.Country != "US" {
			continue
		}
		for _, rel := range r.Releases {
			if rel.Certification != "" {
				return rel.Certification
			}
		}
	}
	return ""
}
