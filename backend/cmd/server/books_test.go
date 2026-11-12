package main

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
)

// TestBookServiceOptions_ConfigureBookClients proves the Open Library clients
// are wired into ContentService. A configured client validates its input before
// any network call, so an unconfigured service (ErrBookClientUnavailable) is
// distinguishable from a configured one (ErrInvalidInput) without I/O.
func TestBookServiceOptions_ConfigureBookClients(t *testing.T) {
	svc := services.NewContentService(nil, nil, nil, bookServiceOptions()...)

	_, err := svc.SearchBooks(context.Background(), "", 1)
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
	assert.NotErrorIs(t, err, services.ErrBookClientUnavailable)

	_, err = svc.TrendingBooks(context.Background(), domain.TrendingWindow("BAD"), 1)
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
	assert.NotErrorIs(t, err, services.ErrBookClientUnavailable)
}

// TestBookServiceOptions_CountsEveryBookClient guards the option count: search,
// trending, ISBN and work. No network-free call reaches the work client, so a
// dropped option would otherwise go unnoticed.
func TestBookServiceOptions_CountsEveryBookClient(t *testing.T) {
	assert.Len(t, bookServiceOptions(), 4)
}
