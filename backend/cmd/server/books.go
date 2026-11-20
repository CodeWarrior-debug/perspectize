package main

import (
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/openlibrary"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
)

// bookServiceOptions wires the Open Library adapter into ContentService. One
// client backs search, the cached trending feed, ISBN resolution and the work
// and edition records. Open Library needs no API key, so this is unconditional
// (no config gate).
func bookServiceOptions() []services.ContentServiceOption {
	client := openlibrary.NewClient()
	return []services.ContentServiceOption{
		services.WithBookSearch(client),
		services.WithBookTrending(openlibrary.NewTrendingCache(client, openlibrary.DefaultTrendingTTL)),
		services.WithBookISBN(client),
		services.WithBookWork(client),
	}
}
