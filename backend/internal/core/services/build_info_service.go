package services

import (
	"context"
	"log/slog"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	"github.com/CodeWarrior-debug/perspectize/backend/pkg/buildinfo"
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

// NewBuildInfoService reads deploy metadata from pkg/buildinfo once, at
// wiring time, so this service and the OpenTelemetry resource/app.build.info
// gauge (pkg/telemetry) always report the same commit and version for a
// given process — see pkg/buildinfo's package doc for the full fallback
// chain (ldflags vars, then Sevalla's SVL_DEPLOYMENT_* env vars / BUILD_TAG,
// then "unknown").
//
// Tag is the resolved version: BUILD_TAG (or an ldflags-injected version)
// when set, otherwise a short7sha fallback derived from the resolved commit,
// otherwise "unknown". Sevalla has no committer-date variable, so unlike the
// frontend static build — which has a local .git checkout and can derive
// its tag with domain.ComputeTag directly — the backend can't compute the
// full deterministic v<date>-<sha> tag from the SHA alone; the short-SHA
// fallback at least correlates with the tag .github/workflows/tag-main.yml
// pushed for the same commit.
func NewBuildInfoService(repo repositories.BuildInfoRepository) *BuildInfoService {
	version, commit := buildinfo.Info()
	return &BuildInfoService{
		repo:      repo,
		commit:    commit,
		branch:    buildinfo.Branch(),
		tag:       version,
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
