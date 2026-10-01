package domain

// HermeneuticApproach is a fixed, database-stored choice of interpretive lens
// (literal, allegorical, typological, ...) that a user may pick when giving a
// perspective on BIBLE_PASSAGE content. See Perspective.HermeneuticApproachID.
type HermeneuticApproach struct {
	ID           int
	Code         string
	Name         string
	Description  *string
	DisplayOrder int
}
