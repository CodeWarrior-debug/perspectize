package resolvers

import (
	"encoding/json"
	"log/slog"
	"strconv"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/model"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// userDomainToModel converts a domain User to a GraphQL model User
func userDomainToModel(u *domain.User) *model.User {
	// Email stored on model for field resolver access (auth-gated by userResolver.Email)
	email := u.Email
	return &model.User{
		ID:         strconv.Itoa(u.ID),
		Username:   u.Username,
		Email:      &email,
		Active:     u.Active,
		Role:       u.Role,
		Onboarding: onboardingDomainToModel(&u.Onboarding),
		CreatedAt:  u.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:  u.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}

func onboardingDomainToModel(o *domain.UserOnboarding) *model.UserOnboarding {
	if o == nil {
		d := domain.DefaultUserOnboarding()
		return &model.UserOnboarding{
			Version:            d.Version,
			DisplayNextSession: d.DisplayNextSession,
			CompletedAt:        d.CompletedAt,
		}
	}
	return &model.UserOnboarding{
		Version:            o.Version,
		DisplayNextSession: o.DisplayNextSession,
		CompletedAt:        o.CompletedAt,
	}
}

// domainToModel converts a domain Content to a GraphQL model Content
func domainToModel(c *domain.Content) *model.Content {
	m := &model.Content{
		ID:            strconv.Itoa(c.ID),
		Name:          c.Name,
		URL:           c.URL,
		ContentType:   string(c.ContentType),
		AddedByUserID: strconv.Itoa(c.AddedByUserID),
		Length:        c.Length,
		LengthUnits:   c.LengthUnits,
		CreatedAt:     c.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:     c.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
		// Non-schema field — lets contentResolver.PrimaryCategory batch-load the
		// category by FK via dataloader instead of re-fetching the content row.
		PrimaryCategoryID: c.PrimaryCategoryID,
	}

	// Parse the raw response JSON into a map for GraphQL
	if len(c.Response) > 0 {
		var responseMap map[string]interface{}
		if err := json.Unmarshal(c.Response, &responseMap); err != nil {
			slog.Warn("failed to parse content response JSON", "contentID", c.ID, "error", err)
		} else {
			m.Response = responseMap
		}

		// Extract fields from the YouTube API response
		var resp struct {
			Items []struct {
				Snippet struct {
					ChannelTitle string   `json:"channelTitle"`
					PublishedAt  string   `json:"publishedAt"`
					Tags         []string `json:"tags"`
					Description  string   `json:"description"`
				} `json:"snippet"`
				Statistics struct {
					ViewCount    string `json:"viewCount"`
					LikeCount    string `json:"likeCount"`
					CommentCount string `json:"commentCount"`
				} `json:"statistics"`
			} `json:"items"`
		}
		if err := json.Unmarshal(c.Response, &resp); err != nil {
			slog.Warn("failed to parse YouTube response JSON", "contentID", c.ID, "error", err)
		} else if len(resp.Items) > 0 {
			item := resp.Items[0]

			// Extract snippet fields
			if item.Snippet.ChannelTitle != "" {
				m.ChannelTitle = &item.Snippet.ChannelTitle
			}
			if item.Snippet.PublishedAt != "" {
				m.PublishedAt = &item.Snippet.PublishedAt
			}
			if len(item.Snippet.Tags) > 0 {
				m.Tags = item.Snippet.Tags
			}
			if item.Snippet.Description != "" {
				m.Description = &item.Snippet.Description
			}

			// Extract statistics — empty strings from YouTube API default to 0
			stats := item.Statistics
			m.ViewCount = parseStatCount(stats.ViewCount, "viewCount", c.ID)
			m.LikeCount = parseStatCount(stats.LikeCount, "likeCount", c.ID)
			m.CommentCount = parseStatCount(stats.CommentCount, "commentCount", c.ID)
		}
	}

	return m
}

// parseStatCount parses a YouTube statistics string to *int.
// Returns pointer to 0 for empty strings, nil for non-numeric values.
func parseStatCount(value, field string, contentID int) *int {
	if value == "" {
		zero := 0
		return &zero
	}
	v, err := strconv.Atoi(value)
	if err != nil {
		slog.Warn("failed to parse "+field, "value", value, "contentID", contentID, "error", err)
		return nil
	}
	return &v
}

// categoryDomainToModel converts a domain Category to a GraphQL model Category
func categoryDomainToModel(c *domain.Category) *model.Category {
	if c == nil {
		return nil
	}
	return &model.Category{
		ID:          strconv.Itoa(c.ID),
		WikidataQid: c.WikidataQID,
		Label:       c.Label,
		Description: &c.Description,
		EntityType:  &c.EntityType,
		CreatedAt:   c.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:   c.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}

// perspectiveDomainToModel converts a domain Perspective to a GraphQL model Perspective
func perspectiveDomainToModel(p *domain.Perspective) *model.Perspective {
	m := &model.Perspective{
		ID:           strconv.Itoa(p.ID),
		UserID:       strconv.Itoa(p.UserID),
		Quality:      p.Quality,
		Agreement:    p.Agreement,
		Importance:   p.Importance,
		Confidence:   p.Confidence,
		Like:         p.Like,
		Privacy:      p.Privacy,
		Description:  p.Description,
		Category:     p.Category,
		Parts:        p.Parts,
		Labels:       p.Labels,
		ReviewStatus: p.ReviewStatus,
		CreatedAt:    p.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:    p.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}

	if p.ContentID != nil {
		contentID := strconv.Itoa(*p.ContentID)
		m.ContentID = &contentID
	}

	// Convert categorized ratings
	if len(p.CategorizedRatings) > 0 {
		m.CategorizedRatings = make([]*model.CategorizedRating, len(p.CategorizedRatings))
		for i, cr := range p.CategorizedRatings {
			m.CategorizedRatings[i] = &model.CategorizedRating{
				Category: cr.Category,
				Rating:   cr.Rating,
			}
		}
	}

	// Convert feelings
	if len(p.Feelings) > 0 {
		m.Feelings = make([]*model.FeelingEntry, len(p.Feelings))
		for i, f := range p.Feelings {
			m.Feelings[i] = &model.FeelingEntry{
				Emoji:     f.Emoji,
				Label:     nilIfEmpty(f.Label),
				Intensity: f.Intensity,
				Note:      f.Note,
			}
		}
	}

	// Convert new perspective reference fields
	if p.PrimaryPerspectiveID != nil {
		ppID := strconv.Itoa(*p.PrimaryPerspectiveID)
		m.PrimaryPerspectiveID = &ppID
	}
	if len(p.RelatedPerspectiveIDs) > 0 {
		m.RelatedPerspectiveIDs = p.RelatedPerspectiveIDs
	}
	if len(p.CustomFields) > 0 {
		var customMap map[string]any
		if err := json.Unmarshal(p.CustomFields, &customMap); err == nil {
			m.CustomFields = customMap
		}
	}
	m.Review = p.Review

	return m
}

// modelToCreatePerspectiveInput converts a GraphQL CreatePerspectiveInput into the
// service-layer input, handling customFields JSON marshaling and categorized rating
// conversion. Keeps the CreatePerspective resolver free of field-by-field mapping —
// adding a new perspective field means touching this function (and its Update sibling
// below), not the resolver body.
func modelToCreatePerspectiveInput(userID int, input model.CreatePerspectiveInput) portservices.CreatePerspectiveInput {
	serviceInput := portservices.CreatePerspectiveInput{
		UserID:                userID,
		ContentID:             input.ContentID,
		Quality:               input.Quality,
		Agreement:             input.Agreement,
		Importance:            input.Importance,
		Confidence:            input.Confidence,
		Like:                  input.Like,
		Privacy:               input.Privacy,
		Description:           input.Description,
		Category:              input.Category,
		Parts:                 input.Parts,
		Labels:                input.Labels,
		CategorizedRatings:    categorizedRatingInputsToDomain(input.CategorizedRatings),
		Feelings:              feelingInputsToDomain(input.Feelings),
		PrimaryPerspectiveID:  input.PrimaryPerspectiveID,
		RelatedPerspectiveIDs: input.RelatedPerspectiveIDs,
		Review:                input.Review,
	}

	if input.CustomFields != nil {
		if data, err := json.Marshal(input.CustomFields); err == nil {
			serviceInput.CustomFields = data
		}
	}

	return serviceInput
}

// modelToUpdatePerspectiveInput converts a GraphQL UpdatePerspectiveInput into the
// service-layer input. See modelToCreatePerspectiveInput for why this mapping lives
// here instead of inline in the resolver.
func modelToUpdatePerspectiveInput(input model.UpdatePerspectiveInput) portservices.UpdatePerspectiveInput {
	serviceInput := portservices.UpdatePerspectiveInput{
		ID:                    input.ID,
		ContentID:             input.ContentID,
		Quality:               input.Quality,
		Agreement:             input.Agreement,
		Importance:            input.Importance,
		Confidence:            input.Confidence,
		Like:                  input.Like,
		Privacy:               input.Privacy,
		Description:           input.Description,
		Category:              input.Category,
		ReviewStatus:          input.ReviewStatus,
		Parts:                 input.Parts,
		Labels:                input.Labels,
		CategorizedRatings:    categorizedRatingInputsToDomain(input.CategorizedRatings),
		Feelings:              feelingInputsToDomain(input.Feelings),
		PrimaryPerspectiveID:  input.PrimaryPerspectiveID,
		RelatedPerspectiveIDs: input.RelatedPerspectiveIDs,
		Review:                input.Review,
	}

	if input.CustomFields != nil {
		if data, err := json.Marshal(input.CustomFields); err == nil {
			serviceInput.CustomFields = data
		}
	}

	return serviceInput
}

// categorizedRatingInputsToDomain converts GraphQL categorized rating inputs to their
// domain form. Returns nil (not an empty slice) for a nil/empty input, matching the
// original resolver behavior: an empty categorizedRatings array is indistinguishable
// from "not provided" and does not clear existing ratings on update.
func categorizedRatingInputsToDomain(ratings []*model.CategorizedRatingInput) []domain.CategorizedRating {
	if len(ratings) == 0 {
		return nil
	}
	out := make([]domain.CategorizedRating, len(ratings))
	for i, cr := range ratings {
		out[i] = domain.CategorizedRating{
			Category: cr.Category,
			Rating:   cr.Rating,
		}
	}
	return out
}

// feelingInputsToDomain converts GraphQL feeling inputs to their domain form.
// Returns nil (not an empty slice) for a nil/empty input, matching
// categorizedRatingInputsToDomain's "not provided" semantics on update.
func feelingInputsToDomain(feelings []*model.FeelingInput) []domain.FeelingEntry {
	if len(feelings) == 0 {
		return nil
	}
	out := make([]domain.FeelingEntry, len(feelings))
	for i, f := range feelings {
		label := ""
		if f.Label != nil {
			label = *f.Label
		}
		out[i] = domain.FeelingEntry{
			Emoji:     f.Emoji,
			Label:     label,
			Intensity: f.Intensity,
			Note:      f.Note,
		}
	}
	return out
}

// nilIfEmpty returns nil for an empty string, otherwise a pointer to it —
// used for optional GraphQL string fields backed by a non-pointer domain field.
func nilIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
