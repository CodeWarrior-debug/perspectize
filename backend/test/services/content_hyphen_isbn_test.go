package services_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
)

// A hyphenated ISBN reaches the service unchanged: the service drops the hyphens
// before it classifies or looks up the ISBN, so the resolvers need no step of
// their own.
func TestHyphenatedISBNIsNormalisedByTheService(t *testing.T) {
	isbnSeen := []string{}
	bi := &mockBookISBNClient{resolveFn: func(ctx context.Context, isbn string) (string, error) {
		isbnSeen = append(isbnSeen, isbn)
		return "OL23166W", nil
	}}
	bs := singleResultSearch(t, "OL23166W", eastOfEden())

	svc := services.NewContentService(&mockContentRepository{}, nil, nil, services.WithBookSearch(bs), services.WithBookISBN(bi))
	got, err := svc.ResolveBookISBN(context.Background(), "978-0-434-74002-4")
	require.NoError(t, err)
	assert.Equal(t, "OL23166W", got.WorkKey)
	assert.Equal(t, []string{"9780434740024"}, isbnSeen)

	var saved *domain.Content
	repo := &mockContentRepository{
		getOrCreateByURLFn: func(ctx context.Context, c *domain.Content, refresh bool) (*domain.Content, bool, error) {
			saved = c
			return c, false, nil
		},
	}
	svc = services.NewContentService(repo, nil, nil, services.WithBookSearch(bs), services.WithBookISBN(bi))
	_, err = svc.CreateFromBook(context.Background(), "978-0-434-74002-4", 1)
	require.NoError(t, err)
	require.NotNil(t, saved)
	require.NotNil(t, saved.URL)
	assert.Equal(t, "https://openlibrary.org/works/OL23166W", *saved.URL)
}
