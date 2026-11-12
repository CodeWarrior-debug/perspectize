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

// BookISBNClient resolves an ISBN to the Open Library work it belongs to
// (/isbn/{isbn}.json, which 302s to a specific edition record).
type BookISBNClient interface {
	// ResolveISBN returns the bare work key (e.g. "OL23166W", no "/works/"
	// prefix) for the edition the ISBN identifies. Returns domain.ErrNotFound
	// when Open Library has no record for the ISBN.
	ResolveISBN(ctx context.Context, isbn string) (workKey string, err error)
}
