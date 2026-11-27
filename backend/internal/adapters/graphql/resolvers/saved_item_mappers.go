package resolvers

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/model"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// ---- Saved item mappers ----

// savedItemDomainToModel converts a domain saved item to the SavedItem interface.
// A nil item, or a type with no GraphQL shape yet, maps to a nil interface, never
// to a typed nil (which would not be null on the wire).
func savedItemDomainToModel(item *domain.SavedItem) model.SavedItem {
	if item == nil {
		return nil
	}
	switch item.Type {
	case domain.SavedItemTypeFormula:
		return savedFormulaDomainToModel(item)
	}
	return nil
}

// savedFormulaDomainToModel converts a domain formula to its GraphQL model. The
// source id is exposed only while the source is readable, so a now-private or
// deleted source is not confirmed to exist. A link's payload is nil when its
// source is gone.
func savedFormulaDomainToModel(item *domain.SavedItem) *model.SavedFormula {
	out := &model.SavedFormula{
		ID:              strconv.Itoa(item.ID),
		Type:            item.Type,
		Name:            item.Name,
		Privacy:         item.Privacy,
		Origin:          item.Origin,
		SourceAvailable: item.SourceAvailable,
		PayloadVersion:  item.PayloadVersion,
		CreatedAt:       item.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:       item.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
		Payload:         savedPayloadToMap(item.Payload),
		UserID:          item.UserID,
	}
	if item.SourceID != nil && item.SourceAvailable {
		sourceID := strconv.Itoa(*item.SourceID)
		out.SourceID = &sourceID
	}
	return out
}

// savedPayloadToMap decodes a stored payload into the JSON scalar's map. An empty
// payload (a link, or a source that is gone) stays nil.
func savedPayloadToMap(raw json.RawMessage) map[string]any {
	if len(raw) == 0 {
		return nil
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		slog.Error("saved item payload is not a JSON object", "error", err)
		return nil
	}
	return m
}

// savedItemPageToModel converts a page of saved formulas, preserving order.
func savedItemPageToModel(page *domain.PaginatedSavedItems) *model.PaginatedSavedFormulas {
	items := make([]*model.SavedFormula, 0, len(page.Items))
	for _, item := range page.Items {
		items = append(items, savedFormulaDomainToModel(item))
	}
	return &model.PaginatedSavedFormulas{
		Items: items,
		PageInfo: &model.PageInfo{
			HasNextPage:     page.HasNext,
			HasPreviousPage: page.HasPrev,
			StartCursor:     page.StartCursor,
			EndCursor:       page.EndCursor,
		},
		TotalCount: page.TotalCount,
	}
}

// savedFormulaListParams builds the list params for the formula queries. The
// scope and viewer are set by the service; the type is always FORMULA here.
func savedFormulaListParams(first *int, after *string, includeTotalCount *bool) domain.SavedItemListParams {
	params := domain.SavedItemListParams{
		Type:      domain.SavedItemTypeFormula,
		First:     first,
		After:     after,
		SortBy:    domain.SavedItemSortByCreatedAt,
		SortOrder: domain.SortOrderDesc,
	}
	if includeTotalCount != nil {
		params.IncludeTotalCount = *includeTotalCount
	}
	return params
}

// modelToCreateSavedFormulaInput converts the GraphQL create input. The owner is
// not set here: the service takes it from the authenticated actor. A missing
// payload stays nil so the service reports it as required.
func modelToCreateSavedFormulaInput(input model.CreateSavedFormulaInput) (domain.CreateSavedItemInput, error) {
	out := domain.CreateSavedItemInput{
		Type:    domain.SavedItemTypeFormula,
		Name:    input.Name,
		Privacy: input.Privacy,
	}
	if input.Payload != nil {
		raw, err := json.Marshal(input.Payload)
		if err != nil {
			return domain.CreateSavedItemInput{}, fmt.Errorf("%w: formula payload is not valid JSON", domain.ErrInvalidInput)
		}
		out.Payload = raw
	}
	return out, nil
}

// modelToUpdateSavedFormulaInput converts the GraphQL partial update. An omitted
// or null field stays nil, which the service reads as unchanged.
func modelToUpdateSavedFormulaInput(input model.UpdateSavedFormulaInput) (domain.UpdateSavedItemInput, error) {
	out := domain.UpdateSavedItemInput{
		ID:   input.ID,
		Type: domain.SavedItemTypeFormula,
		Name: input.Name,
	}
	if input.Payload != nil {
		raw, err := json.Marshal(input.Payload)
		if err != nil {
			return domain.UpdateSavedItemInput{}, fmt.Errorf("%w: formula payload is not valid JSON", domain.ErrInvalidInput)
		}
		out.Payload = raw
	}
	return out, nil
}
