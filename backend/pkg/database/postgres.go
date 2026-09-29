package database

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	gormPostgres "gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// PoolConfig holds database connection pool configuration
type PoolConfig struct {
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
	ConnMaxIdleTime time.Duration
}

// DefaultPoolConfig returns sensible default pool settings
func DefaultPoolConfig() PoolConfig {
	return PoolConfig{
		MaxOpenConns: 25,
		// GraphQL resolvers run concurrently, so one request can hold several
		// connections at once. With only 5 kept idle, the rest were closed
		// after every burst and the next burst paid new TCP + TLS handshakes
		// to the (remote) database. Keep a working set warm instead, and let
		// ConnMaxIdleTime trim it when traffic actually stops.
		MaxIdleConns:    15,
		ConnMaxIdleTime: 10 * time.Minute,
		// Long enough that a warm connection (TLS session + pgx's prepared
		// statement cache) survives between requests on a quiet app; every
		// recycle costs a fresh handshake to the database on the next query.
		ConnMaxLifetime: 30 * time.Minute,
	}
}

// PoolConfigFromEnv reads pool config from environment variables with defaults
func PoolConfigFromEnv() PoolConfig {
	cfg := DefaultPoolConfig()

	if maxOpen := os.Getenv("DB_MAX_OPEN_CONNS"); maxOpen != "" {
		if val, err := strconv.Atoi(maxOpen); err == nil && val > 0 {
			cfg.MaxOpenConns = val
		}
	}

	if maxIdle := os.Getenv("DB_MAX_IDLE_CONNS"); maxIdle != "" {
		if val, err := strconv.Atoi(maxIdle); err == nil && val > 0 {
			cfg.MaxIdleConns = val
		}
	}

	if lifetime := os.Getenv("DB_CONN_MAX_LIFETIME"); lifetime != "" {
		if val, err := time.ParseDuration(lifetime); err == nil && val > 0 {
			cfg.ConnMaxLifetime = val
		}
	}

	if idle := os.Getenv("DB_CONN_MAX_IDLE_TIME"); idle != "" {
		if val, err := time.ParseDuration(idle); err == nil && val > 0 {
			cfg.ConnMaxIdleTime = val
		}
	}

	return cfg
}

// Option customizes ConnectGORM.
type Option func(*connectOptions)

type connectOptions struct {
	tracer pgx.QueryTracer
}

// WithTracer attaches a pgx tracer to every connection (see StatementCounter).
func WithTracer(t pgx.QueryTracer) Option {
	return func(o *connectOptions) { o.tracer = t }
}

// ConnectGORM creates a new PostgreSQL database connection using GORM
func ConnectGORM(dsn string, pool PoolConfig, opts ...Option) (*gorm.DB, error) {
	var o connectOptions
	for _, opt := range opts {
		opt(&o)
	}

	// Open raw sql.DB with the pgx driver
	connCfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to parse database DSN: %w", err)
	}
	if o.tracer != nil {
		connCfg.Tracer = o.tracer
	}
	sqlDB := stdlib.OpenDB(*connCfg)

	// Configure pool on the raw connection
	sqlDB.SetMaxOpenConns(pool.MaxOpenConns)
	sqlDB.SetMaxIdleConns(pool.MaxIdleConns)
	sqlDB.SetConnMaxLifetime(pool.ConnMaxLifetime)
	sqlDB.SetConnMaxIdleTime(pool.ConnMaxIdleTime)

	// Wrap with GORM
	gormDB, err := gorm.Open(gormPostgres.New(gormPostgres.Config{
		Conn: sqlDB,
	}), &gorm.Config{
		// GORM otherwise wraps every single Create/Update/Delete in its own
		// BEGIN ... COMMIT: two extra round trips to the database per write,
		// for statements that are already atomic on their own. We use no
		// associations or hooks that would need it; multi-statement work uses
		// an explicit db.Transaction(...), which is unaffected.
		SkipDefaultTransaction: true,
	})
	if err != nil {
		sqlDB.Close()
		return nil, fmt.Errorf("failed to initialize GORM: %w", err)
	}

	return gormDB, nil
}

// PingGORM checks if the GORM database connection is alive
func PingGORM(ctx context.Context, db *gorm.DB) error {
	sqlDB, err := db.DB()
	if err != nil {
		return fmt.Errorf("failed to get underlying DB: %w", err)
	}
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	if err := sqlDB.PingContext(ctx); err != nil {
		return fmt.Errorf("database ping failed: %w", err)
	}
	return nil
}
