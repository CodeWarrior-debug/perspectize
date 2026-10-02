package database_test

import (
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/pkg/database"
	"github.com/stretchr/testify/assert"
)

func TestDefaultPoolConfig_Values(t *testing.T) {
	cfg := database.DefaultPoolConfig()

	assert.Equal(t, 25, cfg.MaxOpenConns)
	assert.Equal(t, 5, cfg.MaxIdleConns)
	assert.Equal(t, 5*time.Minute, cfg.ConnMaxLifetime)
}

func TestPoolConfigFromEnv_UnsetUsesDefaults(t *testing.T) {
	t.Setenv("DB_MAX_OPEN_CONNS", "")
	t.Setenv("DB_MAX_IDLE_CONNS", "")
	t.Setenv("DB_CONN_MAX_LIFETIME", "")

	assert.Equal(t, database.DefaultPoolConfig(), database.PoolConfigFromEnv())
	assert.Equal(t, 5*time.Minute, database.PoolConfigFromEnv().ConnMaxLifetime)
}
