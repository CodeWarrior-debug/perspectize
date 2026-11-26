package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	svixwebhook "github.com/svix/svix-webhooks/go"
)

// testWebhookSecret is a throwaway secret generated fresh for each test run:
// "whsec_" + standard base64 of 24 random bytes, the shape svixwebhook.NewWebhook
// expects. Generated rather than hard-coded so no secret-shaped literal ever
// lives in the repo (GitHub secret scanning flags any whsec_ literal).
var testWebhookSecret = newTestWebhookSecret()

func newTestWebhookSecret() string {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		panic("generate test webhook secret: " + err.Error())
	}
	return "whsec_" + base64.StdEncoding.EncodeToString(b)
}

// signedWebhookRequest builds a POST carrying `body` with genuinely valid svix
// signature headers for testWebhookSecret.
func signedWebhookRequest(t *testing.T, body string) *http.Request {
	t.Helper()

	wh, err := svixwebhook.NewWebhook(testWebhookSecret)
	require.NoError(t, err)

	msgID := "msg_test_1"
	ts := time.Now()
	sig, err := wh.Sign(msgID, ts, []byte(body))
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/webhooks/clerk", strings.NewReader(body))
	req.Header.Set("svix-id", msgID)
	req.Header.Set("svix-timestamp", strconv.FormatInt(ts.Unix(), 10))
	req.Header.Set("svix-signature", sig)
	return req
}

func serveWebhook(t *testing.T, repo *stubUserRepo, secret string, req *http.Request) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	(&WebhookHandler{WebhookSecret: secret, Resolver: services.NewIdentityResolver(repo, noDirectory{t}), UserRepo: repo}).ServeHTTP(rec, req)
	return rec
}

// noDirectory fails the test if the webhook path reaches for the Clerk API: a
// webhook carries its own profile and must never call back to Clerk.
type noDirectory struct{ t *testing.T }

func (d noDirectory) Profile(context.Context, string) (domain.ClerkProfile, error) {
	d.t.Error("webhook must not call the Clerk API")
	return domain.ClerkProfile{}, domain.ErrNotFound
}

// --- signature and payload handling ---

func TestWebhookHandler_RejectsBadSignatures(t *testing.T) {
	body := `{"type":"user.created","data":{"id":"user_abc"}}`

	t.Run("missing svix headers yield 401", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/webhooks/clerk", strings.NewReader(body))
		rec := serveWebhook(t, &stubUserRepo{}, testWebhookSecret, req)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
		assert.Contains(t, rec.Body.String(), "invalid signature")
	})

	t.Run("tampered signature yields 401", func(t *testing.T) {
		req := signedWebhookRequest(t, body)
		req.Header.Set("svix-signature", "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
		rec := serveWebhook(t, &stubUserRepo{}, testWebhookSecret, req)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})

	t.Run("body tampered after signing yields 401", func(t *testing.T) {
		req := signedWebhookRequest(t, body)

		// Swap in a different body after the signature (computed for the
		// original `body`) has already been attached to the request headers.
		// The svix-id/svix-timestamp/svix-signature headers are left as-is,
		// so this proves the handler actually verifies the signature against
		// the body it reads, rather than trusting the headers alone.
		tamperedBody := `{"type":"user.deleted","data":{"id":"evil"}}`
		req.Body = io.NopCloser(strings.NewReader(tamperedBody))
		req.ContentLength = int64(len(tamperedBody))

		rec := serveWebhook(t, &stubUserRepo{}, testWebhookSecret, req)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})

	t.Run("stale timestamp outside the 5 minute tolerance yields 401", func(t *testing.T) {
		wh, err := svixwebhook.NewWebhook(testWebhookSecret)
		require.NoError(t, err)
		stale := time.Now().Add(-10 * time.Minute)
		sig, err := wh.Sign("msg_stale", stale, []byte(body))
		require.NoError(t, err)

		req := httptest.NewRequest(http.MethodPost, "/webhooks/clerk", strings.NewReader(body))
		req.Header.Set("svix-id", "msg_stale")
		req.Header.Set("svix-timestamp", strconv.FormatInt(stale.Unix(), 10))
		req.Header.Set("svix-signature", sig)

		rec := serveWebhook(t, &stubUserRepo{}, testWebhookSecret, req)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})
}

func TestWebhookHandler_EmptySecretYields500(t *testing.T) {
	req := signedWebhookRequest(t, `{"type":"user.created","data":{"id":"user_abc"}}`)
	rec := serveWebhook(t, &stubUserRepo{}, "", req)
	assert.Equal(t, http.StatusInternalServerError, rec.Code)
	assert.Contains(t, rec.Body.String(), "invalid webhook configuration")
}

func TestWebhookHandler_MalformedPayloadsYield400(t *testing.T) {
	t.Run("body is not valid JSON", func(t *testing.T) {
		rec := serveWebhook(t, &stubUserRepo{}, testWebhookSecret, signedWebhookRequest(t, `not json`))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
		assert.Contains(t, rec.Body.String(), "invalid payload")
	})

	t.Run("data field is absent", func(t *testing.T) {
		rec := serveWebhook(t, &stubUserRepo{}, testWebhookSecret, signedWebhookRequest(t, `{"type":"user.created"}`))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
		assert.Contains(t, rec.Body.String(), "invalid user data")
	})

	t.Run("data field is not an object", func(t *testing.T) {
		rec := serveWebhook(t, &stubUserRepo{}, testWebhookSecret, signedWebhookRequest(t, `{"type":"user.created","data":"nope"}`))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
		assert.Contains(t, rec.Body.String(), "invalid user data")
	})
}

// --- event dispatch ---

const createdEventBody = `{
	"type": "user.created",
	"data": {
		"id": "user_abc",
		"username": "alice",
		"primary_email_address_id": "idn_1",
		"email_addresses": [{"id": "idn_1", "email_address": "alice@example.com"}]
	}
}`

func TestWebhookHandler_UserCreated(t *testing.T) {
	t.Run("creates the local user and returns 200 with an ok body", func(t *testing.T) {
		var gotID, gotUsername, gotEmail string
		repo := &stubUserRepo{
			createFromClerkFn: func(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
				gotID, gotUsername, gotEmail = clerkID, username, email
				return &domain.User{ID: 1, ClerkUserID: clerkID, Username: username, Email: email}, nil
			},
		}

		rec := serveWebhook(t, repo, testWebhookSecret, signedWebhookRequest(t, createdEventBody))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.JSONEq(t, `{"status":"ok"}`, rec.Body.String())
		assert.Equal(t, "user_abc", gotID)
		assert.Equal(t, "alice", gotUsername)
		assert.Equal(t, "alice@example.com", gotEmail)
	})

	t.Run("derives the username from the email prefix when Clerk sends none", func(t *testing.T) {
		body := `{
			"type": "user.created",
			"data": {
				"id": "user_abc",
				"username": null,
				"primary_email_address_id": "idn_1",
				"email_addresses": [{"id": "idn_1", "email_address": "bob@example.com"}]
			}
		}`
		var gotUsername string
		repo := &stubUserRepo{
			createFromClerkFn: func(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
				gotUsername = username
				return &domain.User{ID: 1}, nil
			},
		}

		rec := serveWebhook(t, repo, testWebhookSecret, signedWebhookRequest(t, body))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, "bob", gotUsername)
	})

	t.Run("repository failure yields 500", func(t *testing.T) {
		repo := &stubUserRepo{
			createFromClerkFn: func(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
				return nil, errors.New("insert failed")
			},
		}

		rec := serveWebhook(t, repo, testWebhookSecret, signedWebhookRequest(t, createdEventBody))
		assert.Equal(t, http.StatusInternalServerError, rec.Code)
		assert.Contains(t, rec.Body.String(), "failed to create user")
	})
}

const updatedEventBody = `{
	"type": "user.updated",
	"data": {
		"id": "user_abc",
		"username": "alice2",
		"primary_email_address_id": "idn_1",
		"email_addresses": [{"id": "idn_1", "email_address": "alice2@example.com"}]
	}
}`

func TestWebhookHandler_UserUpdated(t *testing.T) {
	t.Run("updates the local user and returns 200", func(t *testing.T) {
		var gotID, gotUsername, gotEmail string
		repo := &stubUserRepo{
			updateByClerkIDFn: func(ctx context.Context, clerkID, username, email string) error {
				gotID, gotUsername, gotEmail = clerkID, username, email
				return nil
			},
		}

		rec := serveWebhook(t, repo, testWebhookSecret, signedWebhookRequest(t, updatedEventBody))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, "user_abc", gotID)
		assert.Equal(t, "alice2", gotUsername)
		assert.Equal(t, "alice2@example.com", gotEmail)
	})

	t.Run("ErrNotFound falls back to creating the user and still returns 200", func(t *testing.T) {
		createCalled := false
		repo := &stubUserRepo{
			updateByClerkIDFn: func(ctx context.Context, clerkID, username, email string) error {
				return domain.ErrNotFound
			},
			createFromClerkFn: func(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
				createCalled = true
				assert.Equal(t, "user_abc", clerkID)
				assert.Equal(t, "alice2", username)
				return &domain.User{ID: 1}, nil
			},
		}

		rec := serveWebhook(t, repo, testWebhookSecret, signedWebhookRequest(t, updatedEventBody))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.True(t, createCalled, "a missing user must be created on user.updated")
	})

	t.Run("ErrNotFound with a failing fallback create returns 500 so Svix retries", func(t *testing.T) {
		repo := &stubUserRepo{
			updateByClerkIDFn: func(ctx context.Context, clerkID, username, email string) error {
				return domain.ErrNotFound
			},
			createFromClerkFn: func(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
				return nil, errors.New("create failed")
			},
		}

		rec := serveWebhook(t, repo, testWebhookSecret, signedWebhookRequest(t, updatedEventBody))
		assert.Equal(t, http.StatusInternalServerError, rec.Code, "a transient fallback failure must be retried, not acknowledged")
	})

	t.Run("a non-ErrNotFound failure yields 500", func(t *testing.T) {
		repo := &stubUserRepo{
			updateByClerkIDFn: func(ctx context.Context, clerkID, username, email string) error {
				return errors.New("update failed")
			},
		}

		rec := serveWebhook(t, repo, testWebhookSecret, signedWebhookRequest(t, updatedEventBody))
		assert.Equal(t, http.StatusInternalServerError, rec.Code)
		assert.Contains(t, rec.Body.String(), "failed to update user")
	})

	t.Run("a wrapped ErrNotFound still falls back to creating the user and returns 200", func(t *testing.T) {
		// The dispatch must use errors.Is, not a raw
		// == comparison, so a repository that wraps the sentinel (e.g.
		// fmt.Errorf("update by clerk id: %w", domain.ErrNotFound)) still
		// triggers the fallback instead of falling into the generic 500 path.
		createCalled := false
		repo := &stubUserRepo{
			updateByClerkIDFn: func(ctx context.Context, clerkID, username, email string) error {
				return fmt.Errorf("update by clerk id: %w", domain.ErrNotFound)
			},
			createFromClerkFn: func(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
				createCalled = true
				return &domain.User{ID: 1}, nil
			},
		}

		rec := serveWebhook(t, repo, testWebhookSecret, signedWebhookRequest(t, updatedEventBody))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.True(t, createCalled, "a wrapped ErrNotFound must still trigger the create fallback")
	})
}

const deletedEventBody = `{"type":"user.deleted","data":{"id":"user_abc"}}`

func TestWebhookHandler_UserDeleted(t *testing.T) {
	t.Run("deactivates the local user and returns 200", func(t *testing.T) {
		var gotID string
		repo := &stubUserRepo{
			deactivateByClerkIDFn: func(ctx context.Context, clerkID string) error {
				gotID = clerkID
				return nil
			},
		}

		rec := serveWebhook(t, repo, testWebhookSecret, signedWebhookRequest(t, deletedEventBody))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, "user_abc", gotID)
	})

	t.Run("ErrNotFound is tolerated and returns 200", func(t *testing.T) {
		repo := &stubUserRepo{
			deactivateByClerkIDFn: func(ctx context.Context, clerkID string) error {
				return domain.ErrNotFound
			},
		}

		rec := serveWebhook(t, repo, testWebhookSecret, signedWebhookRequest(t, deletedEventBody))
		assert.Equal(t, http.StatusOK, rec.Code)
	})

	t.Run("any other failure yields 500", func(t *testing.T) {
		repo := &stubUserRepo{
			deactivateByClerkIDFn: func(ctx context.Context, clerkID string) error {
				return errors.New("deactivate failed")
			},
		}

		rec := serveWebhook(t, repo, testWebhookSecret, signedWebhookRequest(t, deletedEventBody))
		assert.Equal(t, http.StatusInternalServerError, rec.Code)
		assert.Contains(t, rec.Body.String(), "failed to deactivate user")
	})

	t.Run("a wrapped ErrNotFound is tolerated and returns 200", func(t *testing.T) {
		// Same errors.Is requirement for the
		// user.deleted tolerance branch.
		repo := &stubUserRepo{
			deactivateByClerkIDFn: func(ctx context.Context, clerkID string) error {
				return fmt.Errorf("deactivate by clerk id: %w", domain.ErrNotFound)
			},
		}

		rec := serveWebhook(t, repo, testWebhookSecret, signedWebhookRequest(t, deletedEventBody))
		assert.Equal(t, http.StatusOK, rec.Code)
	})
}

func TestWebhookHandler_UnknownEventTypeIsIgnored(t *testing.T) {
	body := `{"type":"session.created","data":{"id":"sess_1"}}`
	// No repository functions are stubbed: any repo call would return the
	// "not stubbed" error and change the status code, so a 200 proves the
	// handler ignored the event entirely.
	rec := serveWebhook(t, &stubUserRepo{}, testWebhookSecret, signedWebhookRequest(t, body))
	assert.Equal(t, http.StatusOK, rec.Code)
	assert.JSONEq(t, `{"status":"ok"}`, rec.Body.String())
}
