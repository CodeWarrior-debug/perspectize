package services_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fakeBuildInfoRepo struct {
	facts domain.DBFacts
	err   error
}

func (f *fakeBuildInfoRepo) GetDBFacts(ctx context.Context) (domain.DBFacts, error) {
	return f.facts, f.err
}

func TestBuildInfoService_ReadsSVLEnvVars(t *testing.T) {
	t.Setenv("SVL_DEPLOYMENT_COMMIT_SHA", "abc1234")
	t.Setenv("SVL_DEPLOYMENT_BRANCH", "main")
	t.Setenv("BUILD_TAG", "v2024.01.09-abc1234")

	svc := services.NewBuildInfoService(&fakeBuildInfoRepo{})
	info := svc.Get(context.Background())

	assert.Equal(t, "abc1234", info.Commit)
	assert.Equal(t, "main", info.Branch)
	assert.Equal(t, "v2024.01.09-abc1234", info.Tag)
}

func TestBuildInfoService_ReportsUnknownWhenSVLEnvVarsUnset(t *testing.T) {
	t.Setenv("SVL_DEPLOYMENT_COMMIT_SHA", "")
	t.Setenv("SVL_DEPLOYMENT_BRANCH", "")
	t.Setenv("BUILD_TAG", "")

	svc := services.NewBuildInfoService(&fakeBuildInfoRepo{})
	info := svc.Get(context.Background())

	assert.Equal(t, "unknown", info.Commit)
	assert.Equal(t, "unknown", info.Branch)
	assert.Equal(t, "unknown", info.Tag)
}

func TestBuildInfoService_Get_IncludesDBFacts(t *testing.T) {
	loadedAt := time.Date(2024, 1, 9, 12, 0, 0, 0, time.UTC)
	repo := &fakeBuildInfoRepo{
		facts: domain.DBFacts{
			MigrationVersion: 27,
			Dirty:            false,
			MigrationFile:    "000027_add_category_wikipedia_url.up.sql",
			BibleData:        &domain.BibleDataVersion{ManifestVersion: 3, LoadedAt: loadedAt},
		},
	}
	svc := services.NewBuildInfoService(repo)
	info := svc.Get(context.Background())

	require.Equal(t, uint64(27), info.DB.MigrationVersion)
	assert.False(t, info.DB.Dirty)
	assert.Equal(t, "000027_add_category_wikipedia_url.up.sql", info.DB.MigrationFile)
	require.NotNil(t, info.DB.BibleData)
	assert.Equal(t, 3, info.DB.BibleData.ManifestVersion)
	assert.True(t, info.DB.BibleData.LoadedAt.Equal(loadedAt))
}

func TestBuildInfoService_Get_DBErrorLeavesZeroDBFacts(t *testing.T) {
	repo := &fakeBuildInfoRepo{err: errors.New("connection refused")}
	svc := services.NewBuildInfoService(repo)
	info := svc.Get(context.Background())

	assert.Equal(t, domain.DBFacts{}, info.DB)
}
