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

	"github.com/99designs/gqlgen/graphql/playground"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/auth"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/realtime"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/repositories/cached"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/repositories/postgres"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/web/handlers"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/wikidata"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/youtube"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/config"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/server"
	"github.com/CodeWarrior-debug/perspectize/backend/pkg/database"
	"github.com/CodeWarrior-debug/perspectize/backend/pkg/logger"
	"github.com/CodeWarrior-debug/perspectize/backend/pkg/telemetry"
	"github.com/clerk/clerk-sdk-go/v2"
	"github.com/go-chi/chi/v5"
	"github.com/joho/godotenv"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	otelruntime "go.opentelemetry.io/contrib/instrumentation/runtime"
	"go.opentelemetry.io/otel"
	"gorm.io/gorm"
)

func main() {
	// Configure structured JSON logging for Sevalla log viewer
	logger.Setup()

	// Load .env file
	if err := godotenv.Load(); err != nil {
		if os.Getenv("APP_ENV") != "production" {
			slog.Warn(".env file not found", "hint", "set APP_ENV=production to suppress")
		}
	}

	// Initialize OpenTelemetry (Tracer/Meter/Logger providers). This is a
	// no-op, warn-and-continue setup: when OTEL_EXPORTER_OTLP_ENDPOINT is
	// unset (local dev, CI), telemetry.Setup leaves the default no-op
	// providers in place and returns a no-op shutdown.
	telemetryShutdown, err := telemetry.Setup(context.Background(), telemetry.Config{
		Environment: os.Getenv("APP_ENV"),
	})
	if err != nil {
		slog.Warn("failed to initialize OpenTelemetry", "error", err)
	} else {
		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := telemetryShutdown(ctx); err != nil {
				slog.Warn("failed to shut down OpenTelemetry", "error", err)
			}
		}()
		if telemetry.Enabled() {
			// stdout JSON stays as-is; Info+ records are also exported via OTLP.
			logger.EnableOTLP(nil)
			if err := otelruntime.Start(otelruntime.WithMeterProvider(otel.GetMeterProvider())); err != nil {
				slog.Warn("go runtime metrics not started", "error", err)
			}
			if _, err := telemetry.RegisterBuildInfo(telemetry.Meter()); err != nil {
				slog.Warn("app.build.info metric not registered", "error", err)
			}
			slog.Info("OpenTelemetry enabled")
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

	// Pool gauges (idle/used/max/wait) — no-op until a MeterProvider is installed.
	if _, err := database.RegisterPoolMetrics(telemetry.Meter(), sqlDB); err != nil {
		slog.Warn("db pool metrics not registered", "error", err)
	}

	// Register slow query logger (logs queries >100ms)
	database.RegisterSlowQueryLogger(db)

	// Register the in-house GORM tracing callbacks: one span per SQL
	// statement, no bind-variable recording (db.query.text is always the
	// parameterized statement, never Dialector.Explain()'d). Warn-and-
	// continue: a failure here must not prevent the server from starting.
	if err := instrumentDB(db); err != nil {
		slog.Warn("gorm tracing callbacks not registered", "error", err)
	}

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
	// Demo mode (DEMO_MODE=true, refused in production): seeded personas sign
	// in with "Bearer demo.<persona>" and YouTube metadata comes from offline
	// fixtures, so tours, recordings and E2E runs need no external accounts.
	demoCfg, err := config.LoadDemo()
	if err != nil {
		log.Fatal(err)
	}
	var youtubeClient portservices.YouTubeClient
	if demoCfg.Enabled {
		slog.Warn("DEMO MODE ENABLED — unsigned demo.<persona> tokens are accepted; never expose this instance publicly with real data")
		youtubeClient = youtube.NewFixtureClient()
	} else {
		youtubeClient = youtube.NewCachingClient(
			youtube.NewClient(cfg.YouTube.APIKey),
			time.Duration(cfg.YouTube.CacheTTLSeconds)*time.Second,
		)
		slog.Info("YouTube API cache configured", "ttlSeconds", cfg.YouTube.CacheTTLSeconds)
	}
	wikidataClient := wikidata.NewClient()
	contentRepo := postgres.NewGormContentRepository(db)
	// Cached: the auth middleware resolves the Clerk ID -> user on every
	// authenticated request. All user writes go through this same instance so
	// they invalidate it (see cached.UserRepository).
	userRepo := cached.NewUserRepository(postgres.NewGormUserRepository(db), cached.DefaultUserTTL)
	perspectiveRepo := postgres.NewGormPerspectiveRepository(db)
	// Cached: the content grid resolves every row's primaryCategory through it.
	categoryRepo := cached.NewCategoryRepository(postgres.NewGormCategoryRepository(db), cached.DefaultCategoryTTL)
	threadRepo := postgres.NewGormThreadRepository(db)
	messageRepo := postgres.NewGormMessageRepository(db)
	bibleReferenceRepo := postgres.NewGormBibleReferenceRepository(db)
	buildInfoRepo := postgres.NewGormBuildInfoRepository(db)

	// Initialize services
	contentService := services.NewContentService(contentRepo, youtubeClient, services.WithBibleReference(bibleReferenceRepo))
	userService := services.NewUserService(userRepo, contentRepo, perspectiveRepo)
	perspectiveService := services.NewPerspectiveService(perspectiveRepo, userRepo)
	categoryService := services.NewCategoryService(categoryRepo, contentRepo, wikidataClient)
	buildInfoService := services.NewBuildInfoService(buildInfoRepo)

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
	var tokenVerifier portservices.TokenVerifier = auth.NewClerkTokenVerifier()
	if demoCfg.Enabled {
		tokenVerifier = auth.NewDemoTokenVerifier(tokenVerifier)
	}

	// GraphQL server + API middleware stack (shared with test/roundtrips).
	apiDeps := server.Deps{
		ContentService:      contentService,
		UserService:         userService,
		PerspectiveService:  perspectiveService,
		CategoryService:     categoryService,
		MessagingService:    messagingService,
		UserRepo:            userRepo,
		ThreadRepo:          threadRepo,
		Hub:                 hub,
		Presence:            presence,
		TokenVerifier:       tokenVerifier,
		CORSOrigins:         secCfg.CORSOrigins,
		RateLimitPerMin:     secCfg.RateLimitPerMin,
		EnableIntrospection: os.Getenv("APP_ENV") != "production",
	}
	srv := server.NewGraphQLServer(apiDeps)

	// Setup chi router
	r := chi.NewRouter()
	for _, mw := range server.Middleware(apiDeps) {
		r.Use(mw)
	}

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

	// Build/deploy info — unauthenticated, like /health and /ready. Backs the
	// frontend's zzzv console hotkey.
	r.Get("/version", handlers.Version(buildInfoService))

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
		Handler:      withTracing(r), // chi router, wrapped in an otelhttp root span
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

// withTracing wraps h in an otelhttp root span per request. WebSocket
// handshakes are excluded (a span held open for the life of a subscription
// would be useless), as are /health and /ready, which are polled far too
// often to be worth a span each. The span name is "METHOD path" — the route
// set is small and static (/graphql, /webhooks/clerk), so this doesn't
// create high cardinality.
func withTracing(h http.Handler) http.Handler {
	return otelhttp.NewHandler(h, "http.server",
		otelhttp.WithFilter(func(req *http.Request) bool {
			if isWebsocketHandshake(req) {
				return false
			}
			return req.URL.Path != "/health" && req.URL.Path != "/ready"
		}),
		otelhttp.WithSpanNameFormatter(func(_ string, req *http.Request) string {
			return req.Method + " " + req.URL.Path
		}),
	)
}

// instrumentDB registers the in-house GORM tracing callbacks (pkg/database):
// one span per SQL statement, query bind variables never recorded. A nil
// TracerProvider means the callbacks resolve otel.GetTracerProvider() (or
// the specific provider passed) lazily on every call, so this can run
// before telemetry.Setup installs the global provider.
func instrumentDB(db *gorm.DB) error {
	return database.RegisterTracing(db, nil)
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
