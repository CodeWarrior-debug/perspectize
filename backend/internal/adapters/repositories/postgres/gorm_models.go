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
	ID           int       `gorm:"primaryKey;autoIncrement"`
	WikidataQID  string    `gorm:"column:wikidata_qid;uniqueIndex;not null"`
	Label        string    `gorm:"not null"`
	Description  string    `gorm:"column:description;default:''"`
	EntityType   string    `gorm:"column:entity_type;default:''"`
	WikipediaURL string    `gorm:"column:wikipedia_url;default:''"`
	CreatedAt    time.Time `gorm:"autoCreateTime"`
	UpdatedAt    time.Time `gorm:"autoUpdateTime"`
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
	LengthDisplay     json.RawMessage `gorm:"type:jsonb"`
	Response          json.RawMessage `gorm:"type:jsonb"`
	PrimaryCategoryID *int            `gorm:"column:primary_category_id"`
	VerseStartID      *int            `gorm:"column:verse_start_id"`
	VerseEndID        *int            `gorm:"column:verse_end_id"`
	DisplayTitle      *string         `gorm:"column:display_title"`

	// TotalCount is read-only and only present when List selects it: the
	// filtered total, computed by a scalar subquery in the same statement as
	// the page (one round trip instead of a separate COUNT(*)).
	TotalCount *int64 `gorm:"column:total_count;->;-:migration"`

	// Computed sort keys for gorm-cursor-paginator. The paginator builds a cursor by
	// reading these struct fields off the last row, so List selects each active sort
	// expression AS the column named here (see computedSortColumns) and GORM scans it
	// back. They are pointers so a NULL expression stays nil (encoded as JSON null, and
	// decoded back to the rule's NULLReplacement) instead of being encoded as a bogus
	// 0 -- which made page 2 repeat page 1 (C-02). Read-only and never migrated: they
	// are not real columns.
	ViewCount    *int64   `gorm:"column:view_count;->;-:migration"`
	LikeCount    *int64   `gorm:"column:like_count;->;-:migration"`
	PercentLiked *float64 `gorm:"column:percent_liked;->;-:migration"`
	PublishedAt  *string  `gorm:"column:published_at_sort;->;-:migration"`
	BoxOffice    *int64   `gorm:"column:box_office;->;-:migration"`
	VsBudget     *float64 `gorm:"column:vs_budget;->;-:migration"`
	AgeRating    *int64   `gorm:"column:age_rating;->;-:migration"`
	ReleaseDate  *string  `gorm:"column:release_date_sort;->;-:migration"`
	TmdbScore    *float64 `gorm:"column:tmdb_score;->;-:migration"`
	ChannelTitle *string  `gorm:"column:channel_title_sort;->;-:migration"`

	// AddedBy is the lowercased adder username, read-only and populated only when List
	// selects it for the ADDED_BY sort. Unlike the dummies above it must carry a real
	// value: the paginator builds the next cursor from this field, so an always-empty one
	// would make every "next page" a repeat of the first.
	AddedBy string `gorm:"column:added_by;->;-:migration"`

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

// MessageThreadModel is the GORM model for message_threads.
type MessageThreadModel struct {
	ID            int64     `gorm:"primaryKey;autoIncrement"`
	Title         *string   `gorm:"column:title"`
	CreatedBy     int64     `gorm:"column:created_by;not null"`
	LastMessageAt time.Time `gorm:"column:last_message_at"`
	CreatedAt     time.Time `gorm:"column:created_at;autoCreateTime"`
}

func (MessageThreadModel) TableName() string { return "message_threads" }

// ThreadParticipantModel is the GORM model for thread_participants.
type ThreadParticipantModel struct {
	ThreadID    int64      `gorm:"column:thread_id;primaryKey"`
	UserID      int64      `gorm:"column:user_id;primaryKey"`
	Role        string     `gorm:"column:role;not null;default:MEMBER"`
	LastReadSeq int64      `gorm:"column:last_read_seq;not null;default:0"`
	Muted       bool       `gorm:"column:muted;not null;default:false"`
	JoinedAt    time.Time  `gorm:"column:joined_at;autoCreateTime"`
	LeftAt      *time.Time `gorm:"column:left_at"`
}

func (ThreadParticipantModel) TableName() string { return "thread_participants" }

// MessageModel is the GORM model for messages.
type MessageModel struct {
	ID          int64      `gorm:"primaryKey;autoIncrement"`
	ThreadID    int64      `gorm:"column:thread_id;not null"`
	SenderID    int64      `gorm:"column:sender_id;not null"`
	Seq         int64      `gorm:"column:seq"` // assigned by DB trigger; do not set on insert
	Body        string     `gorm:"column:body;not null"`
	ClientNonce string     `gorm:"column:client_nonce;not null"`
	CreatedAt   time.Time  `gorm:"column:created_at;autoCreateTime"`
	EditedAt    *time.Time `gorm:"column:edited_at"`
	DeletedAt   *time.Time `gorm:"column:deleted_at"`
}

func (MessageModel) TableName() string { return "messages" }

// TodoActionModel is the GORM persistence model for todo_actions. UserID nil is
// a global preset; a set UserID is an action the user entered.
type TodoActionModel struct {
	ID              int       `gorm:"primaryKey;autoIncrement"`
	Key             string    `gorm:"column:key;not null"`
	Label           string    `gorm:"column:label;not null"`
	Description     string    `gorm:"column:description;not null"`
	TypicalSequence *int      `gorm:"column:typical_sequence"`
	UserID          *int      `gorm:"column:user_id"`
	CreatedAt       time.Time `gorm:"autoCreateTime"`
	UpdatedAt       time.Time `gorm:"autoUpdateTime"`
}

// TableName returns the table name for TodoActionModel
func (TodoActionModel) TableName() string { return "todo_actions" }

// UserTodoListModel is the GORM persistence model for user_todo_lists.
type UserTodoListModel struct {
	ID          int       `gorm:"primaryKey;autoIncrement"`
	UserID      int       `gorm:"column:user_id;not null"`
	Name        string    `gorm:"column:name;not null"`
	Description *string   `gorm:"column:description"`
	Privacy     string    `gorm:"column:privacy;not null"`
	CreatedAt   time.Time `gorm:"autoCreateTime"`
	UpdatedAt   time.Time `gorm:"autoUpdateTime"`
}

// TableName returns the table name for UserTodoListModel
func (UserTodoListModel) TableName() string { return "user_todo_lists" }

// UserTodoModel is the GORM persistence model for user_todos. Dates are
// date-only columns, so they are typed `date` and carried as *time.Time.
type UserTodoModel struct {
	ID              int        `gorm:"primaryKey;autoIncrement"`
	UserID          int        `gorm:"column:user_id;not null"`
	ContentID       *int       `gorm:"column:content_id"`
	Name            *string    `gorm:"column:name"`
	ActionID        int        `gorm:"column:action_id;not null"`
	Priority        *int       `gorm:"column:priority"`
	Status          string     `gorm:"column:status;not null"`
	PercentComplete int        `gorm:"column:percent_complete;not null"`
	StartDate       *time.Time `gorm:"column:start_date;type:date"`
	EndDate         *time.Time `gorm:"column:end_date;type:date"`
	DueDate         *time.Time `gorm:"column:due_date;type:date"`
	Comments        *string    `gorm:"column:comments"`
	Privacy         string     `gorm:"column:privacy;not null"`
	ListID          *int       `gorm:"column:list_id"`
	ListPosition    *int       `gorm:"column:list_position"`
	CreatedAt       time.Time  `gorm:"autoCreateTime"`
	UpdatedAt       time.Time  `gorm:"autoUpdateTime"`
}

// TableName returns the table name for UserTodoModel
func (UserTodoModel) TableName() string { return "user_todos" }

// ImportJobModel is the GORM persistence model for the import_jobs table
type ImportJobModel struct {
	ID            int        `gorm:"primaryKey;autoIncrement"`
	UserID        int        `gorm:"column:user_id;not null"`
	Name          string     `gorm:"column:name;not null"`
	RequestStatus string     `gorm:"column:request_status;not null"`
	ReviewNote    *string    `gorm:"column:review_note"`
	ReviewedAt    *time.Time `gorm:"column:reviewed_at"`
	CreatedAt     time.Time  `gorm:"autoCreateTime"`
	UpdatedAt     time.Time  `gorm:"autoUpdateTime"`
}

// TableName returns the table name for ImportJobModel
func (ImportJobModel) TableName() string { return "import_jobs" }

// ImportSourceModel is the GORM persistence model for the import_job_sources table
type ImportSourceModel struct {
	ID              int        `gorm:"primaryKey;autoIncrement"`
	JobID           int        `gorm:"column:job_id;not null"`
	SourceType      string     `gorm:"column:source_type;not null"`
	SourceRef       string     `gorm:"column:source_ref;not null"`
	Title           *string    `gorm:"column:title"`
	URL             *string    `gorm:"column:url"`
	Role            *string    `gorm:"column:role"`
	DestinationType string     `gorm:"column:destination_type;not null"`
	Status          string     `gorm:"column:status;not null"`
	StatusDetail    *string    `gorm:"column:status_detail"`
	ItemCount       int        `gorm:"column:item_count;not null"`
	FetchedAt       *time.Time `gorm:"column:fetched_at"`
	CreatedAt       time.Time  `gorm:"autoCreateTime"`
	UpdatedAt       time.Time  `gorm:"autoUpdateTime"`
}

// TableName returns the table name for ImportSourceModel
func (ImportSourceModel) TableName() string { return "import_job_sources" }

// ImportItemModel is the GORM persistence model for the import_job_items table.
// LibraryContentID is read-only: list queries select the id of content whose
// URL matches canonical_url into it, so "in library" costs no extra query.
type ImportItemModel struct {
	ID               int             `gorm:"primaryKey;autoIncrement"`
	JobID            int             `gorm:"column:job_id;not null"`
	SourceID         int             `gorm:"column:source_id;not null"`
	ExternalID       string          `gorm:"column:external_id;not null"`
	DestinationType  string          `gorm:"column:destination_type;not null"`
	CanonicalURL     string          `gorm:"column:canonical_url;not null"`
	Kind             string          `gorm:"column:kind;not null"`
	Title            string          `gorm:"column:title;not null"`
	Summary          *string         `gorm:"column:summary"`
	PublishedAt      *time.Time      `gorm:"column:published_at"`
	DurationSeconds  *int            `gorm:"column:duration_seconds"`
	ViewCount        *int64          `gorm:"column:view_count"`
	LikeCount        *int64          `gorm:"column:like_count"`
	CommentCount     *int64          `gorm:"column:comment_count"`
	Rating           *float64        `gorm:"column:rating"`
	RatingCount      *int            `gorm:"column:rating_count"`
	RatingSource     *string         `gorm:"column:rating_source"`
	ChapterCount     int             `gorm:"column:chapter_count;not null"`
	HasCaptions      *bool           `gorm:"column:has_captions"`
	Genres           StringArray     `gorm:"column:genres;type:text[];not null"`
	TopCast          StringArray     `gorm:"column:top_cast;type:text[];not null"`
	Popularity       *float64        `gorm:"column:popularity"`
	ReviewCount      *int            `gorm:"column:review_count"`
	Revenue          *int64          `gorm:"column:revenue"`
	Budget           *int64          `gorm:"column:budget"`
	ThumbnailURL     *string         `gorm:"column:thumbnail_url"`
	Position         int             `gorm:"column:position;not null"`
	Details          json.RawMessage `gorm:"column:details;type:jsonb"`
	StatsFetchedAt   time.Time       `gorm:"column:stats_fetched_at;not null"`
	ImportStatus     *string         `gorm:"column:import_status"`
	ImportError      *string         `gorm:"column:import_error"`
	ContentID        *int            `gorm:"column:content_id"`
	ImportedAt       *time.Time      `gorm:"column:imported_at"`
	LibraryContentID *int            `gorm:"column:library_content_id;->;-:migration"`
	CreatedAt        time.Time       `gorm:"autoCreateTime"`
	UpdatedAt        time.Time       `gorm:"autoUpdateTime"`
}

// TableName returns the table name for ImportItemModel
func (ImportItemModel) TableName() string { return "import_job_items" }
