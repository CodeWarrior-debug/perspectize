package services

import (
	"context"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// WikidataClient defines the contract for Wikidata API interactions.
// Only wbsearchentities and wbgetentities (sitelinks only) are supported —
// no SPARQL, no full entity fetch.
type WikidataClient interface {
	// Search queries the Wikidata Entity Search API (wbsearchentities)
	Search(ctx context.Context, query string, language string, limit int) ([]domain.WikidataSearchResult, error)

	// GetWikipediaURL resolves a Wikidata QID to its English Wikipedia article
	// URL via wbgetentities sitelinks. Returns "" (no error) when the entity
	// has no enwiki sitelink.
	GetWikipediaURL(ctx context.Context, qid string) (string, error)
}
