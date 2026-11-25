package auth

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	repositories "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	svixwebhook "github.com/svix/svix-webhooks/go"
)

// WebhookHandler processes Clerk webhook events. Provisioning goes through the
// identity resolver, so a webhook for a user HTTP sign-in already created is
// a success, not an error.
type WebhookHandler struct {
	WebhookSecret string
	Resolver      portservices.IdentityResolver
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

// profile maps the webhook payload to the identity profile the resolver uses.
func (d *clerkUserData) profile() domain.ClerkProfile {
	p := domain.ClerkProfile{ClerkID: d.ID, PrimaryEmailID: d.PrimaryEmailAddressID}
	if d.Username != nil {
		p.Username = *d.Username
	}
	for _, ea := range d.EmailAddresses {
		p.Emails = append(p.Emails, domain.ClerkEmail{ID: ea.ID, Address: ea.EmailAddress})
	}
	return p
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
	profile := userData.profile()

	switch event.Type {
	case "user.created":
		if _, err := h.Resolver.Provision(ctx, profile); err != nil && !acknowledgeConflict(userData.ID, err) {
			http.Error(w, "failed to create user", http.StatusInternalServerError)
			return
		}
		slog.Info("webhook: user created", "clerk_id", userData.ID, "username", profile.LocalUsername())

	case "user.updated":
		err = h.UserRepo.UpdateByClerkID(ctx, userData.ID, profile.LocalUsername(), profile.PrimaryEmail())
		if errors.Is(err, domain.ErrNotFound) {
			slog.Warn("webhook: user not found for update, provisioning", "clerk_id", userData.ID)
			if _, err = h.Resolver.Provision(ctx, profile); err != nil && !acknowledgeConflict(userData.ID, err) {
				http.Error(w, "failed to create user on update", http.StatusInternalServerError)
				return
			}
		} else if err != nil {
			slog.Error("webhook: failed to update user", "clerk_id", userData.ID, "error", err)
			http.Error(w, "failed to update user", http.StatusInternalServerError)
			return
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

// acknowledgeConflict reports whether a failed provision may be answered with
// 200. A permanent conflict (a username or email that retrying cannot resolve)
// is acknowledged so Svix stops redelivering it. Anything else is transient and
// must be a 500 so Svix retries.
func acknowledgeConflict(clerkID string, err error) bool {
	if errors.Is(err, domain.ErrAlreadyExists) {
		slog.Error("webhook: identity conflict cannot be resolved, acknowledged so it is not redelivered",
			"clerk_id", clerkID, "error", err)
		return true
	}
	slog.Error("webhook: failed to provision user", "clerk_id", clerkID, "error", err)
	return false
}
