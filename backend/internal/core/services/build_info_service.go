package services

import (
	"context"
	"log/slog"
	"os"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
)

// BuildInfoService assembles the facts served at GET /version: deploy
// metadata read once at startup, plus live database facts fetched per call
// through the BuildInfoRepository port.
type BuildInfoService struct {
	repo repositories.BuildInfoRepository

	commit    string
	branch    string
	tag       string
	startedAt time.Time
}

// NewBuildInfoService reads deploy metadata from the environment once, at
// wiring time.
//
// Sevalla injects SVL_DEPLOYMENT_COMMIT_SHA and SVL_DEPLOYMENT_BRANCH into
// the backend Application (confirmed in https://docs.sevalla.com/applications/environment-variables),
// but no committer-date variable — so unlike the frontend static build,
// which has a local .git checkout and can derive its tag with
// domain.ComputeTag directly, the backend has no way to compute the
// deterministic v<date>-<sha> tag from the SHA alone. BUILD_TAG lets a
// deploy pipeline supply the tag explicitly (e.g. once Sevalla deploy
// webhooks exist to look it up); until then it reports "unknown".
func NewBuildInfoService(repo repositories.BuildInfoRepository) *BuildInfoService {
	return &BuildInfoService{
		repo:      repo,
		commit:    envOrUnknown("SVL_DEPLOYMENT_COMMIT_SHA"),
		branch:    envOrUnknown("SVL_DEPLOYMENT_BRANCH"),
		tag:       envOrUnknown("BUILD_TAG"),
		startedAt: time.Now().UTC(),
	}
}

// Get returns the current build info. DB facts are fetched live (with the
// caller-supplied ctx expected to carry a short timeout); a failure to read
// them is logged and leaves DB as its zero value rather than failing the
// whole response.
func (s *BuildInfoService) Get(ctx context.Context) domain.BuildInfo {
	info := domain.BuildInfo{
		Commit:    s.commit,
		Branch:    s.branch,
		Tag:       s.tag,
		StartedAt: s.startedAt,
	}
	facts, err := s.repo.GetDBFacts(ctx)
	if err != nil {
		slog.Warn("build info: failed to read database facts", "error", err)
		return info
	}
	info.DB = facts
	return info
}

func envOrUnknown(key string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return "unknown"
}
