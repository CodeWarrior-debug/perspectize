package services

import (
	"context"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// BookSearchResult is one book (Open Library work) from a search or trending
// call, trimmed to what the Discover page renders. Optional fields are nil
// when Open Library has no value.
type BookSearchResult struct {
	// WorkKey is the Open Library work id with the "/works/" prefix stripped
	// (e.g. "OL23166W").
	WorkKey    string
	Title      string
	AuthorName []string
	// AuthorKey is Open Library's author id per author (e.g. "OL25788A"),
	// parallel to AuthorName. It is nil when the search did not return
	// author_key; consumers must not assume equal length.
	AuthorKey []string
	// CoverID is Open Library's cover image id; nil when there is no cover.
	CoverID *int
	// FirstPublishYear is nil when Open Library has no value.
	FirstPublishYear *int
	// PageCountMedian is nil when Open Library has no value.
	PageCountMedian *int
	Subjects        []string
	// RatingsAverage is nil when there are no ratings.
	RatingsAverage *float64
	// RatingsCount is nil when there are no ratings.
	RatingsCount *int
	// EditionCount is nil when Open Library has no value.
	EditionCount *int
}

// BookSearchPage is one page of Open Library work search/trending results.
type BookSearchPage struct {
	Items        []BookSearchResult
	Page         int
	TotalPages   int
	TotalResults int
}

// BookSearchClient searches books by title/author (Open Library search.json).
type BookSearchClient interface {
	// SearchBooks returns one page of work matches.
	SearchBooks(ctx context.Context, query string, page int) (*BookSearchPage, error)
}

// BookTrendingClient fetches Open Library's trending book lists
// (/trending/{daily|weekly}.json). It reuses domain.TrendingWindow (DAY/WEEK)
// rather than a new enum.
type BookTrendingClient interface {
	// TrendingBooks returns one page of trending books for the window.
	TrendingBooks(ctx context.Context, window domain.TrendingWindow, page int) (*BookSearchPage, error)
}

// BookRelatedWork is a related Open Library work named in a work description
// (for example a volume split or a combined omnibus). URL is the canonical
// work link, https://openlibrary.org/works/<id>.
type BookRelatedWork struct {
	Title string
	URL   string
}

// BookWork is the description data from Open Library's canonical work record
// (/works/{id}.json). It carries no author, rating or page data; those come
// from search.json.
type BookWork struct {
	// Description is plain text with \n line endings. Empty when the record has
	// none. Any trailing "Contains:"/"Also contained in:" block is removed and
	// returned as RelatedWorks instead.
	Description string
	// RelatedWorks is never nil; it is empty when there are none.
	RelatedWorks []BookRelatedWork
}

// BookWorkClient reads Open Library's canonical work and edition records.
type BookWorkClient interface {
	// FetchWork returns the description data for a bare work id (e.g.
	// "OL23166W"). Returns domain.ErrInvalidInput for an id that does not match
	// ^OL\d+W$ (no request is made) and domain.ErrNotFound on a 404.
	FetchWork(ctx context.Context, workKey string) (*BookWork, error)
	// ResolveEdition returns the bare work id (e.g. "OL23166W") an edition
	// record (bare id such as "OL22640535M") belongs to. Returns
	// domain.ErrInvalidInput for an id that does not match ^OL\d+M$ and
	// domain.ErrNotFound on a 404.
	ResolveEdition(ctx context.Context, editionKey string) (workKey string, err error)
}

// BookISBNClient resolves an ISBN to the Open Library work it belongs to
// (/isbn/{isbn}.json, which 302s to a specific edition record).
type BookISBNClient interface {
	// ResolveISBN returns the bare work key (e.g. "OL23166W", no "/works/"
	// prefix) for the edition the ISBN identifies. Returns domain.ErrNotFound
	// when Open Library has no record for the ISBN.
	ResolveISBN(ctx context.Context, isbn string) (workKey string, err error)
}
