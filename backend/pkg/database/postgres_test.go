package database

import (
	"testing"
	"time"
)

func TestDefaultPoolConfigKeepsConnectionsWarm(t *testing.T) {
	cfg := DefaultPoolConfig()
	if cfg.MaxIdleConns < 10 {
		t.Errorf("MaxIdleConns = %d: too few idle connections means new handshakes after every burst", cfg.MaxIdleConns)
	}
	if cfg.MaxIdleConns > cfg.MaxOpenConns {
		t.Errorf("MaxIdleConns %d > MaxOpenConns %d", cfg.MaxIdleConns, cfg.MaxOpenConns)
	}
	if cfg.ConnMaxLifetime < 30*time.Minute {
		t.Errorf("ConnMaxLifetime = %s: short lifetimes re-dial and drop the statement cache", cfg.ConnMaxLifetime)
	}
	if cfg.ConnMaxIdleTime <= 0 {
		t.Error("ConnMaxIdleTime must be set so idle connections are trimmed when traffic stops")
	}
}

func TestPoolConfigFromEnvOverrides(t *testing.T) {
	t.Setenv("DB_MAX_OPEN_CONNS", "40")
	t.Setenv("DB_MAX_IDLE_CONNS", "20")
	t.Setenv("DB_CONN_MAX_LIFETIME", "1h")
	t.Setenv("DB_CONN_MAX_IDLE_TIME", "2m")
	cfg := PoolConfigFromEnv()
	if cfg.MaxOpenConns != 40 || cfg.MaxIdleConns != 20 || cfg.ConnMaxLifetime != time.Hour || cfg.ConnMaxIdleTime != 2*time.Minute {
		t.Fatalf("env overrides not applied: %+v", cfg)
	}
}
