package auth

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	repositories "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	svixwebhook "github.com/svix/svix-webhooks/go"
)

// WebhookHandler processes Clerk webhook events for user synchronization.
type WebhookHandler struct {
	WebhookSecret string
	UserRepo      repositories.UserRepository
}

// clerkWebhookEvent represents the top-level Clerk webhook payload.
type clerkWebhookEvent struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

// clerkUserData represents user data from Clerk webhook events.
type clerkUserData struct {
	ID             string  `json:"id"`
	Username       *string `json:"username"`
	EmailAddresses []struct {
		ID           string `json:"id"`
		EmailAddress string `json:"email_address"`
	} `json:"email_addresses"`
	PrimaryEmailAddressID string `json:"primary_email_address_id"`
}

// primaryEmail extracts the primary email from Clerk user data.
func (d *clerkUserData) primaryEmail() string {
	for _, ea := range d.EmailAddresses {
		if ea.ID == d.PrimaryEmailAddressID {
			return ea.EmailAddress
		}
	}
	if len(d.EmailAddresses) > 0 {
		return d.EmailAddresses[0].EmailAddress
	}
	return ""
}

// username returns the username or falls back to email prefix.
func (d *clerkUserData) username() string {
	if d.Username != nil && *d.Username != "" {
		return *d.Username
	}
	email := d.primaryEmail()
	if email != "" {
		for i, c := range email {
			if c == '@' {
				return email[:i]
			}
		}
	}
	return d.ID
}

func (h *WebhookHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Read raw body FIRST — required for Svix signature verification
	body, err := io.ReadAll(r.Body)
	if err != nil {
		slog.Error("webhook: failed to read body", "error", err)
		http.Error(w, "failed to read body", http.StatusBadRequest)
		return
	}

	// Verify Svix signature
	wh, err := svixwebhook.NewWebhook(h.WebhookSecret)
	if err != nil {
		slog.Error("webhook: invalid webhook secret", "error", err)
		http.Error(w, "invalid webhook configuration", http.StatusInternalServerError)
		return
	}

	headers := http.Header{}
	headers.Set("svix-id", r.Header.Get("svix-id"))
	headers.Set("svix-timestamp", r.Header.Get("svix-timestamp"))
	headers.Set("svix-signature", r.Header.Get("svix-signature"))

	err = wh.Verify(body, headers)
	if err != nil {
		slog.Warn("webhook: signature verification failed", "error", err)
		http.Error(w, "invalid signature", http.StatusUnauthorized)
		return
	}

	// Parse event
	var event clerkWebhookEvent
	if err := json.Unmarshal(body, &event); err != nil {
		slog.Error("webhook: failed to parse event", "error", err)
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}

	// Parse user data
	var userData clerkUserData
	if err := json.Unmarshal(event.Data, &userData); err != nil {
		slog.Error("webhook: failed to parse user data", "error", err, "event_type", event.Type)
		http.Error(w, "invalid user data", http.StatusBadRequest)
		return
	}

	ctx := r.Context()

	switch event.Type {
	case "user.created":
		_, err = h.UserRepo.CreateFromClerk(ctx, userData.ID, userData.username(), userData.primaryEmail())
		if err != nil {
			slog.Error("webhook: failed to create user", "clerk_id", userData.ID, "error", err)
			http.Error(w, "failed to create user", http.StatusInternalServerError)
			return
		}
		slog.Info("webhook: user created", "clerk_id", userData.ID, "username", userData.username())

	case "user.updated":
		err = h.UserRepo.UpdateByClerkID(ctx, userData.ID, userData.username(), userData.primaryEmail())
		if err != nil {
			if errors.Is(err, domain.ErrNotFound) {
				slog.Warn("webhook: user not found for update, creating", "clerk_id", userData.ID)
				_, err = h.UserRepo.CreateFromClerk(ctx, userData.ID, userData.username(), userData.primaryEmail())
				if err != nil {
					slog.Error("webhook: failed to create user on update", "clerk_id", userData.ID, "error", err)
				}
			} else {
				slog.Error("webhook: failed to update user", "clerk_id", userData.ID, "error", err)
				http.Error(w, "failed to update user", http.StatusInternalServerError)
				return
			}
		}
		slog.Info("webhook: user updated", "clerk_id", userData.ID)

	case "user.deleted":
		err = h.UserRepo.DeactivateByClerkID(ctx, userData.ID)
		if err != nil && !errors.Is(err, domain.ErrNotFound) {
			slog.Error("webhook: failed to deactivate user", "clerk_id", userData.ID, "error", err)
			http.Error(w, "failed to deactivate user", http.StatusInternalServerError)
			return
		}
		slog.Info("webhook: user deactivated", "clerk_id", userData.ID)

	default:
		slog.Debug("webhook: ignoring event", "type", event.Type)
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`))
}
