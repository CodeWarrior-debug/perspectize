package main

import (
	"context"
	"fmt"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/handler/extension"
	"github.com/99designs/gqlgen/graphql/handler/lru"
	"github.com/99designs/gqlgen/graphql/handler/transport"
	"github.com/99designs/gqlgen/graphql/playground"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/auth"
	graphqldl "github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/dataloader"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/directives"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/generated"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/resolvers"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/realtime"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/repositories/postgres"
	apimw "github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/web/middleware"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/wikidata"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/youtube"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/config"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/CodeWarrior-debug/perspectize/backend/pkg/database"
	gqltiming "github.com/CodeWarrior-debug/perspectize/backend/pkg/graphql"
	"github.com/CodeWarrior-debug/perspectize/backend/pkg/logger"
	perfmw "github.com/CodeWarrior-debug/perspectize/backend/pkg/middleware"
	"github.com/clerk/clerk-sdk-go/v2"
	coderws "github.com/coder/websocket"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/joho/godotenv"
	"github.com/vektah/gqlparser/v2/ast"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

func main() {
	// Configure structured JSON logging for Sevalla log viewer
	logger.Setup()

	// Initialize OTel tracing when OTEL_EXPORTER_OTLP_ENDPOINT is set.
	// The OTLP HTTP exporter reads OTEL_EXPORTER_OTLP_ENDPOINT,
	// OTEL_EXPORTER_OTLP_HEADERS, and OTEL_SERVICE_NAME automatically.
	if os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT") != "" {
		shutdown, err := initTracer(context.Background())
		if err != nil {
			slog.Warn("failed to initialize OpenTelemetry", "error", err)
		} else {
			defer shutdown(context.Background())
			slog.Info("OpenTelemetry tracing enabled")
		}
	}

	// Load .env file
	if err := godotenv.Load(); err != nil {
		if os.Getenv("APP_ENV") != "production" {
			slog.Warn(".env file not found", "hint", "set APP_ENV=production to suppress")
		}
	}

	// Load config (path from env or default)
	configPath := os.Getenv("CONFIG_PATH")
	if configPath == "" {
		configPath = "config/config.example.json"
	}
	cfg, err := config.Load(configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Validate DATABASE_URL if set
	if dbURL := os.Getenv("DATABASE_URL"); dbURL != "" {
		if err := config.ValidateDatabaseURL(dbURL); err != nil {
			log.Fatalf("Invalid DATABASE_URL: %v", err)
		}
	}

	dsn := cfg.Database.GetDSN()

	// Mask credentials in log output
	if os.Getenv("DATABASE_URL") != "" {
		slog.Info("connecting to database using DATABASE_URL")
	} else {
		slog.Info("connecting to database", "host", cfg.Database.Host, "port", cfg.Database.Port, "name", cfg.Database.Name)
	}

	// Connect to database with configurable pool
	poolCfg := database.PoolConfigFromEnv()
	db, err := database.ConnectGORM(dsn, poolCfg)
	if err != nil {
		log.Fatalf("Failed to connect to database %s: %v", config.SanitizeDSN(dsn), err)
	}
	sqlDB, _ := db.DB()
	defer sqlDB.Close()

	// Register slow query logger (logs queries >100ms)
	database.RegisterSlowQueryLogger(db)

	// Test connection
	if err := database.PingGORM(context.Background(), db); err != nil {
		log.Fatalf("Database ping failed for %s: %v", config.SanitizeDSN(dsn), err)
	}

	slog.Info("successfully connected to database")

	// Quick query to verify
	var version string
	if err := db.Raw("SELECT version()").Scan(&version).Error; err != nil {
		log.Fatalf("Failed to query database: %v", err)
	}
	slog.Info("PostgreSQL version", "version", version)

	// Validate YouTube API key
	if cfg.YouTube.APIKey == "" {
		slog.Warn("YOUTUBE_API_KEY is empty — YouTube metadata fetching will fail")
	}

	// Load security config
	secCfg := config.LoadSecurity()

	// Initialize Clerk SDK
	if secCfg.ClerkSecretKey != "" {
		clerk.SetKey(secCfg.ClerkSecretKey)
		slog.Info("Clerk SDK initialized")
	}

	// Initialize adapters
	// Wrap the raw YouTube client with an in-memory TTL cache to avoid
	// re-spending API quota on repeat lookups of the same video. TTL is
	// configurable via YOUTUBE_API_CACHE_TTL_SECONDS (default 6 hours).
	youtubeClient := youtube.NewCachingClient(
		youtube.NewClient(cfg.YouTube.APIKey),
		time.Duration(cfg.YouTube.CacheTTLSeconds)*time.Second,
	)
	slog.Info("YouTube API cache configured", "ttlSeconds", cfg.YouTube.CacheTTLSeconds)
	wikidataClient := wikidata.NewClient()
	contentRepo := postgres.NewGormContentRepository(db)
	userRepo := postgres.NewGormUserRepository(db)
	perspectiveRepo := postgres.NewGormPerspectiveRepository(db)
	categoryRepo := postgres.NewGormCategoryRepository(db)
	threadRepo := postgres.NewGormThreadRepository(db)
	messageRepo := postgres.NewGormMessageRepository(db)

	// Initialize services
	contentService := services.NewContentService(contentRepo, youtubeClient)
	userService := services.NewUserService(userRepo, contentRepo, perspectiveRepo)
	perspectiveService := services.NewPerspectiveService(perspectiveRepo, userRepo)
	categoryService := services.NewCategoryService(categoryRepo, contentRepo, wikidataClient)

	// Messaging realtime plumbing: the hub fans events out in-process, the
	// listener feeds it from Postgres NOTIFY, the presence tracker records who
	// is connected (its connection lifecycle is wired from the WebSocket
	// InitFunc via realtime.RunPresenceSession).
	// The notifier lets the hub publish ephemeral events over pg_notify so every
	// instance (this one included, via its own Listener) delivers them.
	notifier, err := realtime.NewPgNotifier(context.Background(), dsn)
	if err != nil {
		log.Fatalf("Failed to create realtime notifier: %v", err)
	}
	defer notifier.Close()

	hub := realtime.NewHub(messageRepo, threadRepo, notifier)
	presence := realtime.NewPresenceTracker()
	limiter := services.NewSlidingWindowLimiter(10, 10*time.Second)
	messagingService := services.NewMessagingService(threadRepo, messageRepo, hub, limiter)

	listener := realtime.NewListener(dsn, hub)
	listenerCtx, stopListener := context.WithCancel(context.Background())
	go listener.Run(listenerCtx)
	defer stopListener()

	// Application-side message retention sweep. Disabled unless
	// MESSAGE_RETENTION_MAX is a positive value — since migration 000018 the
	// database no longer prunes messages itself, so this is the only pruner.
	if cfg.MessageRetentionMax > 0 {
		sweeper := services.NewRetentionSweeper(
			db, cfg.MessageRetentionMax,
			time.Duration(cfg.MessageRetentionSweepMinutes)*time.Minute,
		)
		go sweeper.Run(listenerCtx)
		slog.Info("message retention sweep enabled",
			"max_per_thread", cfg.MessageRetentionMax,
			"interval_minutes", cfg.MessageRetentionSweepMinutes)
	}

	// Shared Clerk token verifier — reused by HTTP middleware and the
	// WebSocket InitFunc so both transports resolve identities identically.
	tokenVerifier := auth.NewClerkTokenVerifier()

	// Initialize GraphQL with directive wiring
	resolver := resolvers.NewResolver(
		contentService, userService, perspectiveService, categoryService,
		messagingService, hub, presence,
	)
	directiveRoot := directives.NewDirectiveRoot(contentService, perspectiveService)
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
		Implementation:        coderWebsocketImplementationFor(secCfg.CORSOrigins),
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
			identity, err := tokenVerifier.Verify(ctx, token)
			if err != nil || identity.ClerkID == "" {
				return ctx, nil, fmt.Errorf("unauthenticated websocket: invalid token")
			}
			user, err := userRepo.GetByClerkID(ctx, identity.ClerkID)
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
			go realtime.RunPresenceSession(ctx, presence, hub, threadRepo, user.ID, realtime.DefaultPresenceConfig())
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
	if os.Getenv("APP_ENV") != "production" {
		srv.Use(extension.Introspection{})
	}
	srv.AroundOperations(gqltiming.OperationTimer())

	// Setup chi router
	r := chi.NewRouter()

	// Middleware stack (order matters: rate limit before auth to prevent DoS)
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(apimw.GlobalRateLimit(secCfg.RateLimitPerMin)) // H-11: rate limiting before auth
	r.Use(cors.Handler(cors.Options{                     // C-05: CORS restricted to config origins
		AllowedOrigins:   secCfg.CORSOrigins,
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization"},
		AllowCredentials: true,
		MaxAge:           300,
	}))
	r.Use(apimw.SecureHeaders())       // M-14: security headers (HSTS, X-Content-Type-Options, X-Frame-Options)
	r.Use(apimw.ContentTypeValidation) // M-15: CSRF protection via Content-Type
	r.Use(auth.Middleware(userRepo, tokenVerifier))
	r.Use(graphqldl.Middleware(categoryService)) // per-request GraphQL dataloaders (batches Content.primaryCategory)
	r.Use(perfmw.RequestTimer)                   // structured request timing (replaces chi Logger)
	r.Use(perfmw.Recoverer)                      // structured panic recovery (JSON via slog)

	// Webhook routes — skip auth middleware; Svix signature provides verification
	webhookSecret := os.Getenv("CLERK_WEBHOOK_SIGNING_SECRET")
	if webhookSecret != "" {
		webhookHandler := &auth.WebhookHandler{
			WebhookSecret: webhookSecret,
			UserRepo:      userRepo,
		}
		r.Post("/webhooks/clerk", webhookHandler.ServeHTTP)
		slog.Info("Clerk webhook endpoint registered")
	}

	// Health check — liveness probe (M-10)
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	// Ready check — readiness probe with DB ping (M-10)
	r.Get("/ready", func(w http.ResponseWriter, r *http.Request) {
		sqlDB, err := db.DB()
		if err != nil || sqlDB.PingContext(r.Context()) != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			w.Write([]byte("not ready: database unreachable"))
			return
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ready"))
	})

	// GraphQL. The wrapper clears the per-request I/O deadlines for WebSocket
	// upgrades so long-lived subscriptions are not killed by the server's
	// Read/WriteTimeout.
	r.Handle("/graphql", clearDeadlinesForWebsocket(srv))
	if os.Getenv("APP_ENV") != "production" {
		r.Handle("/", playground.Handler("GraphQL Playground", "/graphql"))
		r.Get("/debug/db-stats", database.StatsHandler(sqlDB))
	}

	// Start server with timeouts
	addr := fmt.Sprintf(":%d", cfg.Server.Port)
	server := &http.Server{
		Addr:         addr,
		Handler:      r, // chi router
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan
		slog.Info("shutting down gracefully")
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := server.Shutdown(ctx); err != nil {
			slog.Error("shutdown failed", "error", err)
		}
	}()

	slog.Info("server running", "addr", addr)
	if os.Getenv("APP_ENV") != "production" {
		slog.Info("GraphQL Playground available", "url", fmt.Sprintf("http://localhost%s/", addr))
	}
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Failed to start server: %v", err)
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

// clearDeadlinesForWebsocket removes the connection deadlines that
// http.Server stamps from ReadTimeout/WriteTimeout before the handler runs.
// Those deadlines survive the WebSocket hijack and would otherwise terminate
// every subscription after WriteTimeout elapses. Plain HTTP requests are
// untouched and keep their timeouts.
func clearDeadlinesForWebsocket(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isWebsocketHandshake(r) {
			rc := http.NewResponseController(w)
			if err := rc.SetReadDeadline(time.Time{}); err != nil {
				slog.Warn("could not clear websocket read deadline", "error", err)
			}
			if err := rc.SetWriteDeadline(time.Time{}); err != nil {
				slog.Warn("could not clear websocket write deadline", "error", err)
			}
		}
		next.ServeHTTP(w, r)
	})
}

// isWebsocketHandshake reports whether r is a genuine RFC 6455 upgrade request.
// All three conditions are required: a lone spoofed `Upgrade: websocket` header
// on a POST would otherwise strip that request's deadlines and give an attacker
// an unbounded-duration /graphql call. A real handshake is always a GET with
// `Connection: Upgrade` and a client-generated Sec-WebSocket-Key.
func isWebsocketHandshake(r *http.Request) bool {
	return r.Method == http.MethodGet &&
		strings.EqualFold(r.Header.Get("Upgrade"), "websocket") &&
		strings.Contains(strings.ToLower(r.Header.Get("Connection")), "upgrade") &&
		r.Header.Get("Sec-WebSocket-Key") != ""
}

// initTracer sets up an OTel TracerProvider with an OTLP HTTP exporter.
// Returns a shutdown function that flushes pending spans on exit.
func initTracer(ctx context.Context) (func(context.Context) error, error) {
	exporter, err := otlptracehttp.New(ctx)
	if err != nil {
		return nil, fmt.Errorf("creating OTLP exporter: %w", err)
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(resource.NewWithAttributes(
			semconv.SchemaURL,
			semconv.ServiceNameKey.String("perspectize-backend"),
		)),
	)
	otel.SetTracerProvider(tp)
	return tp.Shutdown, nil
}
