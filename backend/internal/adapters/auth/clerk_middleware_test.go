package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/clerk/clerk-sdk-go/v2"
	"github.com/clerk/clerk-sdk-go/v2/clerktest"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// stubUserRepo is a function-field test double for repositories.UserRepository.
// Only the fields a given test sets are exercised; unset methods return
// domain.ErrNotFound (or a zero value) so a test that accidentally hits an
// unexpected method fails loudly rather than silently succeeding.
type stubUserRepo struct {
	createFn              func(ctx context.Context, user *domain.User) (*domain.User, error)
	getByIDFn             func(ctx context.Context, id int) (*domain.User, error)
	getByClerkIDFn        func(ctx context.Context, clerkID string) (*domain.User, error)
	getByUsernameFn       func(ctx context.Context, username string) (*domain.User, error)
	getByEmailFn          func(ctx context.Context, email string) (*domain.User, error)
	listAllFn             func(ctx context.Context) ([]*domain.User, error)
	updateFn              func(ctx context.Context, user *domain.User) (*domain.User, error)
	deleteFn              func(ctx context.Context, id int) error
	createFromClerkFn     func(ctx context.Context, clerkID, username, email string) (*domain.User, error)
	updateByClerkIDFn     func(ctx context.Context, clerkID, username, email string) error
	deactivateByClerkIDFn func(ctx context.Context, clerkID string) error
}

func (s *stubUserRepo) Create(ctx context.Context, user *domain.User) (*domain.User, error) {
	if s.createFn != nil {
		return s.createFn(ctx, user)
	}
	return nil, domain.ErrNotFound
}
func (s *stubUserRepo) GetByID(ctx context.Context, id int) (*domain.User, error) {
	if s.getByIDFn != nil {
		return s.getByIDFn(ctx, id)
	}
	return nil, domain.ErrNotFound
}
func (s *stubUserRepo) GetByClerkID(ctx context.Context, clerkID string) (*domain.User, error) {
	if s.getByClerkIDFn != nil {
		return s.getByClerkIDFn(ctx, clerkID)
	}
	return nil, domain.ErrNotFound
}
func (s *stubUserRepo) GetByUsername(ctx context.Context, username string) (*domain.User, error) {
	if s.getByUsernameFn != nil {
		return s.getByUsernameFn(ctx, username)
	}
	return nil, domain.ErrNotFound
}
func (s *stubUserRepo) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	if s.getByEmailFn != nil {
		return s.getByEmailFn(ctx, email)
	}
	return nil, domain.ErrNotFound
}
func (s *stubUserRepo) ListAll(ctx context.Context) ([]*domain.User, error) {
	if s.listAllFn != nil {
		return s.listAllFn(ctx)
	}
	return nil, nil
}
func (s *stubUserRepo) Update(ctx context.Context, user *domain.User) (*domain.User, error) {
	if s.updateFn != nil {
		return s.updateFn(ctx, user)
	}
	return nil, domain.ErrNotFound
}
func (s *stubUserRepo) Delete(ctx context.Context, id int) error {
	if s.deleteFn != nil {
		return s.deleteFn(ctx, id)
	}
	return domain.ErrNotFound
}
func (s *stubUserRepo) CreateFromClerk(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
	if s.createFromClerkFn != nil {
		return s.createFromClerkFn(ctx, clerkID, username, email)
	}
	return nil, errors.New("CreateFromClerk not stubbed")
}
func (s *stubUserRepo) UpdateByClerkID(ctx context.Context, clerkID, username, email string) error {
	if s.updateByClerkIDFn != nil {
		return s.updateByClerkIDFn(ctx, clerkID, username, email)
	}
	return errors.New("UpdateByClerkID not stubbed")
}
func (s *stubUserRepo) DeactivateByClerkID(ctx context.Context, clerkID string) error {
	if s.deactivateByClerkIDFn != nil {
		return s.deactivateByClerkIDFn(ctx, clerkID)
	}
	return errors.New("DeactivateByClerkID not stubbed")
}
func (s *stubUserRepo) UpdateOnboarding(ctx context.Context, userID int, onboarding domain.UserOnboarding) (*domain.User, error) {
	return nil, errors.New("UpdateOnboarding not stubbed")
}

// setClerkAPIResponse points the package-level Clerk backend at a canned HTTP
// response so clerkuser.Get can be driven without network access. The previous
// backend is restored on test cleanup. Tests using this must not run in
// parallel — clerk.SetBackend is process-global.
func setClerkAPIResponse(t *testing.T, status int, body string) {
	t.Helper()
	previous := clerk.GetBackend()
	clerk.SetBackend(clerk.NewBackend(&clerk.BackendConfig{
		HTTPClient: &http.Client{Transport: &clerktest.RoundTripper{
			T:      t,
			Status: status,
			Out:    json.RawMessage(body),
		}},
	}))
	t.Cleanup(func() { clerk.SetBackend(previous) })
}

// runAuthHandler drives newAuthHandler with the given session subject (empty
// string = no Clerk session at all) and returns whichever AuthenticatedUser the
// handler injected into the downstream context, or nil.
func runAuthHandler(t *testing.T, repo *stubUserRepo, subject string) (*domain.AuthenticatedUser, bool) {
	t.Helper()

	var seen *domain.AuthenticatedUser
	var found bool
	var nextCalled bool

	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
		seen, found = ForContext(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/graphql", nil)
	if subject != "" {
		ctx := clerk.ContextWithSessionClaims(req.Context(), &clerk.SessionClaims{
			RegisteredClaims: clerk.RegisteredClaims{Subject: subject},
		})
		req = req.WithContext(ctx)
	}

	rec := httptest.NewRecorder()
	newAuthHandler(repo, NewClerkTokenVerifier(), next).ServeHTTP(rec, req)

	require.True(t, nextCalled, "the middleware must always call next (it is permissive)")
	assert.Equal(t, http.StatusOK, rec.Code)
	return seen, found
}

func TestNewAuthHandler_NoSessionClaimsPassesThroughUnauthenticated(t *testing.T) {
	user, ok := runAuthHandler(t, &stubUserRepo{}, "")
	assert.False(t, ok)
	assert.Nil(t, user)
}

func TestNewAuthHandler_ExistingLocalUserIsInjected(t *testing.T) {
	repo := &stubUserRepo{
		getByClerkIDFn: func(ctx context.Context, clerkID string) (*domain.User, error) {
			assert.Equal(t, "user_abc", clerkID)
			return &domain.User{
				ID: 7, ClerkUserID: "user_abc", Username: "alice",
				Email: "alice@example.com", Role: domain.UserRoleAdmin, Active: true,
			}, nil
		},
	}

	user, ok := runAuthHandler(t, repo, "user_abc")
	require.True(t, ok)
	require.NotNil(t, user)
	assert.Equal(t, 7, user.ID)
	assert.Equal(t, "user_abc", user.ClerkID)
	assert.Equal(t, "alice", user.Username)
	assert.Equal(t, "alice@example.com", user.Email)
	assert.Equal(t, domain.UserRoleAdmin, user.Role)
}

func TestNewAuthHandler_NonNotFoundLookupErrorPassesThroughUnauthenticated(t *testing.T) {
	repo := &stubUserRepo{
		getByClerkIDFn: func(ctx context.Context, clerkID string) (*domain.User, error) {
			return nil, errors.New("database unavailable")
		},
	}

	user, ok := runAuthHandler(t, repo, "user_abc")
	assert.False(t, ok)
	assert.Nil(t, user)
}

func TestNewAuthHandler_OnDemandCreation(t *testing.T) {
	notFound := func(ctx context.Context, clerkID string) (*domain.User, error) {
		return nil, domain.ErrNotFound
	}

	t.Run("uses the Clerk username and primary email", func(t *testing.T) {
		setClerkAPIResponse(t, http.StatusOK, `{
			"id": "user_abc",
			"username": "alice",
			"primary_email_address_id": "idn_2",
			"email_addresses": [
				{"id": "idn_1", "email_address": "old@example.com"},
				{"id": "idn_2", "email_address": "primary@example.com"}
			]
		}`)

		var gotClerkID, gotUsername, gotEmail string
		repo := &stubUserRepo{
			getByClerkIDFn: notFound,
			createFromClerkFn: func(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
				gotClerkID, gotUsername, gotEmail = clerkID, username, email
				return &domain.User{ID: 12, ClerkUserID: clerkID, Username: username, Email: email, Role: domain.UserRoleDefault, Active: true}, nil
			},
		}

		user, ok := runAuthHandler(t, repo, "user_abc")
		require.True(t, ok)
		require.NotNil(t, user)
		assert.Equal(t, "user_abc", gotClerkID)
		assert.Equal(t, "alice", gotUsername)
		assert.Equal(t, "primary@example.com", gotEmail, "the address matching primary_email_address_id must win")
		assert.Equal(t, 12, user.ID)
		assert.Equal(t, domain.UserRoleDefault, user.Role)
	})

	t.Run("falls back to the first email when no primary id is set", func(t *testing.T) {
		setClerkAPIResponse(t, http.StatusOK, `{
			"id": "user_abc",
			"username": "alice",
			"email_addresses": [{"id": "idn_1", "email_address": "first@example.com"}]
		}`)

		var gotEmail string
		repo := &stubUserRepo{
			getByClerkIDFn: notFound,
			createFromClerkFn: func(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
				gotEmail = email
				return &domain.User{ID: 13, ClerkUserID: clerkID, Username: username, Email: email}, nil
			},
		}

		_, ok := runAuthHandler(t, repo, "user_abc")
		require.True(t, ok)
		assert.Equal(t, "first@example.com", gotEmail)
	})

	t.Run("derives the username from the email prefix when Clerk has no username", func(t *testing.T) {
		setClerkAPIResponse(t, http.StatusOK, `{
			"id": "user_abc",
			"username": null,
			"primary_email_address_id": "idn_1",
			"email_addresses": [{"id": "idn_1", "email_address": "bob@example.com"}]
		}`)

		var gotUsername string
		repo := &stubUserRepo{
			getByClerkIDFn: notFound,
			createFromClerkFn: func(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
				gotUsername = username
				return &domain.User{ID: 14, ClerkUserID: clerkID, Username: username, Email: email}, nil
			},
		}

		_, ok := runAuthHandler(t, repo, "user_abc")
		require.True(t, ok)
		assert.Equal(t, "bob", gotUsername)
	})

	t.Run("falls back to the Clerk user id when there is neither username nor email", func(t *testing.T) {
		setClerkAPIResponse(t, http.StatusOK, `{"id": "user_abc", "username": null, "email_addresses": []}`)

		var gotUsername, gotEmail string
		repo := &stubUserRepo{
			getByClerkIDFn: notFound,
			createFromClerkFn: func(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
				gotUsername, gotEmail = username, email
				return &domain.User{ID: 15, ClerkUserID: clerkID, Username: username}, nil
			},
		}

		_, ok := runAuthHandler(t, repo, "user_abc")
		require.True(t, ok)
		assert.Equal(t, "user_abc", gotUsername)
		assert.Equal(t, "", gotEmail)
	})

	t.Run("passes through unauthenticated when the Clerk API lookup fails", func(t *testing.T) {
		setClerkAPIResponse(t, http.StatusNotFound, `{"errors":[{"message":"not found"}]}`)

		repo := &stubUserRepo{
			getByClerkIDFn: notFound,
			createFromClerkFn: func(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
				t.Fatal("CreateFromClerk must not be called when the Clerk API lookup fails")
				return nil, nil
			},
		}

		user, ok := runAuthHandler(t, repo, "user_abc")
		assert.False(t, ok)
		assert.Nil(t, user)
	})

	t.Run("passes through unauthenticated on a non-duplicate create failure", func(t *testing.T) {
		setClerkAPIResponse(t, http.StatusOK, `{
			"id": "user_abc", "username": "alice",
			"primary_email_address_id": "idn_1",
			"email_addresses": [{"id": "idn_1", "email_address": "alice@example.com"}]
		}`)

		repo := &stubUserRepo{
			getByClerkIDFn: notFound,
			createFromClerkFn: func(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
				return nil, errors.New("check constraint violated")
			},
		}

		user, ok := runAuthHandler(t, repo, "user_abc")
		assert.False(t, ok)
		assert.Nil(t, user)
	})
}

func TestNewAuthHandler_DuplicateEmailLinksClerkIDToExistingUser(t *testing.T) {
	clerkProfile := `{
		"id": "user_abc", "username": "alice",
		"primary_email_address_id": "idn_1",
		"email_addresses": [{"id": "idn_1", "email_address": "alice@example.com"}]
	}`
	notFound := func(ctx context.Context, clerkID string) (*domain.User, error) { return nil, domain.ErrNotFound }

	duplicateErrors := []struct {
		name string
		err  error
	}{
		{"unique_email constraint name", errors.New(`duplicate key value violates unique constraint "unique_email"`)},
		{"raw 23505 sqlstate", errors.New("ERROR: duplicate key value (SQLSTATE 23505)")},
	}

	for _, de := range duplicateErrors {
		t.Run("links on "+de.name, func(t *testing.T) {
			setClerkAPIResponse(t, http.StatusOK, clerkProfile)

			var updated *domain.User
			repo := &stubUserRepo{
				getByClerkIDFn: notFound,
				createFromClerkFn: func(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
					return nil, de.err
				},
				getByEmailFn: func(ctx context.Context, email string) (*domain.User, error) {
					assert.Equal(t, "alice@example.com", email)
					return &domain.User{ID: 3, Username: "alice", Email: email, Role: domain.UserRoleAdmin}, nil
				},
				updateFn: func(ctx context.Context, user *domain.User) (*domain.User, error) {
					updated = user
					return user, nil
				},
			}

			user, ok := runAuthHandler(t, repo, "user_abc")
			require.True(t, ok)
			require.NotNil(t, user)
			assert.Equal(t, 3, user.ID)
			assert.Equal(t, "user_abc", user.ClerkID)
			assert.Equal(t, domain.UserRoleAdmin, user.Role)
			require.NotNil(t, updated)
			assert.Equal(t, "user_abc", updated.ClerkUserID, "the existing row must have the Clerk id written onto it")
		})
	}

	t.Run("passes through unauthenticated when the email lookup fails", func(t *testing.T) {
		setClerkAPIResponse(t, http.StatusOK, clerkProfile)

		repo := &stubUserRepo{
			getByClerkIDFn: notFound,
			createFromClerkFn: func(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
				return nil, errors.New(`violates unique constraint "unique_email"`)
			},
			getByEmailFn: func(ctx context.Context, email string) (*domain.User, error) {
				return nil, errors.New("lookup failed")
			},
		}

		user, ok := runAuthHandler(t, repo, "user_abc")
		assert.False(t, ok)
		assert.Nil(t, user)
	})

	t.Run("passes through unauthenticated when the link update fails", func(t *testing.T) {
		setClerkAPIResponse(t, http.StatusOK, clerkProfile)

		repo := &stubUserRepo{
			getByClerkIDFn: notFound,
			createFromClerkFn: func(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
				return nil, errors.New(`violates unique constraint "unique_email"`)
			},
			getByEmailFn: func(ctx context.Context, email string) (*domain.User, error) {
				return &domain.User{ID: 3, Username: "alice", Email: email}, nil
			},
			updateFn: func(ctx context.Context, user *domain.User) (*domain.User, error) {
				return nil, errors.New("update failed")
			},
		}

		user, ok := runAuthHandler(t, repo, "user_abc")
		assert.False(t, ok)
		assert.Nil(t, user)
	})
}

func TestMiddleware_UnauthenticatedRequestPassesThrough(t *testing.T) {
	// Exercises the clerkhttp.WithHeaderAuthorization wiring in Middleware itself.
	// With no Authorization header, Clerk's middleware adds no session claims, so
	// our handler must fall through to next without touching the repository.
	var nextCalled bool
	var seen *domain.AuthenticatedUser
	var found bool

	handler := Middleware(&stubUserRepo{}, NewClerkTokenVerifier())(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
		seen, found = ForContext(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/graphql", nil))

	require.True(t, nextCalled)
	assert.Equal(t, http.StatusOK, rec.Code)
	assert.False(t, found)
	assert.Nil(t, seen)
}

func TestMiddleware_UnparseableBearerTokenPassesThrough(t *testing.T) {
	// jwt.Decode fails on a non-JWT bearer token; Clerk's middleware calls next
	// without claims rather than rejecting, so the request stays anonymous.
	var nextCalled bool
	var found bool

	handler := Middleware(&stubUserRepo{}, NewClerkTokenVerifier())(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
		_, found = ForContext(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/graphql", nil)
	req.Header.Set("Authorization", "Bearer not-a-jwt")

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	require.True(t, nextCalled)
	assert.Equal(t, http.StatusOK, rec.Code)
	assert.False(t, found)
}
