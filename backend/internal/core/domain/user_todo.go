package domain

import "time"

// UserTodoStatus is the progress state of a user's todo
type UserTodoStatus string

const (
	UserTodoStatusNotStarted UserTodoStatus = "NOT_STARTED"
	UserTodoStatusInProgress UserTodoStatus = "IN_PROGRESS"
	UserTodoStatusDone       UserTodoStatus = "DONE"
	UserTodoStatusDropped    UserTodoStatus = "DROPPED"
)

// UserTodoSortBy represents sortable fields for user todo queries
type UserTodoSortBy string

const (
	UserTodoSortByPriority     UserTodoSortBy = "PRIORITY"
	UserTodoSortByDueDate      UserTodoSortBy = "DUE_DATE"
	UserTodoSortByCreatedAt    UserTodoSortBy = "CREATED_AT"
	UserTodoSortByUpdatedAt    UserTodoSortBy = "UPDATED_AT"
	UserTodoSortByListPosition UserTodoSortBy = "LIST_POSITION"
)

// TodoAction is what a todo asks the user to do with its content (consume,
// research, share, ...). UserID nil means a global preset; a set UserID means
// an action the user entered, visible only in that user's picker.
type TodoAction struct {
	ID              int
	Key             string // stable lowercase machine key, e.g. "consume"
	Label           string // shown in the picker, e.g. "Consume"
	Description     string // hover tooltip in the picker
	TypicalSequence *int   // picker order for presets; nil for user-entered actions
	UserID          *int   // nil = preset (global)
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// IsPreset reports whether the action is a global preset rather than one a
// user entered.
func (a TodoAction) IsPreset() bool {
	return a.UserID == nil
}

// UserTodoList is a named, ordered group of a user's todos. Its privacy is
// independent of the privacy of the todos in it.
type UserTodoList struct {
	ID          int
	UserID      int // owner
	Name        string
	Description *string
	Privacy     Privacy
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// UserTodo is one item in a user's plan: an action on a piece of content (or
// on a free-text name when the content isn't in Perspectize).
type UserTodo struct {
	ID        int
	UserID    int     // owner, FK to users
	ContentID *int    // optional, FK to content
	Name      *string // only when there is no content

	ActionID        int  // FK to todo_actions
	Priority        *int // 0-10000, see RatingMin/RatingMax
	Status          UserTodoStatus
	PercentComplete int // 0-100

	// Date-only values; the time component is ignored
	StartDate *time.Time
	EndDate   *time.Time // finished
	DueDate   *time.Time // target

	Comments *string // sanitized HTML

	Privacy      Privacy
	ListID       *int // one list per todo
	ListPosition *int // order within the list; set iff ListID is set

	CreatedAt time.Time
	UpdatedAt time.Time
}

// CreateTodoActionInput contains the data needed to add a user-entered action
type CreateTodoActionInput struct {
	UserID      int
	Label       string
	Description string
}

// CreateUserTodoInput contains the data needed to create a todo. UserID is set
// by the service from the authenticated actor.
type CreateUserTodoInput struct {
	UserID          int
	ContentID       *int
	Name            *string
	ActionID        int
	Priority        *int
	Status          *UserTodoStatus
	PercentComplete *int
	StartDate       *time.Time
	EndDate         *time.Time
	DueDate         *time.Time
	Comments        *string
	Privacy         *Privacy
	ListID          *int
}

// UpdateUserTodoInput contains the data needed to partially update a todo.
// Nil pointer fields are left unchanged. Clear* requests that a nullable field
// be reset to "no value"; the paired value field is ignored when it is true.
type UpdateUserTodoInput struct {
	ID              int
	ContentID       *int
	Name            *string
	ActionID        *int
	Priority        *int
	Status          *UserTodoStatus
	PercentComplete *int
	StartDate       *time.Time
	EndDate         *time.Time
	DueDate         *time.Time
	Comments        *string
	Privacy         *Privacy
	ListID          *int

	ClearContentID bool
	ClearName      bool
	ClearPriority  bool
	ClearStartDate bool
	ClearEndDate   bool
	ClearDueDate   bool
	ClearComments  bool
	ClearListID    bool
}

// CreateUserTodoListInput contains the data needed to create a todo list
type CreateUserTodoListInput struct {
	UserID      int
	Name        string
	Description *string
	Privacy     *Privacy
}

// UpdateUserTodoListInput contains the data needed to partially update a todo list
type UpdateUserTodoListInput struct {
	ID          int
	Name        *string
	Description *string
	Privacy     *Privacy
	// ClearDescription sets Description to NULL (Description is ignored).
	ClearDescription bool
}

// UserTodoFilter contains filter criteria for user todo queries
type UserTodoFilter struct {
	UserID    *int
	ContentID *int
	ListID    *int
	Unlisted  bool // only todos with no list; ignored when ListID is set
	Statuses  []UserTodoStatus
	ActionID  *int
}

// UserTodoListParams contains parameters for paginated user todo queries
type UserTodoListParams struct {
	First             *int
	After             *string
	Last              *int
	Before            *string
	SortBy            UserTodoSortBy
	SortOrder         SortOrder
	IncludeTotalCount bool
	Filter            *UserTodoFilter

	// ViewerID is the authenticated caller's local user id, or nil when the
	// request is anonymous. Set by the resolver from auth.ForContext.
	ViewerID *int

	// RestrictToPublicOrOwner, when true, limits results to rows that are
	// public OR owned by ViewerID. The repository translates it into a WHERE
	// predicate.
	RestrictToPublicOrOwner bool
}

// PaginatedUserTodos represents a paginated list of user todos
type PaginatedUserTodos struct {
	Items       []*UserTodo
	HasNext     bool
	HasPrev     bool
	StartCursor *string
	EndCursor   *string
	TotalCount  *int
}
