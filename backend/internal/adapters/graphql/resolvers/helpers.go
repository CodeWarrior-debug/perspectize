package resolvers

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/model"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
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

// ---- Messaging mappers ----

// subscriptionBuffer bounds each GraphQL subscription's outbound queue. It
// matches the hub's per-subscriber buffer so neither side is the sole
// bottleneck.
const subscriptionBuffer = 64

// defaultPageSize / maxPageSize bound messaging list and history queries.
const (
	defaultPageSize = 50
	maxPageSize     = 100
)

// pageLimit normalises an optional `first` argument into a bounded page size.
func pageLimit(first *int) int {
	if first == nil || *first <= 0 {
		return defaultPageSize
	}
	if *first > maxPageSize {
		return maxPageSize
	}
	return *first
}

// lastReadSeqFor returns the actor's read pointer within a thread aggregate,
// or 0 when the aggregate or the actor's row is absent.
func lastReadSeqFor(t *domain.MessageThread, userID int) int64 {
	if t == nil {
		return 0
	}
	for _, p := range t.Participants {
		if p.UserID == userID {
			return p.LastReadSeq
		}
	}
	return 0
}

// messageThreadToModel projects a domain thread onto its GraphQL model,
// retaining a copy of the domain aggregate in Src for the participant /
// read-pointer field resolvers.
func messageThreadToModel(t *domain.MessageThread) *model.MessageThread {
	if t == nil {
		return nil
	}
	src := *t
	out := &model.MessageThread{
		ID:            strconv.Itoa(t.ID),
		Title:         t.Title,
		LastMessageAt: t.LastMessageAt.Format(time.RFC3339),
		CreatedAt:     t.CreatedAt.Format(time.RFC3339),
		Src:           &src,
	}
	// Share per-thread lookups (latestSeq) across this thread's field resolvers.
	out.EnableMemo()
	return out
}

// latestSeqOf resolves a thread's highest message seq once per projected thread
// object, using the trusted (no re-authorization) service call: the query that
// produced the object already checked participation.
func (r *Resolver) latestSeqOf(ctx context.Context, obj *model.MessageThread) (int64, error) {
	return obj.ResolveLatestSeq(func() (int64, error) {
		tid, err := parseIntID("id", obj.ID)
		if err != nil {
			return 0, err
		}
		return r.Messaging.ThreadMaxSeq(ctx, tid)
	})
}

// threadParticipantToModel projects a domain participant row onto its GraphQL
// model. The user is resolved lazily by threadParticipantResolver.User.
func threadParticipantToModel(p domain.ThreadParticipant) *model.ThreadParticipant {
	return &model.ThreadParticipant{
		Role:        p.Role,
		LastReadSeq: int(p.LastReadSeq),
		JoinedAt:    p.JoinedAt.Format(time.RFC3339),
		SrcUserID:   p.UserID,
	}
}

// messageToModel projects a domain message onto its GraphQL model. The sender
// is resolved lazily by messageResolver.Sender.
func messageToModel(m domain.Message) *model.Message {
	return &model.Message{
		ID:          strconv.FormatInt(m.ID, 10),
		ThreadID:    strconv.Itoa(m.ThreadID),
		Seq:         int(m.Seq),
		Body:        m.Body,
		CreatedAt:   m.CreatedAt.Format(time.RFC3339),
		EditedAt:    rfc3339Ptr(m.EditedAt),
		DeletedAt:   rfc3339Ptr(m.DeletedAt),
		SrcSenderID: m.SenderID,
	}
}

// rfc3339Ptr formats an optional timestamp as an RFC3339 string pointer,
// preserving nil so an unset editedAt/deletedAt marshals as GraphQL null.
func rfc3339Ptr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.Format(time.RFC3339)
	return &s
}

// inboxEventToModel projects a domain inbox event onto its GraphQL model.
func inboxEventToModel(e domain.InboxEvent) *model.InboxEvent {
	return &model.InboxEvent{
		ThreadID:      strconv.Itoa(e.ThreadID),
		LastMessageAt: e.LastMessageAt.Format(time.RFC3339),
		LatestSeq:     int(e.LatestSeq),
		UnreadCount:   e.UnreadCount,
	}
}

// toModelThreadEvent maps a domain thread event onto the GraphQL ThreadEvent
// union. An unrecognized variant yields nil, which the caller drops.
func toModelThreadEvent(evt domain.ThreadEvent) model.ThreadEvent {
	switch e := evt.(type) {
	case domain.MessagePostedEvent:
		return model.MessagePosted{Message: messageToModel(e.Message)}
	case domain.MessageEditedEvent:
		return model.MessageEdited{Message: messageToModel(e.Message)}
	case domain.MessageDeletedEvent:
		return model.MessageDeleted{
			ThreadID:  strconv.Itoa(e.ThreadID),
			MessageID: strconv.FormatInt(e.MessageID, 10),
			Seq:       int(e.Seq),
		}
	case domain.ReadReceiptChangedEvent:
		return model.ReadReceiptChanged{
			ThreadID:    strconv.Itoa(e.ThreadID),
			UserID:      strconv.Itoa(e.UserID),
			LastReadSeq: int(e.LastReadSeq),
		}
	case domain.TypingChangedEvent:
		return model.TypingChanged{
			ThreadID: strconv.Itoa(e.ThreadID),
			UserID:   strconv.Itoa(e.UserID),
			Typing:   e.Typing,
		}
	case domain.ParticipantChangedEvent:
		// e.Change is a bare string on the envelope; an unexpected value would
		// marshal to a GraphQL-invalid enum, so drop the event instead.
		kind := model.ParticipantChangeKind(e.Change)
		if !kind.IsValid() {
			slog.Warn("graphql: dropping participant event with invalid change kind",
				"change", e.Change, "thread_id", e.ThreadID)
			return nil
		}
		return model.ParticipantChanged{
			ThreadID: strconv.Itoa(e.ThreadID),
			UserID:   strconv.Itoa(e.UserID),
			Change:   kind,
		}
	case domain.PresenceChangedEvent:
		return model.PresenceChanged{
			ThreadID: strconv.Itoa(e.ThreadID),
			UserID:   strconv.Itoa(e.UserID),
			State:    e.State,
		}
	case domain.StreamResetEvent:
		return model.StreamReset{ThreadID: strconv.Itoa(e.ThreadID)}
	default:
		slog.Warn("graphql: unmapped domain thread event", "type", fmt.Sprintf("%T", evt))
		return nil
	}
}

// parseIntID parses a GraphQL ID! argument into an int, wrapping failures as
// domain.ErrInvalidInput so the transport surfaces a client error.
func parseIntID(field, raw string) (int, error) {
	v, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("%w: %s must be a numeric id", domain.ErrInvalidInput, field)
	}
	return v, nil
}
