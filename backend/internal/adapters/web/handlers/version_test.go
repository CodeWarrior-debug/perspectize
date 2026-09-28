package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fakeGetter struct {
	info domain.BuildInfo
}

func (f fakeGetter) Get(ctx context.Context) domain.BuildInfo {
	return f.info
}

func TestVersion_ReportsUnknownFields(t *testing.T) {
	startedAt := time.Date(2024, 1, 9, 12, 0, 0, 0, time.UTC)
	getter := fakeGetter{info: domain.BuildInfo{
		Commit:    "unknown",
		Branch:    "unknown",
		Tag:       "unknown",
		StartedAt: startedAt,
	}}

	req := httptest.NewRequest(http.MethodGet, "/version", nil)
	rec := httptest.NewRecorder()
	Version(getter)(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)

	var body versionResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	assert.Equal(t, "unknown", body.Commit)
	assert.Equal(t, "unknown", body.Branch)
	assert.Equal(t, "unknown", body.Tag)
	assert.True(t, body.StartedAt.Equal(startedAt))
	assert.Nil(t, body.DB.BibleData)
}

func TestVersion_IncludesDBFactsAndBibleData(t *testing.T) {
	loadedAt := time.Date(2024, 1, 9, 12, 0, 0, 0, time.UTC)
	getter := fakeGetter{info: domain.BuildInfo{
		Commit: "abc1234",
		Branch: "main",
		Tag:    "v2024.01.09-abc1234",
		DB: domain.DBFacts{
			MigrationVersion: 27,
			Dirty:            true,
			MigrationFile:    "000027_add_category_wikipedia_url.up.sql",
			BibleData:        &domain.BibleDataVersion{ManifestVersion: 3, LoadedAt: loadedAt},
		},
	}}

	req := httptest.NewRequest(http.MethodGet, "/version", nil)
	rec := httptest.NewRecorder()
	Version(getter)(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "application/json", rec.Header().Get("Content-Type"))

	var body versionResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	assert.Equal(t, "abc1234", body.Commit)
	assert.Equal(t, uint64(27), body.DB.MigrationVersion)
	assert.True(t, body.DB.Dirty)
	assert.Equal(t, "000027_add_category_wikipedia_url.up.sql", body.DB.MigrationFile)
	require.NotNil(t, body.DB.BibleData)
	assert.Equal(t, 3, body.DB.BibleData.ManifestVersion)

	// Never leak DSN/host/Postgres-version details onto the wire.
	raw := rec.Body.String()
	assert.NotContains(t, raw, "postgres://")
	assert.NotContains(t, raw, "sslmode")
}
