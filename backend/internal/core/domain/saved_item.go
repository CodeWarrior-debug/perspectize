package domain

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"strings"
	"time"
	"unicode/utf8"
)

// SavedItemType is what kind of thing a saved item is. The database column is
// lowercase text; the domain value is UPPERCASE.
type SavedItemType string

const (
	SavedItemTypeFormula SavedItemType = "FORMULA"
	SavedItemTypeTheme   SavedItemType = "THEME"
	SavedItemTypeView    SavedItemType = "VIEW"
	SavedItemTypeSetting SavedItemType = "SETTING"
)

// Valid reports whether t is one of the four saved item types.
func (t SavedItemType) Valid() bool {
	switch t {
	case SavedItemTypeFormula, SavedItemTypeTheme, SavedItemTypeView, SavedItemTypeSetting:
		return true
	}
	return false
}

// SavedItemOrigin records how a saved item came to be in the owner's store.
//   - OWN: the owner made it.
//   - COPY: a copy of a public item; keeps credit through SourceID.
//   - LINK: stores no payload of its own; reads the source's payload.
type SavedItemOrigin string

const (
	SavedItemOriginOwn  SavedItemOrigin = "OWN"
	SavedItemOriginCopy SavedItemOrigin = "COPY"
	SavedItemOriginLink SavedItemOrigin = "LINK"
)

// SavedItemScope selects which rows a saved item list reads.
type SavedItemScope string

const (
	// SavedItemScopeMine lists the viewer's own live items.
	SavedItemScopeMine SavedItemScope = "MINE"
	// SavedItemScopeShared lists public live items plus the viewer's own.
	SavedItemScopeShared SavedItemScope = "SHARED"
)

// SavedItemSortBy is the sortable field for saved item lists.
type SavedItemSortBy string

const (
	SavedItemSortByName      SavedItemSortBy = "NAME"
	SavedItemSortByCreatedAt SavedItemSortBy = "CREATED_AT"
	SavedItemSortByUpdatedAt SavedItemSortBy = "UPDATED_AT"
)

// SavedItemNameMaxLen is the longest name a saved item may have (varchar(100)).
const SavedItemNameMaxLen = 100

// SavedFormulaPayloadVersion is the payload schema version written for formulas.
const SavedFormulaPayloadVersion = 1

// Limits on a formula payload. The node and depth caps keep the tree the
// evaluator walks small; the text caps match the builder's fields.
const (
	savedFormulaMaxNodes     = 200
	savedFormulaMaxDepth     = 20
	savedFormulaSubtitleMax  = 200
	savedFormulaNumberFmtMax = 40
	savedFormulaContentTypes = 10
	savedFormulaContentMax   = 40
)

// SavedItem is one thing a person saved: a formula now, later themes, views and
// settings. For a LINK, Payload is the source's payload as resolved on read and
// is nil when the source is no longer readable; SourceAvailable reports that.
// For a COPY, SourceAvailable drives the "no longer available" credit.
type SavedItem struct {
	ID     int
	UserID int // owner
	Type   SavedItemType
	Name   string

	Payload        json.RawMessage
	PayloadVersion int

	Privacy  Privacy
	Origin   SavedItemOrigin
	SourceID *int // set for COPY and LINK

	// SourceAvailable is true when SourceID points at a live public item.
	SourceAvailable bool

	CreatedAt time.Time
	UpdatedAt time.Time
}

// CreateSavedItemInput contains the data needed to create an OWN saved item.
// The owner is the authenticated actor, passed to the service separately.
type CreateSavedItemInput struct {
	Type    SavedItemType
	Name    string
	Payload json.RawMessage
	// Privacy defaults to PRIVATE when nil.
	Privacy *Privacy
}

// UpdateSavedItemInput contains the data needed to partially update a saved
// item. Nil fields are left unchanged. Type is the type the caller expects the
// row to be; a row of another type is refused.
type UpdateSavedItemInput struct {
	ID      int
	Type    SavedItemType
	Name    *string
	Payload json.RawMessage
}

// SavedItemListParams contains parameters for paginated saved item queries.
type SavedItemListParams struct {
	Type  SavedItemType
	Scope SavedItemScope

	First             *int
	After             *string
	Last              *int
	Before            *string
	SortBy            SavedItemSortBy
	SortOrder         SortOrder
	IncludeTotalCount bool

	// ViewerID is the authenticated caller's user id, or nil when anonymous.
	ViewerID *int
}

// PaginatedSavedItems represents one page of saved items.
type PaginatedSavedItems struct {
	Items       []*SavedItem
	HasNext     bool
	HasPrev     bool
	StartCursor *string
	EndCursor   *string
	TotalCount  *int
}

// SavedFormulaPayload is the stored payload of a FORMULA item. The expression is
// evaluated in the browser; the backend only checks its shape and size.
type SavedFormulaPayload struct {
	Expression   FormulaNode `json:"expression"`
	Subtitle     *string     `json:"subtitle,omitempty"`
	NumberFormat *string     `json:"numberFormat,omitempty"`
	ContentTypes []string    `json:"contentTypes,omitempty"`
}

// FormulaNode is one node of a formula expression tree. Exactly one of Op,
// Const or Operand is set:
//   - {"op": "<function>", "args": [...]} applies a whitelisted function.
//   - {"const": <finite number>} is a literal.
//   - {"operand": "<field key>"} reads a numeric field of the row.
//
// Pointers keep a zero constant (0) distinct from an absent field.
type FormulaNode struct {
	Op      *string       `json:"op,omitempty"`
	Args    []FormulaNode `json:"args,omitempty"`
	Const   *float64      `json:"const,omitempty"`
	Operand *string       `json:"operand,omitempty"`
}

// formulaArity is the allowed argument count of a function. max < 0 means no
// upper bound.
type formulaArity struct {
	min int
	max int
}

// savedFormulaFunctions is the whitelist of functions a formula may call.
var savedFormulaFunctions = map[string]formulaArity{
	"add":      {min: 2, max: -1},
	"mul":      {min: 2, max: -1},
	"min":      {min: 2, max: -1},
	"max":      {min: 2, max: -1},
	"coalesce": {min: 2, max: -1},
	"sub":      {min: 2, max: 2},
	"div":      {min: 2, max: 2},
	"log10":    {min: 1, max: 1},
	"sqrt":     {min: 1, max: 1},
	"zscore":   {min: 1, max: 1},
}

// NormalizeSavedItemName trims a saved item name and checks its length. The
// result is the stored name.
func NormalizeSavedItemName(name string) (string, error) {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return "", fmt.Errorf("%w: name is required", ErrInvalidInput)
	}
	if utf8.RuneCountInString(trimmed) > SavedItemNameMaxLen {
		return "", fmt.Errorf("%w: name must be %d characters or less", ErrInvalidInput, SavedItemNameMaxLen)
	}
	return trimmed, nil
}

// ValidateSavedItemPayload checks a payload against the rules for its type.
// Only FORMULA accepts a payload in this release; the other types are reserved
// in the table but have no payload shape yet.
func ValidateSavedItemPayload(itemType SavedItemType, payload json.RawMessage) error {
	if itemType == SavedItemTypeFormula {
		return ValidateSavedFormulaPayload(payload)
	}
	return fmt.Errorf("%w: %s items do not accept a payload yet", ErrInvalidInput, strings.ToLower(string(itemType)))
}

// ValidateSavedFormulaPayload decodes a formula payload strictly (unknown keys
// are rejected) and checks its expression tree: at most 200 nodes, nested at
// most 20 levels, whitelisted functions with valid arity, finite constants and
// non-empty operand keys. The builder's text fields are length-checked too.
func ValidateSavedFormulaPayload(raw json.RawMessage) error {
	if len(raw) == 0 {
		return fmt.Errorf("%w: formula payload is required", ErrInvalidInput)
	}

	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	var payload SavedFormulaPayload
	if err := dec.Decode(&payload); err != nil {
		return fmt.Errorf("%w: formula payload is not valid: %v", ErrInvalidInput, err)
	}
	if _, err := dec.Token(); err != io.EOF {
		return fmt.Errorf("%w: formula payload has trailing data", ErrInvalidInput)
	}

	if payload.Subtitle != nil && utf8.RuneCountInString(*payload.Subtitle) > savedFormulaSubtitleMax {
		return fmt.Errorf("%w: subtitle must be %d characters or less", ErrInvalidInput, savedFormulaSubtitleMax)
	}
	if payload.NumberFormat != nil && utf8.RuneCountInString(*payload.NumberFormat) > savedFormulaNumberFmtMax {
		return fmt.Errorf("%w: number format must be %d characters or less", ErrInvalidInput, savedFormulaNumberFmtMax)
	}
	if len(payload.ContentTypes) > savedFormulaContentTypes {
		return fmt.Errorf("%w: at most %d content types", ErrInvalidInput, savedFormulaContentTypes)
	}
	for _, ct := range payload.ContentTypes {
		if strings.TrimSpace(ct) == "" || utf8.RuneCountInString(ct) > savedFormulaContentMax {
			return fmt.Errorf("%w: each content type must be 1 to %d characters", ErrInvalidInput, savedFormulaContentMax)
		}
	}

	count := 0
	return validateFormulaNode(payload.Expression, 1, &count)
}

// validateFormulaNode checks one node and, recursively, its arguments. depth is
// the node's level (the root is 1); count is the number of nodes seen so far.
// Both caps are checked on entry, so the walk stops early on an oversize tree.
func validateFormulaNode(n FormulaNode, depth int, count *int) error {
	*count++
	if *count > savedFormulaMaxNodes {
		return fmt.Errorf("%w: formula has more than %d nodes", ErrInvalidInput, savedFormulaMaxNodes)
	}
	if depth > savedFormulaMaxDepth {
		return fmt.Errorf("%w: formula is nested more than %d levels deep", ErrInvalidInput, savedFormulaMaxDepth)
	}

	kinds := 0
	if n.Op != nil {
		kinds++
	}
	if n.Const != nil {
		kinds++
	}
	if n.Operand != nil {
		kinds++
	}
	if kinds != 1 {
		return fmt.Errorf("%w: each formula node needs exactly one of op, const or operand", ErrInvalidInput)
	}

	switch {
	case n.Const != nil:
		if n.Args != nil {
			return fmt.Errorf("%w: a constant takes no arguments", ErrInvalidInput)
		}
		if math.IsNaN(*n.Const) || math.IsInf(*n.Const, 0) {
			return fmt.Errorf("%w: constants must be finite numbers", ErrInvalidInput)
		}
	case n.Operand != nil:
		if n.Args != nil {
			return fmt.Errorf("%w: an operand takes no arguments", ErrInvalidInput)
		}
		if strings.TrimSpace(*n.Operand) == "" {
			return fmt.Errorf("%w: operand key must not be empty", ErrInvalidInput)
		}
	default:
		arity, ok := savedFormulaFunctions[*n.Op]
		if !ok {
			return fmt.Errorf("%w: unknown formula function %q", ErrInvalidInput, *n.Op)
		}
		if len(n.Args) < arity.min || (arity.max >= 0 && len(n.Args) > arity.max) {
			if arity.max < 0 {
				return fmt.Errorf("%w: %s takes at least %d arguments", ErrInvalidInput, *n.Op, arity.min)
			}
			return fmt.Errorf("%w: %s takes %d to %d arguments", ErrInvalidInput, *n.Op, arity.min, arity.max)
		}
		for _, arg := range n.Args {
			if err := validateFormulaNode(arg, depth+1, count); err != nil {
				return err
			}
		}
	}
	return nil
}
