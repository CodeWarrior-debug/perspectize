package auth

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	repositories "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/demo"
	clerkhttp "github.com/clerk/clerk-sdk-go/v2/http"
	clerkuser "github.com/clerk/clerk-sdk-go/v2/user"
)

// Middleware verifies Clerk Bearer tokens and resolves local users.
// Permissive: unauthenticated requests pass through for public queries.
func Middleware(userRepo repositories.UserRepository, verifier portservices.TokenVerifier) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		// Wrap with Clerk's JWT verification middleware
		return clerkhttp.WithHeaderAuthorization()(newAuthHandler(userRepo, verifier, next))
	}
}

// newAuthHandler resolves the Clerk session claims already present on the
// request context into a local user and injects it as a domain.AuthenticatedUser.
//
// It is deliberately split out of Middleware so the user-resolution branches
// (on-demand creation, email-based Clerk-ID linking, and every failure path)
// can be driven directly in tests via clerk.ContextWithSessionClaims, without
// needing a signed Clerk JWT and a live JWKS endpoint.
//
// Every failure path is permissive: it calls next unauthenticated rather than
// rejecting the request, so public queries keep working.
func newAuthHandler(userRepo repositories.UserRepository, verifier portservices.TokenVerifier, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Clerk-verified requests already carry session claims on the context,
		// which the Clerk verifier prefers; the raw bearer token is passed for
		// verifiers that resolve it themselves (demo mode's "demo.<persona>").
		id, err := verifier.Verify(r.Context(), bearerToken(r))
		if err != nil || id.ClerkID == "" {
			// No valid session — pass through as unauthenticated
			next.ServeHTTP(w, r)
			return
		}

		// Resolve Clerk user ID to local user
		clerkUserID := id.ClerkID
		user, err := userRepo.GetByClerkID(r.Context(), clerkUserID)
		if err != nil {
			if errors.Is(err, domain.ErrNotFound) && demo.IsDemoClerkID(clerkUserID) {
				// Demo personas exist only once seeded (cmd/seed-demo); they
				// have no Clerk profile to fetch, so never create them on demand.
				slog.Warn("demo persona not seeded")
				next.ServeHTTP(w, r)
				return
			}
			if errors.Is(err, domain.ErrNotFound) {
				// On-demand creation: webhook may not have fired yet
				clerkUsr, fetchErr := clerkuser.Get(r.Context(), clerkUserID)
				if fetchErr != nil {
					slog.Warn("clerk user not found via API",
						"error", fetchErr,
					)
					next.ServeHTTP(w, r)
					return
				}

				// Extract username and email from Clerk profile
				username := ""
				if clerkUsr.Username != nil {
					username = *clerkUsr.Username
				}
				email := ""
				if len(clerkUsr.EmailAddresses) > 0 {
					for _, ea := range clerkUsr.EmailAddresses {
						if clerkUsr.PrimaryEmailAddressID != nil && ea.ID == *clerkUsr.PrimaryEmailAddressID {
							email = ea.EmailAddress
							break
						}
					}
					if email == "" {
						email = clerkUsr.EmailAddresses[0].EmailAddress
					}
				}
				if username == "" {
					// Fall back to email prefix
					for i, c := range email {
						if c == '@' {
							username = email[:i]
							break
						}
					}
					if username == "" {
						username = clerkUserID
					}
				}

				localUser, createErr := userRepo.CreateFromClerk(r.Context(), clerkUserID, username, email)
				if createErr != nil {
					// Duplicate email: pre-existing user has this email but no clerk_user_id.
					// Link the Clerk identity to the existing user.
					if strings.Contains(createErr.Error(), "unique_email") || strings.Contains(createErr.Error(), "23505") {
						existing, linkErr := userRepo.GetByEmail(r.Context(), email)
						if linkErr == nil {
							existing.ClerkUserID = clerkUserID
							linked, updErr := userRepo.Update(r.Context(), existing)
							if updErr == nil {
								slog.Info("linked clerk ID to existing user by email",
									"local_user_id", existing.ID,
								)
								user = linked
							} else {
								slog.Error("failed to link clerk ID to existing user",
									"error", updErr,
								)
								next.ServeHTTP(w, r)
								return
							}
						} else {
							slog.Error("failed to find existing user by email for linking",
								"email", email,
								"error", linkErr,
							)
							next.ServeHTTP(w, r)
							return
						}
					} else {
						slog.Error("failed to create user on-demand",
							"error", createErr,
						)
						next.ServeHTTP(w, r)
						return
					}
				} else {
					slog.Info("on-demand user creation",
						"local_user_id", localUser.ID,
					)
					user = localUser
				}
			} else {
				slog.Error("failed to lookup user by clerk ID",
					"error", err,
				)
				next.ServeHTTP(w, r)
				return
			}
		}

		// Inject authenticated user into context
		authUser := &domain.AuthenticatedUser{
			ID:       user.ID,
			ClerkID:  user.ClerkUserID,
			Username: user.Username,
			Email:    user.Email,
			Role:     user.Role,
		}
		ctx := withUser(r.Context(), authUser)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// bearerToken returns the token from an "Authorization: Bearer <token>"
// header, or "" when absent.
func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if len(h) > 7 && strings.EqualFold(h[:7], "Bearer ") {
		return strings.TrimSpace(h[7:])
	}
	return ""
}
