package services_test

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

func TestCreateFromWebsite_EmptyFetchedDomainFallsBackToTheHost(t *testing.T) {
	client := &mockWebPageClient{fetchFn: func(_ context.Context, _ string) (domain.WebPageMeta, error) {
		meta := okWebPage("https://example.com/", "Example")
		meta.Domain = ""
		return meta, nil
	}}

	got, err := newWebPageService(&mockContentRepository{}, client).CreateFromWebsite(context.Background(), "https://example.com/", 1)
	require.NoError(t, err)

	var stored struct {
		Domain string `json:"domain"`
	}
	require.NoError(t, json.Unmarshal(got.Response, &stored))
	assert.Equal(t, "example.com", stored.Domain)
}

func TestCreateFromWebsite_KeepsTheFetchedDomainWhenThereIsOne(t *testing.T) {
	client := &mockWebPageClient{fetchFn: func(_ context.Context, _ string) (domain.WebPageMeta, error) {
		meta := okWebPage("https://example.com/", "Example")
		meta.Domain = "canonical.example.org"
		return meta, nil
	}}

	got, err := newWebPageService(&mockContentRepository{}, client).CreateFromWebsite(context.Background(), "https://example.com/", 1)
	require.NoError(t, err)

	var stored struct {
		Domain string `json:"domain"`
	}
	require.NoError(t, json.Unmarshal(got.Response, &stored))
	assert.Equal(t, "canonical.example.org", stored.Domain)
}

// A failed duplicate lookup must stop the create. Reading it as "not found"
// would fetch the site and insert a second row over the first.
func TestCreateFromWebsite_FailedLookupStopsBeforeFetchingOrSaving(t *testing.T) {
	client := okSite(t)
	inserts := 0
	repo := &mockContentRepository{
		getByURLFn: func(_ context.Context, _ string) (*domain.Content, error) { return nil, errors.New("db down") },
		getOrCreateByURLFn: func(_ context.Context, c *domain.Content, _ bool) (*domain.Content, bool, error) {
			inserts++
			return c, false, nil
		},
	}

	_, err := newWebPageService(repo, client).CreateFromWebsite(context.Background(), "https://example.com/", 1)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to check existing content")
	assert.NotErrorIs(t, err, domain.ErrNotFound)
	assert.Zero(t, client.calls, "no fetch after a failed lookup")
	assert.Zero(t, inserts, "nothing is saved after a failed lookup")
}
