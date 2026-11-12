package services

import (
	"context"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// WikidataClient defines the contract for Wikidata API interactions.
type WikidataClient interface {
	// Search queries the Wikidata Entity Search API (wbsearchentities)
	Search(ctx context.Context, query string, language string, limit int) ([]domain.WikidataSearchResult, error)

	// GetWikipediaURL looks up the English Wikipedia sitelink for a Wikidata
	// QID (wbgetentities, sitefilter=enwiki, props=sitelinks/urls). Returns ""
	// (not an error) if the item has no English Wikipedia article — that's a
	// normal, expected case, not a failure.
	GetWikipediaURL(ctx context.Context, qid string) (string, error)
}
