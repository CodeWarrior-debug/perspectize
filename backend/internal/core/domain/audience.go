package domain

// Audience is the one definition of who may read and write a user-owned row,
// and which rows count in aggregates. Each row type (perspective, user todo,
// content) carries a Subject built from its privacy and owner columns; the
// repositories render the same rule as SQL (postgres/audience_sql.go), and the
// services and resolvers call the methods below. A row type that needs a
// different rule changes here and in that SQL renderer, nowhere else.
//
// Viewer IDs use 0 for an anonymous caller. An owner ID of 0 never matches, so
// an anonymous viewer never owns a row.
type Audience struct {
	Privacy Privacy
	OwnerID int
}

// ContentAudience is the audience of a content row. An unset privacy is PUBLIC,
// the default the mappers write.
func ContentAudience(privacy Privacy, ownerID int) Audience {
	if privacy == "" {
		privacy = PrivacyPublic
	}
	return Audience{Privacy: privacy, OwnerID: ownerID}
}

// ReadableBy reports whether viewerID may read the row. A PUBLIC row is readable
// by everyone. Any other privacy, including an unknown value, is readable only
// by its owner, so it is hidden from non-owners rather than shown. A caller
// whose rows default an unset privacy to PUBLIC must normalize it first.
func (a Audience) ReadableBy(viewerID int) bool {
	if a.Privacy == PrivacyPublic {
		return true
	}
	return viewerID > 0 && viewerID == a.OwnerID
}

// WritableBy reports whether actorID may change or delete the row. Writes are
// owner-only, whatever the privacy.
func (a Audience) WritableBy(actorID int) bool {
	return actorID > 0 && actorID == a.OwnerID
}

// CountsInAggregates reports whether the row contributes to aggregate numbers
// (counts, averages, stats). Aggregates are public-only: a private row never
// counts, and no aggregate is attributable to its owner.
func (a Audience) CountsInAggregates() bool {
	return a.Privacy == PrivacyPublic
}

// NonOwnerWriteError answers a write refused to a non-owner. A row the non-owner
// may read is refused with ErrForbidden, which reveals nothing new. A row they
// may not read is answered with ErrNotFound, so its id is not confirmed.
func NonOwnerWriteError(privacy Privacy) error {
	if (Audience{Privacy: privacy}).ReadableBy(0) {
		return ErrForbidden
	}
	return ErrNotFound
}
