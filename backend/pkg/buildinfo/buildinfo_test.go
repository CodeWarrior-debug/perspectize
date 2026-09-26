package buildinfo_test

import (
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/pkg/buildinfo"
	"github.com/stretchr/testify/assert"
)

func TestInfo_DefaultsAreNonEmpty(t *testing.T) {
	v, c := buildinfo.Info()
	assert.NotEmpty(t, v)
	assert.Equal(t, "unknown", c) // no ldflags in `go test`
}

func TestInfo_ReturnsInjectedCommit(t *testing.T) {
	original := buildinfo.Commit
	t.Cleanup(func() {
		buildinfo.Commit = original
	})

	buildinfo.Commit = "abc123"

	_, c := buildinfo.Info()
	assert.Equal(t, "abc123", c)
}
