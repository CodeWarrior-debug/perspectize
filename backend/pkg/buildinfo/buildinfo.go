// Package buildinfo exposes the running binary's version and commit SHA as the
// single source of truth for observability resource attributes (e.g. app.build.info)
// and any other place the backend needs to report what it is.
package buildinfo

// Version is bumped by release-please on every backend release.
var Version = "0.1.0" // x-release-please-version

// Commit is injected at build time: -ldflags "-X .../pkg/buildinfo.Commit=$GIT_SHA".
// Empty when the builder (e.g. Sevalla) does not pass GIT_SHA.
var Commit = ""

// Info returns the current version and commit. Commit is reported as "unknown"
// when it was not injected via -ldflags (e.g. under `go test` or `go run`).
func Info() (string, string) {
	c := Commit
	if c == "" {
		c = "unknown"
	}
	return Version, c
}
