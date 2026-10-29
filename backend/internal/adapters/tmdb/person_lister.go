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
// tagline, genres, budget and box office, plus (appended to the same call)
// the top-billed cast, the user review count and the keywords.
type PersonLister struct {
	c   *Client
	now func() time.Time
}

var _ services.ImportSourceLister = (*PersonLister)(nil)

// NewPersonLister builds a lister on the client's token and HTTP client.
func NewPersonLister(c *Client) *PersonLister {
	return &PersonLister{c: c, now: time.Now}
}

// Resolve accepts a TMDB person id, a themoviedb.org/person/… URL, or a name.
// A name is looked up with /search/person and the most popular match wins;
// the resolved name goes on the source, so whoever approves it sees who it is.
func (l *PersonLister) Resolve(ctx context.Context, ref string) (*services.ResolvedImportSource, error) {
	id, ok := parsePersonRef(ref)
	if !ok {
		if strings.Contains(ref, "/") {
			return nil, fmt.Errorf("%w: not a TMDB person id, URL or name", domain.ErrInvalidInput)
		}
		return l.searchPerson(ctx, strings.TrimSpace(ref))
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
	return resolvedPerson(id, p.Name), nil
}

func resolvedPerson(id int, name string) *services.ResolvedImportSource {
	return &services.ResolvedImportSource{
		ID:    strconv.Itoa(id),
		Title: name,
		URL:   fmt.Sprintf("https://www.themoviedb.org/person/%d", id),
	}
}

// searchPerson resolves a name to TMDB's top match (results come most popular first).
func (l *PersonLister) searchPerson(ctx context.Context, name string) (*services.ResolvedImportSource, error) {
	body, err := l.c.get(ctx, "/search/person", url.Values{"query": {name}, "include_adult": {"false"}, "language": {"en-US"}})
	if err != nil {
		return nil, err
	}
	var res struct {
		Results []struct {
			ID   int    `json:"id"`
			Name string `json:"name"`
		} `json:"results"`
	}
	if err := json.Unmarshal(body, &res); err != nil {
		return nil, fmt.Errorf("%w: failed to parse person search", ErrTMDBAPI)
	}
	if len(res.Results) == 0 {
		return nil, fmt.Errorf("%w: no TMDB person matches %q", domain.ErrNotFound, name)
	}
	return resolvedPerson(res.Results[0].ID, res.Results[0].Name), nil
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
	Runtime          int     `json:"runtime"`
	Tagline          string  `json:"tagline"`
	OriginalLanguage string  `json:"original_language"`
	Popularity       float64 `json:"popularity"`
	Budget           int64   `json:"budget"`
	Revenue          int64   `json:"revenue"`
	Genres           []struct {
		Name string `json:"name"`
	} `json:"genres"`
	// Credits, Reviews and Keywords come from append_to_response, in the same request.
	Credits struct {
		Cast []struct {
			Name  string `json:"name"`
			Order int    `json:"order"`
		} `json:"cast"`
	} `json:"credits"`
	Reviews *struct {
		TotalResults int `json:"total_results"`
	} `json:"reviews"`
	Keywords struct {
		Keywords []struct {
			Name string `json:"name"`
		} `json:"keywords"`
	} `json:"keywords"`
}

// movieAppend is everything appended to each /movie/{id} call.
const movieAppend = "credits,reviews,keywords"

// topCastSize is how many billed names a sheet row shows.
const topCastSize = 3

// topCast returns the first topCastSize names by billing order.
func (e movieExtras) topCast() []string {
	cast := append(e.Credits.Cast[:0:0], e.Credits.Cast...)
	sort.SliceStable(cast, func(i, j int) bool { return cast[i].Order < cast[j].Order })
	names := make([]string, 0, topCastSize)
	for _, c := range cast {
		if len(names) == topCastSize {
			break
		}
		if c.Name != "" {
			names = append(names, c.Name)
		}
	}
	return names
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
			body, err := l.c.get(ctx, "/movie/"+strconv.Itoa(films[i].credit.ID), url.Values{"language": {"en-US"}, "append_to_response": {movieAppend}})
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
	item.Genres = genres
	item.TopCast = extra.topCast()
	// TMDB reports 0 for an unknown budget or box office; that is unknown, not $0.
	if extra.Popularity > 0 {
		p := extra.Popularity
		item.Popularity = &p
	}
	if extra.Budget > 0 {
		b := extra.Budget
		item.Budget = &b
	}
	if extra.Revenue > 0 {
		r := extra.Revenue
		item.Revenue = &r
	}
	if extra.Reviews != nil {
		n := extra.Reviews.TotalResults
		item.ReviewCount = &n
	}
	keywords := make([]string, 0, len(extra.Keywords.Keywords))
	for _, k := range extra.Keywords.Keywords {
		keywords = append(keywords, k.Name)
	}
	return &domain.ImportItemWithDetails{
		Item: item,
		Details: domain.ImportItemDetails{
			Description: c.Overview,
			Tags:        keywords,
			Genres:      genres,
			People:      f.roles,
			Language:    extra.OriginalLanguage,
		},
	}
}
