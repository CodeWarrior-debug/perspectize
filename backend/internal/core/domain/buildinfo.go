package domain

import (
	"fmt"
	"strings"
	"time"
)

// BuildInfo captures the running backend process's build and deploy facts,
// served unauthenticated at GET /version for support/debugging (the zzzv
// console hotkey on the frontend fetches it).
type BuildInfo struct {
	Commit    string
	Branch    string
	Tag       string
	StartedAt time.Time
	DB        DBFacts
}

// DBFacts captures the connected database's schema state.
type DBFacts struct {
	MigrationVersion uint64
	Dirty            bool
	// MigrationFile is the filename of the up-migration matching
	// MigrationVersion, resolved from the backend's own /migrations
	// directory. Empty if no matching file is found.
	MigrationFile string
	// BibleData is nil when the bible_data_version table doesn't exist or
	// has no row yet (seed-bible hasn't been run in this environment).
	BibleData *BibleDataVersion
}

// BibleDataVersion mirrors the single row cmd/seed-bible writes to
// bible_data_version, when present.
type BibleDataVersion struct {
	ManifestVersion int
	LoadedAt        time.Time
}

// ComputeTag derives the deterministic, app-wide version tag from a commit's
// committer date and SHA: v<YYYY.MM.DD>-<short7sha>, with the date taken in
// UTC. The CI tagging workflow, this function, and the frontend's
// lib/utils/buildTag.ts computeTag() must all produce the identical string
// for the same commit — see testdata/version-tag-fixture.json, which is
// shared between this package's test and the frontend's.
func ComputeTag(committerDate time.Time, sha string) string {
	short := strings.ToLower(sha)
	if len(short) > 7 {
		short = short[:7]
	}
	return fmt.Sprintf("v%s-%s", committerDate.UTC().Format("2006.01.02"), short)
}
