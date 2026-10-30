// Package buildinfo exposes the running binary's version, commit SHA and
// branch as the single source of truth for observability resource
// attributes (e.g. app.build.info) and the GET /version service
// (internal/core/services.BuildInfoService), so both always agree.
//
// Sources, in priority order:
//
//   - Commit: the Commit var (set via -ldflags at build time), then the
//     SVL_DEPLOYMENT_COMMIT_SHA env var (injected automatically by Sevalla),
//     then "unknown".
//   - Version: the Version var (set via -ldflags), then the BUILD_TAG env
//     var, then a short (7-char) lowercase prefix of the resolved commit
//     when known, then "unknown".
//   - Branch: the SVL_DEPLOYMENT_BRANCH env var, then "unknown".
//
// Unlike the frontend static build or the .github/workflows/tag-main.yml CI
// workflow, the backend has no local .git checkout at runtime and Sevalla
// does not inject a committer-date variable — so it cannot compute
// internal/core/domain.ComputeTag's full v<YYYY.MM.DD>-<short7sha> tag on
// its own. BUILD_TAG lets a deploy pipeline supply that exact tag
// explicitly; absent that, the short-SHA fallback at least correlates with
// the full tag tag-main.yml pushed for the same commit, since both embed
// the same short SHA.
//
// Env vars are read lazily, on every call, rather than cached at package
// init, so tests can use t.Setenv to exercise each combination.
package buildinfo

import (
	"os"
	"strings"
)

// Version is injected at build time: -ldflags "-X .../pkg/buildinfo.Version=$TAG".
// Empty when the builder does not pass a version (e.g. under `go test` or
// `go run`), in which case Info falls back to BUILD_TAG, then a short-SHA
// derived from the resolved commit, then "unknown".
var Version = ""

// Commit is injected at build time: -ldflags "-X .../pkg/buildinfo.Commit=$GIT_SHA".
// Empty when the builder (e.g. Sevalla) does not pass GIT_SHA, in which case
// Info falls back to the SVL_DEPLOYMENT_COMMIT_SHA env var, then "unknown".
var Commit = ""

// shortSHALen is the number of characters kept from a commit SHA when
// deriving a fallback version, matching domain.ComputeTag's short7sha.
const shortSHALen = 7

// Info returns the resolved version and commit, applying the fallback chain
// documented on the package. Commit is reported as "unknown" when it could
// not be resolved from either the ldflags var or the environment.
func Info() (string, string) {
	commit := resolveCommit()

	version := Version
	if version == "" {
		version = os.Getenv("BUILD_TAG")
	}
	if version == "" && commit != "unknown" {
		version = shortSHA(commit)
	}
	if version == "" {
		version = "unknown"
	}

	return version, commit
}

// Branch returns the deploy branch reported by Sevalla, or "unknown" when
// SVL_DEPLOYMENT_BRANCH is unset.
func Branch() string {
	if b := os.Getenv("SVL_DEPLOYMENT_BRANCH"); b != "" {
		return b
	}
	return "unknown"
}

func resolveCommit() string {
	if Commit != "" {
		return Commit
	}
	if c := os.Getenv("SVL_DEPLOYMENT_COMMIT_SHA"); c != "" {
		return c
	}
	return "unknown"
}

// shortSHA lowercases sha and truncates it to shortSHALen characters,
// leaving shorter values unchanged, matching domain.ComputeTag's handling
// of the SHA portion of its tag.
func shortSHA(sha string) string {
	s := strings.ToLower(sha)
	if len(s) > shortSHALen {
		s = s[:shortSHALen]
	}
	return s
}
