package postgres

import "github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"

// savedItemModelToDomain converts a written or returned SavedItemModel to a
// domain.SavedItem. A LINK comes back with a nil Payload and an unset
// SourceAvailable; the service fills both from the source it read.
func savedItemModelToDomain(m *SavedItemModel) *domain.SavedItem {
	if m == nil {
		return nil
	}
	return &domain.SavedItem{
		ID:             m.ID,
		UserID:         m.UserID,
		Type:           savedItemTypeFromDBValue(m.Type),
		Name:           m.Name,
		Payload:        m.Payload,
		PayloadVersion: m.PayloadVersion,
		Privacy:        privacyFromDBValue(m.Privacy),
		Origin:         savedItemOriginFromDBValue(m.Origin),
		SourceID:       m.SourceID,
		CreatedAt:      m.CreatedAt,
		UpdatedAt:      m.UpdatedAt,
	}
}

// savedItemReadToDomain converts a SavedItemReadModel, the shape every read
// returns, to a domain.SavedItem with the link payload and source flag resolved.
func savedItemReadToDomain(m *SavedItemReadModel) *domain.SavedItem {
	if m == nil {
		return nil
	}
	return &domain.SavedItem{
		ID:              m.ID,
		UserID:          m.UserID,
		Type:            savedItemTypeFromDBValue(m.Type),
		Name:            m.Name,
		Payload:         m.ResolvedPayload,
		PayloadVersion:  m.ResolvedPayloadVersion,
		Privacy:         privacyFromDBValue(m.Privacy),
		Origin:          savedItemOriginFromDBValue(m.Origin),
		SourceID:        m.SourceID,
		SourceAvailable: m.SourceAvailable,
		CreatedAt:       m.CreatedAt,
		UpdatedAt:       m.UpdatedAt,
	}
}

// savedItemDomainToModel converts a domain.SavedItem to a SavedItemModel for a
// write. An empty origin is written as own and an empty privacy as private, the
// column defaults.
func savedItemDomainToModel(item *domain.SavedItem) *SavedItemModel {
	if item == nil {
		return nil
	}
	origin := item.Origin
	if origin == "" {
		origin = domain.SavedItemOriginOwn
	}
	privacy := item.Privacy
	if privacy == "" {
		privacy = domain.PrivacyPrivate
	}
	return &SavedItemModel{
		ID:             item.ID,
		UserID:         item.UserID,
		Type:           savedItemTypeToDBValue(item.Type),
		Name:           item.Name,
		Payload:        item.Payload,
		PayloadVersion: item.PayloadVersion,
		Privacy:        privacyToDBValue(privacy),
		Origin:         savedItemOriginToDBValue(origin),
		SourceID:       item.SourceID,
		// CreatedAt, UpdatedAt and DeletedAt are managed by GORM and the database
	}
}
