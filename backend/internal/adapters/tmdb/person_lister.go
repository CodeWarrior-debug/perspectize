package tmdb

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// personBatchSize is how many films are enriched and emitted per batch.
const personBatchSize = 20

// personEnrichWorkers bounds concurrent /movie/{id} lookups (TMDB allows ~50 req/s).
const personEnrichWorkers = 4

// maxPersonItems caps one filmography; prolific actors have a few hundred credits.
const maxPersonItems = 500

// posterBase is the TMDB image size the sheet's thumbnail uses.
const posterBase = "https://image.tmdb.org/t/p/w185"

// personURLRe is anchored to the whole ref so another host can't pass as TMDB
// (e.g. https://evil.example/themoviedb.org/person/525).
var personURLRe = regexp.MustCompile(`^(?:https?://)?(?:www\.)?themoviedb\.org/person/(\d+)(?:[-/?#].*)?$`)

// PersonLister lists a TMDB person's filmography as import candidates: one
// call for the credits, then one /movie/{id} call per film for runtime,
// tagline and genres (the credits list has neither).
type PersonLister struct {
	c   *Client
	now func() time.Time
}

var _ services.ImportSourceLister = (*PersonLister)(nil)

// NewPersonLister builds a lister on the client's token and HTTP client.
func NewPersonLister(c *Client) *PersonLister {
	return &PersonLister{c: c, now: time.Now}
}

// Resolve accepts a TMDB person id or a themoviedb.org/person/… URL.
func (l *PersonLister) Resolve(ctx context.Context, ref string) (*services.ResolvedImportSource, error) {
	id, ok := parsePersonRef(ref)
	if !ok {
		return nil, fmt.Errorf("%w: not a TMDB person id or URL", domain.ErrInvalidInput)
	}
	body, err := l.c.get(ctx, "/person/"+strconv.Itoa(id), nil)
	if err != nil {
		return nil, err
	}
	var p struct {
		ID   int    `json:"id"`
		Name string `json:"name"`
	}
	if err := json.Unmarshal(body, &p); err != nil {
		return nil, fmt.Errorf("%w: failed to parse person", ErrTMDBAPI)
	}
	return &services.ResolvedImportSource{
		ID:    strconv.Itoa(id),
		Title: p.Name,
		URL:   fmt.Sprintf("https://www.themoviedb.org/person/%d", id),
	}, nil
}

func parsePersonRef(ref string) (int, bool) {
	ref = strings.TrimSpace(ref)
	if m := personURLRe.FindStringSubmatch(ref); m != nil {
		ref = m[1]
	}
	id, err := strconv.Atoi(ref)
	return id, err == nil && id > 0
}

// personCredit is one film from /person/{id}/movie_credits (cast or crew).
type personCredit struct {
	ID          int     `json:"id"`
	Title       string  `json:"title"`
	ReleaseDate string  `json:"release_date"`
	Overview    string  `json:"overview"`
	VoteAverage float64 `json:"vote_average"`
	VoteCount   int     `json:"vote_count"`
	PosterPath  string  `json:"poster_path"`
	Adult       bool    `json:"adult"`
	Character   string  `json:"character"`
	Job         string  `json:"job"`
}

// movieExtras is the slice of /movie/{id} the credits list lacks.
type movieExtras struct {
	Runtime          int    `json:"runtime"`
	Tagline          string `json:"tagline"`
	OriginalLanguage string `json:"original_language"`
	Genres           []struct {
		Name string `json:"name"`
	} `json:"genres"`
}

// List emits the person's films newest first, in batches of personBatchSize.
// role DIRECTOR keeps crew credits with job "Director"; CAST keeps acting
// credits; nil keeps both. Adult titles and duplicate films are dropped.
func (l *PersonLister) List(ctx context.Context, source services.ResolvedImportSource, role *domain.ImportPersonRole, emit services.ImportBatchFunc) error {
	body, err := l.c.get(ctx, "/person/"+url.PathEscape(source.ID)+"/movie_credits", url.Values{"language": {"en-US"}})
	if err != nil {
		return err
	}
	var credits struct {
		Cast []personCredit `json:"cast"`
		Crew []personCredit `json:"crew"`
	}
	if err := json.Unmarshal(body, &credits); err != nil {
		return fmt.Errorf("%w: failed to parse movie credits", ErrTMDBAPI)
	}

	films := pickCredits(credits.Cast, credits.Crew, role)
	if len(films) > maxPersonItems {
		films = films[:maxPersonItems]
	}

	fetched := l.now().UTC()
	for start := 0; start < len(films); start += personBatchSize {
		end := min(start+personBatchSize, len(films))
		chunk := films[start:end]
		extras := l.enrich(ctx, chunk)
		if err := ctx.Err(); err != nil {
			return err
		}

		descs := make([]string, len(chunk))
		for i, f := range chunk {
			descs[i] = f.credit.Overview
		}
		summaries := domain.SummarizeDescriptions(descs)
		batch := make([]*domain.ImportItemWithDetails, len(chunk))
		for i, f := range chunk {
			batch[i] = creditToItem(f, extras[i], start+i, summaries[i], fetched)
		}
		if err := emit(batch); err != nil {
			return err
		}
	}
	return nil
}

// film is one deduplicated credit with every role the person had on it.
type film struct {
	credit personCredit
	roles  []domain.ImportPerson
}

func pickCredits(cast, crew []personCredit, role *domain.ImportPersonRole) []film {
	byID := make(map[int]*film)
	var order []int
	add := func(c personCredit, person domain.ImportPerson) {
		if c.Adult || c.ID == 0 {
			return
		}
		f, ok := byID[c.ID]
		if !ok {
			f = &film{credit: c}
			byID[c.ID] = f
			order = append(order, c.ID)
		}
		f.roles = append(f.roles, person)
	}
	if role == nil || *role == domain.ImportPersonRoleCast {
		for _, c := range cast {
			add(c, domain.ImportPerson{Name: c.Character, Role: "Cast"})
		}
	}
	if role == nil || *role == domain.ImportPersonRoleDirector {
		for _, c := range crew {
			if c.Job == "Director" {
				add(c, domain.ImportPerson{Role: "Director"})
			}
		}
	}
	out := make([]film, len(order))
	for i, id := range order {
		out[i] = *byID[id]
	}
	// Newest first; undated (announced) films last, then by title for a stable order.
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i].credit.ReleaseDate, out[j].credit.ReleaseDate
		if (a == "") != (b == "") {
			return b == ""
		}
		if a != b {
			return a > b
		}
		return out[i].credit.Title < out[j].credit.Title
	})
	return out
}

// enrich fetches /movie/{id} for each film with bounded concurrency. A failed
// lookup leaves that film's extras empty rather than failing the batch: the
// row still shows everything the credits list had.
func (l *PersonLister) enrich(ctx context.Context, films []film) []movieExtras {
	out := make([]movieExtras, len(films))
	sem := make(chan struct{}, personEnrichWorkers)
	var wg sync.WaitGroup
	for i := range films {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			select {
			case sem <- struct{}{}:
			case <-ctx.Done():
				return
			}
			defer func() { <-sem }()
			body, err := l.c.get(ctx, "/movie/"+strconv.Itoa(films[i].credit.ID), url.Values{"language": {"en-US"}})
			if err != nil {
				return
			}
			_ = json.Unmarshal(body, &out[i])
		}(i)
	}
	wg.Wait()
	return out
}

func creditToItem(f film, extra movieExtras, position int, summary string, fetched time.Time) *domain.ImportItemWithDetails {
	c := f.credit
	item := domain.ImportItem{
		ExternalID:      strconv.Itoa(c.ID),
		DestinationType: domain.ContentTypeMovie,
		CanonicalURL:    CanonicalMovieURL(c.ID),
		Kind:            domain.ImportItemKindMovie,
		Title:           c.Title,
		Position:        position,
		StatsFetchedAt:  fetched,
	}
	if extra.Tagline != "" {
		tagline := extra.Tagline
		item.Summary = &tagline
	} else if summary != "" {
		item.Summary = &summary
	}
	if t, err := time.Parse("2006-01-02", c.ReleaseDate); err == nil {
		item.PublishedAt = &t
	}
	if extra.Runtime > 0 {
		secs := extra.Runtime * 60
		item.DurationSeconds = &secs
	}
	// TMDB reports 0 for a film nobody has rated; that is "no rating", not a score of 0.
	if c.VoteCount > 0 {
		rating := c.VoteAverage
		count := c.VoteCount
		source := "TMDB"
		item.Rating, item.RatingCount, item.RatingSource = &rating, &count, &source
	}
	if c.PosterPath != "" {
		poster := posterBase + c.PosterPath
		item.ThumbnailURL = &poster
	}
	genres := make([]string, len(extra.Genres))
	for i, g := range extra.Genres {
		genres[i] = g.Name
	}
	return &domain.ImportItemWithDetails{
		Item: item,
		Details: domain.ImportItemDetails{
			Description: c.Overview,
			Genres:      genres,
			People:      f.roles,
			Language:    extra.OriginalLanguage,
		},
	}
}
