// Package server assembles the GraphQL API handler — the gqlgen server and the
// HTTP middleware chain in front of it — so cmd/server and the request-level
// tests (test/roundtrips) run exactly the same stack.
package server

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/handler/extension"
	"github.com/99designs/gqlgen/graphql/handler/lru"
	"github.com/99designs/gqlgen/graphql/handler/transport"
	coderws "github.com/coder/websocket"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/vektah/gqlparser/v2/ast"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/auth"
	graphqldl "github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/dataloader"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/directives"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/generated"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/resolvers"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/realtime"
	apimw "github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/web/middleware"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	gqltiming "github.com/CodeWarrior-debug/perspectize/backend/pkg/graphql"
	perfmw "github.com/CodeWarrior-debug/perspectize/backend/pkg/middleware"
)

// Deps is everything the API handler needs. Construction of the services and
// repositories (and background workers) stays with the caller.
type Deps struct {
	ContentService     portservices.ContentService
	UserService        portservices.UserService
	PerspectiveService portservices.PerspectiveService
	CategoryService    portservices.CategoryService
	MessagingService   portservices.MessagingService

	UserRepo   repositories.UserRepository
	ThreadRepo repositories.ThreadRepository

	Hub      *realtime.Hub
	Presence *realtime.PresenceTracker

	// TokenVerifier is shared by the HTTP middleware and the WebSocket
	// InitFunc so both transports resolve identities identically.
	TokenVerifier portservices.TokenVerifier

	CORSOrigins         []string
	RateLimitPerMin     int
	EnableIntrospection bool
}

// NewGraphQLServer builds the gqlgen server with directives, transports and
// extensions wired.
func NewGraphQLServer(d Deps) *handler.Server {
	resolver := resolvers.NewResolver(
		d.ContentService, d.UserService, d.PerspectiveService, d.CategoryService,
		d.MessagingService, d.Hub, d.Presence,
	)
	directiveRoot := directives.NewDirectiveRoot(d.ContentService, d.PerspectiveService)
	gqlConfig := generated.Config{
		Resolvers: resolver,
		Directives: generated.DirectiveRoot{
			Auth:  directiveRoot.Auth,
			Owner: directiveRoot.Owner,
		},
	}
	srv := handler.New(generated.NewExecutableSchema(gqlConfig))
	srv.AddTransport(transport.Options{})
	// WebSocket transport for GraphQL subscriptions. InitFunc authenticates the
	// connection from the graphql-ws connection_init payload, then starts a
	// presence session that marks the user ONLINE for the life of the socket
	// and OFFLINE a grace period after the last one closes.
	srv.AddTransport(transport.Websocket{
		// gqlgen v0.17.95's default WebsocketImplementation (coder/websocket)
		// rejects cross-origin upgrades unless told otherwise. Reuse the
		// configured CORS allowlist instead of same-origin-only.
		Implementation:        coderWebsocketImplementationFor(d.CORSOrigins),
		KeepAlivePingInterval: 10 * time.Second,
		InitFunc: func(ctx context.Context, initPayload transport.InitPayload) (context.Context, *transport.InitPayload, error) {
			token := initPayload.Authorization()
			if token == "" {
				if v, ok := initPayload["authToken"].(string); ok {
					token = v
				}
			}
			token = strings.TrimPrefix(token, "Bearer ")
			if token == "" {
				return ctx, nil, fmt.Errorf("unauthenticated websocket: missing token")
			}
			identity, err := d.TokenVerifier.Verify(ctx, token)
			if err != nil || identity.ClerkID == "" {
				return ctx, nil, fmt.Errorf("unauthenticated websocket: invalid token")
			}
			user, err := d.UserRepo.GetByClerkID(ctx, identity.ClerkID)
			if err != nil || user == nil {
				return ctx, nil, fmt.Errorf("unauthenticated websocket: unknown user")
			}
			authUser := &domain.AuthenticatedUser{
				ID:       user.ID,
				ClerkID:  identity.ClerkID,
				Username: user.Username,
				Email:    user.Email,
				Role:     user.Role,
			}
			go realtime.RunPresenceSession(ctx, d.Presence, d.Hub, d.ThreadRepo, user.ID, realtime.DefaultPresenceConfig())
			return auth.WithAuthenticatedUser(ctx, authUser), &initPayload, nil
		},
	})
	srv.AddTransport(transport.GET{})
	srv.AddTransport(transport.POST{})
	srv.AddTransport(transport.MultipartForm{})
	srv.SetQueryCache(lru.New[*ast.QueryDocument](1000))
	srv.Use(extension.AutomaticPersistedQuery{
		Cache: lru.New[string](100),
	})
	// C-04: Query complexity limit — reject expensive queries
	srv.Use(extension.FixedComplexityLimit(500))
	// C-10: Enable introspection only in non-production
	if d.EnableIntrospection {
		srv.Use(extension.Introspection{})
	}
	srv.AroundOperations(gqltiming.OperationTimer())
	return srv
}

// Middleware returns the API middleware stack, outermost first. Order
// matters: rate limit before auth to prevent DoS.
func Middleware(d Deps) []func(http.Handler) http.Handler {
	return []func(http.Handler) http.Handler{
		middleware.RequestID,
		middleware.RealIP,
		apimw.GlobalRateLimit(d.RateLimitPerMin), // H-11: rate limiting before auth
		cors.Handler(cors.Options{ // C-05: CORS restricted to config origins
			AllowedOrigins:   d.CORSOrigins,
			AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
			AllowedHeaders:   []string{"Content-Type", "Authorization"},
			AllowCredentials: true,
			MaxAge:           300,
		}),
		apimw.SecureHeaders(),       // M-14: security headers (HSTS, X-Content-Type-Options, X-Frame-Options)
		apimw.ContentTypeValidation, // M-15: CSRF protection via Content-Type
		auth.Middleware(d.UserRepo, d.TokenVerifier),
		graphqldl.Middleware(d.CategoryService, d.PerspectiveService), // per-request GraphQL dataloaders (batches Content.primaryCategory, Content.perspectiveCount/averageRating)
		perfmw.RequestTimer,                                           // structured request timing (replaces chi Logger)
		perfmw.Recoverer,                                              // structured panic recovery (JSON via slog)
	}
}

// coderWebsocketImplementationFor builds the coder/websocket-backed
// implementation gqlgen's transport.Websocket uses, honoring the same CORS
// allowlist as the HTTP transport. A bare "*" (the configured allow-all case)
// maps to InsecureSkipVerify, since coder/websocket's OriginPatterns
// deliberately doesn't accept "*" as a pattern (it wants InsecureSkipVerify
// used explicitly instead, to make an intentionally-open policy visible in
// the code). Anything else is passed through as an OriginPatterns entry —
// each pattern already matches "scheme://host" when it contains "://", which
// is exactly the shape our configured origins are in. The InitFunc still
// requires a valid token before any data flows regardless of origin.
func coderWebsocketImplementationFor(allowedOrigins []string) transport.CoderWebsocketImplementation {
	opts := coderws.AcceptOptions{}
	for _, allowed := range allowedOrigins {
		if allowed == "*" {
			opts.InsecureSkipVerify = true
			opts.OriginPatterns = nil
			break
		}
		opts.OriginPatterns = append(opts.OriginPatterns, allowed)
	}
	return transport.CoderWebsocketImplementation{AcceptOptions: opts}
}
