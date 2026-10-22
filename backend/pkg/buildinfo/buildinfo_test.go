package buildinfo_test

import (
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/pkg/buildinfo"
	"github.com/stretchr/testify/assert"
)

// resetVars restores the ldflags-style package vars after a test mutates
// them, since they are package-level state shared across the test binary.
func resetVars(t *testing.T) {
	t.Helper()
	origVersion := buildinfo.Version
	origCommit := buildinfo.Commit
	t.Cleanup(func() {
		buildinfo.Version = origVersion
		buildinfo.Commit = origCommit
	})
}

func TestInfo(t *testing.T) {
	tests := []struct {
		name        string
		version     string
		commit      string
		envCommit   string
		envTag      string
		wantVersion string
		wantCommit  string
	}{
		{
			name:        "nothing set reports unknown",
			wantVersion: "unknown",
			wantCommit:  "unknown",
		},
		{
			name:        "ldflags version and commit take priority",
			version:     "v2026.09.28-abc1234",
			commit:      "abc1234def",
			envCommit:   "envcommitsha",
			envTag:      "v2000.01.01-zzzzzzz",
			wantVersion: "v2026.09.28-abc1234",
			wantCommit:  "abc1234def",
		},
		{
			name:        "env commit used when ldflags commit unset",
			envCommit:   "envcommitsha",
			wantVersion: "envcomm", // short7 fallback of the resolved commit
			wantCommit:  "envcommitsha",
		},
		{
			name:        "BUILD_TAG used when ldflags version unset",
			envCommit:   "envcommitsha",
			envTag:      "v2024.01.09-abc1234",
			wantVersion: "v2024.01.09-abc1234",
			wantCommit:  "envcommitsha",
		},
		{
			name:        "short-SHA fallback lowercases an uppercase SHA",
			envCommit:   "ABCDEF1234",
			wantVersion: "abcdef1",
			wantCommit:  "ABCDEF1234",
		},
		{
			name:        "short-SHA fallback keeps a SHA shorter than 7 chars whole",
			envCommit:   "ab12",
			wantVersion: "ab12",
			wantCommit:  "ab12",
		},
		{
			name:        "no commit resolvable leaves version unknown too",
			envTag:      "",
			wantVersion: "unknown",
			wantCommit:  "unknown",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resetVars(t)
			buildinfo.Version = tt.version
			buildinfo.Commit = tt.commit
			t.Setenv("SVL_DEPLOYMENT_COMMIT_SHA", tt.envCommit)
			t.Setenv("BUILD_TAG", tt.envTag)

			version, commit := buildinfo.Info()

			assert.Equal(t, tt.wantVersion, version)
			assert.Equal(t, tt.wantCommit, commit)
		})
	}
}

func TestBranch(t *testing.T) {
	tests := []struct {
		name       string
		envBranch  string
		wantBranch string
	}{
		{name: "unset reports unknown", wantBranch: "unknown"},
		{name: "env branch reported verbatim", envBranch: "main", wantBranch: "main"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("SVL_DEPLOYMENT_BRANCH", tt.envBranch)
			assert.Equal(t, tt.wantBranch, buildinfo.Branch())
		})
	}
}
