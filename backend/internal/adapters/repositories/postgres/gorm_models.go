package postgres

import (
	"encoding/json"
	"time"
)

// UserModel is the GORM persistence model for users table
type UserModel struct {
	ID          int             `gorm:"primaryKey;autoIncrement"`
	ClerkUserID *string         `gorm:"column:clerk_user_id;type:text;uniqueIndex"`
	Username    string          `gorm:"not null"`
	Email       *string         `gorm:"uniqueIndex"`
	Role        string          `gorm:"not null;default:default"`
	Active      bool            `gorm:"not null;default:true"`
	Onboarding  json.RawMessage `gorm:"type:jsonb;column:onboarding;default:'{\"version\":0,\"displayNextSession\":true,\"completedAt\":null}'"`
	CreatedAt   time.Time       `gorm:"autoCreateTime"`
	UpdatedAt   time.Time       `gorm:"autoUpdateTime"`
}

// TableName returns the table name for UserModel
func (UserModel) TableName() string {
	return "users"
}

// CategoryModel is the GORM persistence model for categories table
type CategoryModel struct {
	ID          int       `gorm:"primaryKey;autoIncrement"`
	WikidataQID string    `gorm:"column:wikidata_qid;uniqueIndex;not null"`
	Label       string    `gorm:"not null"`
	Description string    `gorm:"column:description;default:''"`
	EntityType  string    `gorm:"column:entity_type;default:''"`
	CreatedAt   time.Time `gorm:"autoCreateTime"`
	UpdatedAt   time.Time `gorm:"autoUpdateTime"`
}

// TableName returns the table name for CategoryModel
func (CategoryModel) TableName() string {
	return "categories"
}

// ContentModel is the GORM persistence model for content table
type ContentModel struct {
	ID                int             `gorm:"primaryKey;autoIncrement"`
	Name              string          `gorm:"not null"`
	URL               *string         `gorm:"uniqueIndex"`
	ContentType       string          `gorm:"column:content_type;not null"`
	AddedByUserID     int             `gorm:"column:added_by_user_id;not null"`
	Length            *int            `gorm:""`
	LengthUnits       *string         `gorm:""`
	Response          json.RawMessage `gorm:"type:jsonb"`
	PrimaryCategoryID *int            `gorm:"column:primary_category_id"`

	// Dummy fields for gorm-cursor-paginator sort key validation.
	// These are NOT database columns — SQLRepr provides the actual SQL.
	// The gorm:"-" tag tells GORM to ignore them for queries/migrations.
	ViewCount    int64  `gorm:"-"`
	LikeCount    int64  `gorm:"-"`
	PublishedAt  string `gorm:"-"`
	ChannelTitle string `gorm:"-"` // Dummy field for gorm-cursor-paginator sort key validation

	CreatedAt time.Time `gorm:"autoCreateTime"`
	UpdatedAt time.Time `gorm:"autoUpdateTime"`
}

// TableName returns the table name for ContentModel
func (ContentModel) TableName() string {
	return "content"
}

// PerspectiveModel is the GORM persistence model for perspectives table
type PerspectiveModel struct {
	ID                    int             `gorm:"primaryKey;autoIncrement"`
	UserID                int             `gorm:"not null"`
	ContentID             *int            `gorm:""`
	Like                  *string         `gorm:"column:like"`
	Quality               *int            `gorm:""`
	Agreement             *int            `gorm:""`
	Importance            *int            `gorm:""`
	Confidence            *int            `gorm:""`
	Privacy               *string         `gorm:""`
	Parts                 Int64Array      `gorm:"type:integer[]"`
	Category              *string         `gorm:""`
	Labels                StringArray     `gorm:"type:text[]"`
	Description           *string         `gorm:""`
	ReviewStatus          *string         `gorm:""`
	CategorizedRatings    JSONBArray      `gorm:"type:jsonb[];column:categorized_ratings"`
	Feelings              JSONBArray      `gorm:"type:jsonb[];column:feelings"`
	PrimaryPerspectiveID  *int            `gorm:"column:primary_perspective_id"`
	RelatedPerspectiveIDs Int64Array      `gorm:"type:integer[];column:related_perspective_ids"`
	CustomFields          json.RawMessage `gorm:"type:jsonb;column:custom_fields;default:'{}'"`
	Review                *string         `gorm:"column:review"`
	CreatedAt             time.Time       `gorm:"autoCreateTime"`
	UpdatedAt             time.Time       `gorm:"autoUpdateTime"`
}

// TableName returns the table name for PerspectiveModel
func (PerspectiveModel) TableName() string {
	return "perspectives"
}
