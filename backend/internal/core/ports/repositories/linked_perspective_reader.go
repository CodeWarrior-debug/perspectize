package repositories

import "context"

// LinkedPerspectiveReader answers which of the given perspective ids viewerID
// may read, in one batched lookup. The service uses it to check the
// perspectives a write links to (primary and related perspectives) without
// revealing whether an unreadable id exists. It is a separate port from
// PerspectiveRepository so that adding it does not change every repository
// fake.
type LinkedPerspectiveReader interface {
	// VisibleIDs returns the subset of ids viewerID may read. A readable row is
	// public or owned by viewerID, and, when it is attached to content, that
	// content is visible to viewerID too. Ids with no row are absent. An empty
	// ids slice issues no query.
	VisibleIDs(ctx context.Context, ids []int, viewerID int) ([]int, error)
}
