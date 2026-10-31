package postgres

import (
	"encoding/json"
	"strings"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// userModelToDomain converts a GORM UserModel to domain.User
func userModelToDomain(m *UserModel) *domain.User {
	if m == nil {
		return nil
	}
	email := ""
	if m.Email != nil {
		email = *m.Email
	}
	clerkUserID := ""
	if m.ClerkUserID != nil {
		clerkUserID = *m.ClerkUserID
	}
	return &domain.User{
		ID:          m.ID,
		ClerkUserID: clerkUserID,
		Username:    m.Username,
		Email:       email,
		Role:        domain.UserRole(strings.ToUpper(m.Role)),
		Active:      m.Active,
		Onboarding:  onboardingFromJSON(m.Onboarding),
		CreatedAt:   m.CreatedAt,
		UpdatedAt:   m.UpdatedAt,
	}
}

// userDomainToModel converts a domain.User to GORM UserModel
func userDomainToModel(u *domain.User) *UserModel {
	if u == nil {
		return nil
	}
	var email *string
	if u.Email != "" {
		email = &u.Email
	}
	var clerkUserID *string
	if u.ClerkUserID != "" {
		clerkUserID = &u.ClerkUserID
	}
	return &UserModel{
		ID:          u.ID,
		ClerkUserID: clerkUserID,
		Username:    u.Username,
		Email:       email,
		Role:        strings.ToLower(string(u.Role)),
		Active:      u.Active,
		Onboarding:  onboardingToJSON(u.Onboarding),
		// CreatedAt and UpdatedAt are managed by GORM
	}
}

func onboardingFromJSON(raw json.RawMessage) domain.UserOnboarding {
	if len(raw) == 0 || string(raw) == "null" || string(raw) == "{}" {
		return domain.DefaultUserOnboarding()
	}
	var o domain.UserOnboarding
	if err := json.Unmarshal(raw, &o); err != nil {
		return domain.DefaultUserOnboarding()
	}
	return o
}

func onboardingToJSON(o domain.UserOnboarding) json.RawMessage {
	data, err := json.Marshal(o)
	if err != nil {
		data, _ = json.Marshal(domain.DefaultUserOnboarding())
	}
	return data
}

// categoryModelToDomain converts a GORM CategoryModel to domain.Category
func categoryModelToDomain(m *CategoryModel) *domain.Category {
	if m == nil {
		return nil
	}
	return &domain.Category{
		ID:           m.ID,
		WikidataQID:  m.WikidataQID,
		Label:        m.Label,
		Description:  m.Description,
		EntityType:   m.EntityType,
		WikipediaURL: m.WikipediaURL,
		CreatedAt:    m.CreatedAt,
		UpdatedAt:    m.UpdatedAt,
	}
}

// categoryDomainToModel converts a domain.Category to GORM CategoryModel
func categoryDomainToModel(c *domain.Category) *CategoryModel {
	if c == nil {
		return nil
	}
	return &CategoryModel{
		ID:           c.ID,
		WikidataQID:  c.WikidataQID,
		Label:        c.Label,
		Description:  c.Description,
		EntityType:   c.EntityType,
		WikipediaURL: c.WikipediaURL,
		// CreatedAt and UpdatedAt are managed by GORM
	}
}

// lengthDisplayJSON is the stored shape of content.length_display: lowercase
// precision ("seconds"/"minutes"), matching migration 000030's backfill.
type lengthDisplayJSON struct {
	Source    string `json:"source"`
	Precision string `json:"precision"`
}

// lengthDisplayFromJSON decodes the length_display JSONB column. NULL or an
// unreadable value is nil, so the client falls back to formatting by length_units.
func lengthDisplayFromJSON(raw json.RawMessage) *domain.LengthDisplay {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var j lengthDisplayJSON
	if err := json.Unmarshal(raw, &j); err != nil {
		return nil
	}
	return &domain.LengthDisplay{Source: j.Source, Precision: domain.LengthPrecision(strings.ToUpper(j.Precision))}
}

// lengthDisplayToJSON encodes LengthDisplay for the length_display JSONB column (nil -> NULL).
func lengthDisplayToJSON(d *domain.LengthDisplay) json.RawMessage {
	if d == nil {
		return nil
	}
	raw, err := json.Marshal(lengthDisplayJSON{Source: d.Source, Precision: strings.ToLower(string(d.Precision))})
	if err != nil {
		return nil
	}
	return raw
}

// contentModelToDomain converts a GORM ContentModel to domain.Content
func contentModelToDomain(m *ContentModel) *domain.Content {
	if m == nil {
		return nil
	}
	return &domain.Content{
		ID:                m.ID,
		Name:              m.Name,
		URL:               m.URL,
		ContentType:       domain.ContentType(strings.ToUpper(m.ContentType)),
		AddedByUserID:     m.AddedByUserID,
		Length:            m.Length,
		LengthUnits:       m.LengthUnits,
		LengthDisplay:     lengthDisplayFromJSON(m.LengthDisplay),
		Response:          m.Response,
		PrimaryCategoryID: m.PrimaryCategoryID,
		VerseStartID:      m.VerseStartID,
		VerseEndID:        m.VerseEndID,
		DisplayTitle:      m.DisplayTitle,
		CreatedAt:         m.CreatedAt,
		UpdatedAt:         m.UpdatedAt,
	}
}

// contentDomainToModel converts a domain.Content to GORM ContentModel
func contentDomainToModel(c *domain.Content) *ContentModel {
	if c == nil {
		return nil
	}
	return &ContentModel{
		ID:                c.ID,
		Name:              c.Name,
		URL:               c.URL,
		ContentType:       strings.ToLower(string(c.ContentType)),
		AddedByUserID:     c.AddedByUserID,
		Length:            c.Length,
		LengthUnits:       c.LengthUnits,
		LengthDisplay:     lengthDisplayToJSON(c.LengthDisplay),
		Response:          c.Response,
		PrimaryCategoryID: c.PrimaryCategoryID,
		VerseStartID:      c.VerseStartID,
		VerseEndID:        c.VerseEndID,
		DisplayTitle:      c.DisplayTitle,
		// CreatedAt and UpdatedAt are managed by GORM
	}
}

// perspectiveModelToDomain converts a GORM PerspectiveModel to domain.Perspective
func perspectiveModelToDomain(m *PerspectiveModel) *domain.Perspective {
	if m == nil {
		return nil
	}

	p := &domain.Perspective{
		ID:          m.ID,
		UserID:      m.UserID,
		ContentID:   m.ContentID,
		Like:        m.Like,
		Quality:     m.Quality,
		Agreement:   m.Agreement,
		Importance:  m.Importance,
		Confidence:  m.Confidence,
		Category:    m.Category,
		Description: m.Description,
		CreatedAt:   m.CreatedAt,
		UpdatedAt:   m.UpdatedAt,
	}

	// Privacy: default to PUBLIC if nil
	if m.Privacy != nil {
		p.Privacy = domain.Privacy(strings.ToUpper(*m.Privacy))
	} else {
		p.Privacy = domain.PrivacyPublic
	}

	// ReviewStatus: convert pointer with ToUpper
	if m.ReviewStatus != nil {
		rs := domain.ReviewStatus(strings.ToUpper(*m.ReviewStatus))
		p.ReviewStatus = &rs
	}

	// Parts: convert int64 to int
	if len(m.Parts) > 0 {
		p.Parts = make([]int, len(m.Parts))
		for i, v := range m.Parts {
			p.Parts[i] = int(v)
		}
	}

	// Labels: direct copy
	if len(m.Labels) > 0 {
		p.Labels = m.Labels
	}

	// CategorizedRatings: unmarshal from JSONBArray strings
	if len(m.CategorizedRatings) > 0 {
		p.CategorizedRatings = make([]domain.CategorizedRating, 0, len(m.CategorizedRatings))
		for _, jsonStr := range m.CategorizedRatings {
			var cr domain.CategorizedRating
			if err := json.Unmarshal([]byte(jsonStr), &cr); err != nil {
				// Skip invalid JSON - same behavior as sqlx implementation
				continue
			}
			p.CategorizedRatings = append(p.CategorizedRatings, cr)
		}
	}

	// Feelings: unmarshal from JSONBArray strings (same pattern as CategorizedRatings)
	if len(m.Feelings) > 0 {
		p.Feelings = make([]domain.FeelingEntry, 0, len(m.Feelings))
		for _, jsonStr := range m.Feelings {
			var f domain.FeelingEntry
			if err := json.Unmarshal([]byte(jsonStr), &f); err != nil {
				continue
			}
			p.Feelings = append(p.Feelings, f)
		}
	}

	// PrimaryPerspectiveID: direct copy
	p.PrimaryPerspectiveID = m.PrimaryPerspectiveID

	// RelatedPerspectiveIDs: convert int64 to int (same pattern as Parts)
	if len(m.RelatedPerspectiveIDs) > 0 {
		p.RelatedPerspectiveIDs = make([]int, len(m.RelatedPerspectiveIDs))
		for i, v := range m.RelatedPerspectiveIDs {
			p.RelatedPerspectiveIDs[i] = int(v)
		}
	}

	// CustomFields: direct copy
	p.CustomFields = m.CustomFields

	// Review: direct copy
	p.Review = m.Review

	return p
}

// perspectiveDomainToModel converts a domain.Perspective to GORM PerspectiveModel
func perspectiveDomainToModel(p *domain.Perspective) *PerspectiveModel {
	if p == nil {
		return nil
	}

	m := &PerspectiveModel{
		ID:          p.ID,
		UserID:      p.UserID,
		ContentID:   p.ContentID,
		Like:        p.Like,
		Quality:     p.Quality,
		Agreement:   p.Agreement,
		Importance:  p.Importance,
		Confidence:  p.Confidence,
		Category:    p.Category,
		Description: p.Description,
	}

	// Privacy: ToLower
	privacy := strings.ToLower(string(p.Privacy))
	m.Privacy = &privacy

	// ReviewStatus: ToLower pointer
	if p.ReviewStatus != nil {
		rs := strings.ToLower(string(*p.ReviewStatus))
		m.ReviewStatus = &rs
	}

	// Parts: convert int to int64
	if len(p.Parts) > 0 {
		m.Parts = make(Int64Array, len(p.Parts))
		for i, v := range p.Parts {
			m.Parts[i] = int64(v)
		}
	}

	// Labels: direct copy
	if len(p.Labels) > 0 {
		m.Labels = p.Labels
	}

	// CategorizedRatings: marshal to JSONBArray strings
	if len(p.CategorizedRatings) > 0 {
		m.CategorizedRatings = make(JSONBArray, len(p.CategorizedRatings))
		for i, cr := range p.CategorizedRatings {
			data, err := json.Marshal(cr)
			if err != nil {
				// Skip invalid data - same as sqlx implementation
				continue
			}
			m.CategorizedRatings[i] = string(data)
		}
	}

	// Feelings: marshal to JSONBArray strings (same pattern as CategorizedRatings)
	if len(p.Feelings) > 0 {
		m.Feelings = make(JSONBArray, len(p.Feelings))
		for i, f := range p.Feelings {
			data, err := json.Marshal(f)
			if err != nil {
				continue
			}
			m.Feelings[i] = string(data)
		}
	}

	// PrimaryPerspectiveID: direct copy
	m.PrimaryPerspectiveID = p.PrimaryPerspectiveID

	// RelatedPerspectiveIDs: convert int to int64 (same pattern as Parts)
	if len(p.RelatedPerspectiveIDs) > 0 {
		m.RelatedPerspectiveIDs = make(Int64Array, len(p.RelatedPerspectiveIDs))
		for i, v := range p.RelatedPerspectiveIDs {
			m.RelatedPerspectiveIDs[i] = int64(v)
		}
	}

	// CustomFields: direct copy
	m.CustomFields = p.CustomFields

	// Review: direct copy
	m.Review = p.Review

	return m
}

// todoActionModelToDomain converts a GORM TodoActionModel to domain.TodoAction
func todoActionModelToDomain(m *TodoActionModel) *domain.TodoAction {
	if m == nil {
		return nil
	}
	return &domain.TodoAction{
		ID:              m.ID,
		Key:             m.Key,
		Label:           m.Label,
		Description:     m.Description,
		TypicalSequence: m.TypicalSequence,
		UserID:          m.UserID,
		CreatedAt:       m.CreatedAt,
		UpdatedAt:       m.UpdatedAt,
	}
}

// todoActionDomainToModel converts a domain.TodoAction to GORM TodoActionModel
func todoActionDomainToModel(a *domain.TodoAction) *TodoActionModel {
	if a == nil {
		return nil
	}
	return &TodoActionModel{
		ID:              a.ID,
		Key:             a.Key,
		Label:           a.Label,
		Description:     a.Description,
		TypicalSequence: a.TypicalSequence,
		UserID:          a.UserID,
		// CreatedAt and UpdatedAt are managed by GORM
	}
}

// userTodoListModelToDomain converts a GORM UserTodoListModel to domain.UserTodoList
func userTodoListModelToDomain(m *UserTodoListModel) *domain.UserTodoList {
	if m == nil {
		return nil
	}
	return &domain.UserTodoList{
		ID:          m.ID,
		UserID:      m.UserID,
		Name:        m.Name,
		Description: m.Description,
		Privacy:     privacyFromDBValue(m.Privacy),
		CreatedAt:   m.CreatedAt,
		UpdatedAt:   m.UpdatedAt,
	}
}

// userTodoListDomainToModel converts a domain.UserTodoList to GORM UserTodoListModel.
// An empty privacy is written as public, the column default.
func userTodoListDomainToModel(l *domain.UserTodoList) *UserTodoListModel {
	if l == nil {
		return nil
	}
	privacy := l.Privacy
	if privacy == "" {
		privacy = domain.PrivacyPublic
	}
	return &UserTodoListModel{
		ID:          l.ID,
		UserID:      l.UserID,
		Name:        l.Name,
		Description: l.Description,
		Privacy:     privacyToDBValue(privacy),
		// CreatedAt and UpdatedAt are managed by GORM
	}
}

// userTodoModelToDomain converts a GORM UserTodoModel to domain.UserTodo
func userTodoModelToDomain(m *UserTodoModel) *domain.UserTodo {
	if m == nil {
		return nil
	}
	return &domain.UserTodo{
		ID:              m.ID,
		UserID:          m.UserID,
		ContentID:       m.ContentID,
		Name:            m.Name,
		ActionID:        m.ActionID,
		Priority:        m.Priority,
		Status:          userTodoStatusFromDBValue(m.Status),
		PercentComplete: m.PercentComplete,
		StartDate:       m.StartDate,
		EndDate:         m.EndDate,
		DueDate:         m.DueDate,
		Comments:        m.Comments,
		Privacy:         privacyFromDBValue(m.Privacy),
		ListID:          m.ListID,
		ListPosition:    m.ListPosition,
		CreatedAt:       m.CreatedAt,
		UpdatedAt:       m.UpdatedAt,
	}
}

// userTodoDomainToModel converts a domain.UserTodo to GORM UserTodoModel. Empty
// status and privacy are written as the column defaults (not_started, public).
func userTodoDomainToModel(t *domain.UserTodo) *UserTodoModel {
	if t == nil {
		return nil
	}
	status := t.Status
	if status == "" {
		status = domain.UserTodoStatusNotStarted
	}
	privacy := t.Privacy
	if privacy == "" {
		privacy = domain.PrivacyPublic
	}
	return &UserTodoModel{
		ID:              t.ID,
		UserID:          t.UserID,
		ContentID:       t.ContentID,
		Name:            t.Name,
		ActionID:        t.ActionID,
		Priority:        t.Priority,
		Status:          userTodoStatusToDBValue(status),
		PercentComplete: t.PercentComplete,
		StartDate:       t.StartDate,
		EndDate:         t.EndDate,
		DueDate:         t.DueDate,
		Comments:        t.Comments,
		Privacy:         privacyToDBValue(privacy),
		ListID:          t.ListID,
		ListPosition:    t.ListPosition,
		// CreatedAt and UpdatedAt are managed by GORM
	}
}

// importJobModelToDomain converts a GORM ImportJobModel (without sources) to domain.ImportJob
func importJobModelToDomain(m *ImportJobModel) *domain.ImportJob {
	return &domain.ImportJob{
		ID:            m.ID,
		UserID:        m.UserID,
		Name:          m.Name,
		RequestStatus: domain.ImportRequestStatus(strings.ToUpper(m.RequestStatus)),
		ReviewNote:    m.ReviewNote,
		ReviewedAt:    m.ReviewedAt,
		ClosedAt:      m.ClosedAt,
		Sources:       []*domain.ImportSource{},
		CreatedAt:     m.CreatedAt,
		UpdatedAt:     m.UpdatedAt,
	}
}

// importRequestStatusToDB is the stored (lowercase) form; an unset status means approved.
func importRequestStatusToDB(st domain.ImportRequestStatus) string {
	if st == "" {
		st = domain.ImportRequestStatusApproved
	}
	return strings.ToLower(string(st))
}

// importSourceModelToDomain converts a GORM ImportSourceModel to domain.ImportSource
func importSourceModelToDomain(m *ImportSourceModel) *domain.ImportSource {
	s := &domain.ImportSource{
		ID:              m.ID,
		JobID:           m.JobID,
		SourceType:      domain.ImportSourceType(strings.ToUpper(m.SourceType)),
		SourceRef:       m.SourceRef,
		Title:           m.Title,
		URL:             m.URL,
		DestinationType: contentTypeFromDBValue(m.DestinationType),
		Status:          domain.ImportSourceStatus(strings.ToUpper(m.Status)),
		StatusDetail:    m.StatusDetail,
		ItemCount:       m.ItemCount,
		FetchedAt:       m.FetchedAt,
		CreatedAt:       m.CreatedAt,
		UpdatedAt:       m.UpdatedAt,
	}
	if m.Role != nil {
		role := domain.ImportPersonRole(strings.ToUpper(*m.Role))
		s.Role = &role
	}
	return s
}

// importSourceDomainToModel converts a domain.ImportSource to its GORM model
func importSourceDomainToModel(s *domain.ImportSource) *ImportSourceModel {
	m := &ImportSourceModel{
		ID:              s.ID,
		JobID:           s.JobID,
		SourceType:      strings.ToLower(string(s.SourceType)),
		SourceRef:       s.SourceRef,
		Title:           s.Title,
		URL:             s.URL,
		DestinationType: contentTypeToDBValue(s.DestinationType),
		Status:          strings.ToLower(string(s.Status)),
		StatusDetail:    s.StatusDetail,
		ItemCount:       s.ItemCount,
		FetchedAt:       s.FetchedAt,
	}
	if m.Status == "" {
		m.Status = strings.ToLower(string(domain.ImportSourceStatusListing))
	}
	if s.Role != nil {
		role := strings.ToLower(string(*s.Role))
		m.Role = &role
	}
	return m
}

// importItemModelToDomain converts a GORM ImportItemModel to domain.ImportItem.
// ContentID prefers the content the import created, then any content with the
// same URL (LibraryContentID), so a row added by hand still links to it.
func importItemModelToDomain(m *ImportItemModel) *domain.ImportItem {
	it := &domain.ImportItem{
		ID:              m.ID,
		JobID:           m.JobID,
		SourceID:        m.SourceID,
		ExternalID:      m.ExternalID,
		DestinationType: contentTypeFromDBValue(m.DestinationType),
		CanonicalURL:    m.CanonicalURL,
		Kind:            domain.ImportItemKind(strings.ToUpper(m.Kind)),
		Title:           m.Title,
		Summary:         m.Summary,
		PublishedAt:     m.PublishedAt,
		DurationSeconds: m.DurationSeconds,
		ViewCount:       m.ViewCount,
		LikeCount:       m.LikeCount,
		CommentCount:    m.CommentCount,
		Rating:          m.Rating,
		RatingCount:     m.RatingCount,
		RatingSource:    m.RatingSource,
		ChapterCount:    m.ChapterCount,
		HasCaptions:     m.HasCaptions,
		Genres:          nonNilStrings(m.Genres),
		TopCast:         nonNilStrings(m.TopCast),
		Popularity:      m.Popularity,
		ReviewCount:     m.ReviewCount,
		Revenue:         m.Revenue,
		Budget:          m.Budget,
		ThumbnailURL:    m.ThumbnailURL,
		Position:        m.Position,
		Excluded:        m.Excluded,
		StatsFetchedAt:  m.StatsFetchedAt,
		ImportError:     m.ImportError,
		ImportedAt:      m.ImportedAt,
		ContentID:       m.ContentID,
		InLibrary:       m.LibraryContentID != nil,
	}
	if it.ContentID == nil {
		it.ContentID = m.LibraryContentID
	}
	if m.ImportStatus != nil {
		st := domain.ImportItemStatus(strings.ToUpper(*m.ImportStatus))
		it.ImportStatus = &st
	}
	return it
}

// importItemDomainToModel converts a staged candidate (row + details) to its GORM model
func importItemDomainToModel(in *domain.ImportItemWithDetails) (*ImportItemModel, error) {
	details, err := json.Marshal(in.Details)
	if err != nil {
		return nil, err
	}
	it := in.Item
	m := &ImportItemModel{
		JobID:           it.JobID,
		SourceID:        it.SourceID,
		ExternalID:      it.ExternalID,
		DestinationType: contentTypeToDBValue(it.DestinationType),
		CanonicalURL:    it.CanonicalURL,
		Kind:            strings.ToLower(string(it.Kind)),
		Title:           it.Title,
		Summary:         it.Summary,
		PublishedAt:     it.PublishedAt,
		DurationSeconds: it.DurationSeconds,
		ViewCount:       it.ViewCount,
		LikeCount:       it.LikeCount,
		CommentCount:    it.CommentCount,
		Rating:          it.Rating,
		RatingCount:     it.RatingCount,
		RatingSource:    it.RatingSource,
		ChapterCount:    it.ChapterCount,
		HasCaptions:     it.HasCaptions,
		Genres:          StringArray(nonNilStrings(it.Genres)),
		TopCast:         StringArray(nonNilStrings(it.TopCast)),
		Popularity:      it.Popularity,
		ReviewCount:     it.ReviewCount,
		Revenue:         it.Revenue,
		Budget:          it.Budget,
		ThumbnailURL:    it.ThumbnailURL,
		Position:        it.Position,
		Details:         details,
		StatsFetchedAt:  it.StatsFetchedAt,
	}
	return m, nil
}

// nonNilStrings returns s, or an empty slice for nil: text[] columns are NOT NULL
// and GraphQL lists are non-null.
func nonNilStrings(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}
