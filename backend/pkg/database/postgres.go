package database

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"strconv"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	gormPostgres "gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// PoolConfig holds database connection pool configuration
type PoolConfig struct {
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
}

// DefaultPoolConfig returns sensible default pool settings
func DefaultPoolConfig() PoolConfig {
	return PoolConfig{
		MaxOpenConns: 25,
		MaxIdleConns: 5,
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

	return cfg
}

// ConnectGORM creates a new PostgreSQL database connection using GORM
func ConnectGORM(dsn string, pool PoolConfig) (*gorm.DB, error) {
	// Open raw sql.DB with pgx driver (reuse existing driver)
	sqlDB, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Configure pool on the raw connection
	sqlDB.SetMaxOpenConns(pool.MaxOpenConns)
	sqlDB.SetMaxIdleConns(pool.MaxIdleConns)
	sqlDB.SetConnMaxLifetime(pool.ConnMaxLifetime)

	// Wrap with GORM
	gormDB, err := gorm.Open(gormPostgres.New(gormPostgres.Config{
		Conn: sqlDB,
	}), &gorm.Config{})
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
